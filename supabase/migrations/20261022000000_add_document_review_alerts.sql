-- Tell reviewers when a driver document needs review, and tell the
-- driver when it has been reviewed.
--
-- Before this, an upload landed in storage and nobody knew: a reviewer
-- had to remember to check the dashboard, and a driver had to keep
-- reopening the app to find out whether they'd been approved.
--
-- Reviewers are alerted in Slack. The alert carries who and what, never
-- the document: Slack unfurls links into previews it stores on its own
-- servers, which would put copies of licenses and insurance cards in
-- every channel member's history under Slack's retention rather than
-- ours. The review itself still happens in the Supabase dashboard,
-- behind its login.
--
-- Setup (once, in the dashboard's SQL editor - never in a migration,
-- since this repository is public and anyone holding the webhook URL can
-- post to the channel):
--
--   select vault.create_secret('<slack webhook url>', 'slack_document_review_webhook');
--
-- Until that secret exists, submissions still work; they just alert
-- nobody.

CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE OR REPLACE FUNCTION driver_document_label(p_doc_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_doc_type
    WHEN 'license' THEN 'driver''s license'
    WHEN 'registration' THEN 'vehicle registration'
    WHEN 'insurance' THEN 'proof of insurance'
    ELSE p_doc_type
  END;
$$;

-- ---------------------------------------------------------------------
-- Reviewer alert
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_reviewers_of_driver_document()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_webhook TEXT;
  v_name TEXT;
  v_replacement BOOLEAN := TG_OP = 'UPDATE';
BEGIN
  -- Only a driver's submission, which always brings a new file - every
  -- upload gets a fresh storage path. A reviewer editing the row
  -- (setting status, expiry, a reason) must not alert the channel about
  -- their own edit.
  IF NEW.status <> 'pending'
     OR (TG_OP = 'UPDATE' AND NEW.storage_path IS NOT DISTINCT FROM OLD.storage_path) THEN
    RETURN NEW;
  END IF;

  SELECT decrypted_secret INTO v_webhook
  FROM vault.decrypted_secrets
  WHERE name = 'slack_document_review_webhook';

  IF v_webhook IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_name FROM users WHERE auth_id = NEW.driver_auth_id::text;

  -- The name is whatever the driver typed at signup. Slack treats <, >
  -- and & as markup (<!channel> pings everyone), so escape them.
  v_name := replace(replace(replace(COALESCE(NULLIF(v_name, ''), 'A driver'),
    '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  -- Fire and forget, same as push notifications: a failed alert must
  -- never roll back the driver's submission.
  PERFORM net.http_post(
    url := v_webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'text', format(
        E':page_facing_up: *Document to review*\n%s uploaded %s %s.\n<%s|Open the review queue> · driver `%s`',
        v_name,
        CASE WHEN v_replacement THEN 'a replacement' ELSE 'their' END,
        driver_document_label(NEW.doc_type),
        'https://supabase.com/dashboard/project/suinlnpdaxcdsqaqqkbu/editor',
        NEW.driver_auth_id
      ),
      'unfurl_links', false,
      'unfurl_media', false
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS driver_documents_notify_reviewers ON driver_documents;

CREATE TRIGGER driver_documents_notify_reviewers
  AFTER INSERT OR UPDATE ON driver_documents
  FOR EACH ROW
  EXECUTE FUNCTION notify_reviewers_of_driver_document();

-- ---------------------------------------------------------------------
-- Review queue
-- ---------------------------------------------------------------------

-- Everything waiting, oldest first, with what a reviewer needs to check
-- it against: the name to match on the license, and the vehicle to
-- match on the registration. To review, find the file under Storage >
-- driver-documents at storage_path, then edit the driver_documents row
-- with the same id: status, expires_on, and rejection_reason when
-- rejecting.
--
-- security_invoker so it runs with the reader's own rights, and revoked
-- from app roles, so the REST API can't serve other drivers' details
-- through it. Only the dashboard can read it.
CREATE OR REPLACE VIEW document_review_queue
WITH (security_invoker = true)
AS
SELECT
  d.id,
  d.submitted_at,
  u.name AS driver_name,
  u.email AS driver_email,
  d.doc_type,
  d.storage_path,
  u.vehicle_type,
  u.has_trailer,
  u.trailer_capacity_lbs,
  d.driver_auth_id
FROM driver_documents d
LEFT JOIN users u ON u.auth_id = d.driver_auth_id::text
WHERE d.status = 'pending'
ORDER BY d.submitted_at;

REVOKE ALL ON document_review_queue FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- Driver notification
-- ---------------------------------------------------------------------

CREATE OR REPLACE FUNCTION notify_driver_of_document_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_token TEXT;
  v_title TEXT;
  v_body TEXT;
  v_label TEXT := driver_document_label(NEW.doc_type);
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.status = 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT expo_push_token INTO v_token
  FROM users
  WHERE auth_id = NEW.driver_auth_id::text;

  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'rejected' THEN
    v_title := 'Document needs attention';
    v_body := 'Your ' || v_label || ' wasn''t approved'
      || COALESCE(': ' || NULLIF(TRIM(NEW.rejection_reason), ''), '')
      || '. Please upload it again.';
  -- The approval that completes verification gets the message that
  -- matters - "you can work now" - rather than a third "approved".
  -- Inline rather than is_verified_driver(), which answers for
  -- auth.uid(), and there is no driver session in a reviewer's edit.
  ELSIF (
    SELECT COUNT(*) FROM driver_documents
    WHERE driver_auth_id = NEW.driver_auth_id
      AND status = 'approved'
      AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
  ) = 3 AND EXISTS (
    SELECT 1 FROM users
    WHERE auth_id = NEW.driver_auth_id::text AND role = 'driver' AND vehicle_type IS NOT NULL
  ) THEN
    v_title := 'You''re verified';
    v_body := 'All your documents are approved. You can start accepting jobs.';
  ELSE
    v_title := 'Document approved';
    v_body := 'Your ' || v_label || ' was approved.';
  END IF;

  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', v_token,
      'title', v_title,
      'body', v_body,
      'sound', 'default',
      'data', jsonb_build_object('screen', 'DriverVerification')
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS driver_documents_notify_driver ON driver_documents;

CREATE TRIGGER driver_documents_notify_driver
  AFTER UPDATE OF status ON driver_documents
  FOR EACH ROW
  EXECUTE FUNCTION notify_driver_of_document_review();
