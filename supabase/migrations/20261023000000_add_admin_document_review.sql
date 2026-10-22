-- Review driver documents from inside the app, as an admin.
--
-- Reviewing in the Supabase dashboard meant reading a row in one place,
-- finding the file in another, and editing a third - and the dashboard
-- couldn't preview the files at all. This gives admins a queue, the
-- image, and approve/reject in the app.
--
-- That makes "admin" mean something for the first time, so the role has
-- to stop being self-assignable: until now anyone could pick Admin at
-- signup. It was harmless only because admin could do nothing.
--
-- To make someone an admin (dashboard SQL editor):
--
--   update users set role = 'admin' where email = '<their email>';
--
-- They can't do this themselves: role isn't in the users UPDATE grant
-- (20261019000000), and the INSERT policy below refuses it at signup.

-- ---------------------------------------------------------------------
-- 1. Admin is granted, not chosen
-- ---------------------------------------------------------------------

DROP POLICY IF EXISTS "Users can create their own profile" ON users;

CREATE POLICY "Users can create their own profile"
  ON users
  FOR INSERT
  WITH CHECK (auth_id = auth.uid()::text AND role IN ('contractor', 'driver'));

-- The one definition every admin-only path below checks. Reads users
-- rather than trusting anything in the JWT: user_metadata is writable by
-- the user themselves.
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION is_admin() TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Reading the queue and the files
-- ---------------------------------------------------------------------

-- Who made each decision. Worth having before the first decision rather
-- than after the first dispute about one.
ALTER TABLE driver_documents ADD COLUMN IF NOT EXISTS reviewed_by UUID REFERENCES auth.users(id);

-- The dashboard-only view from 20261022000000, served to admins. The view
-- stays revoked from app roles; this function is the only way in.
CREATE OR REPLACE FUNCTION get_document_review_queue()
RETURNS SETOF document_review_queue
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can review documents' USING HINT = 'not_admin';
  END IF;

  RETURN QUERY SELECT * FROM document_review_queue;
END;
$$;

GRANT EXECUTE ON FUNCTION get_document_review_queue() TO authenticated;

-- Admins can read any driver's files. This is what lets the app request
-- a short-lived signed URL to display one; drivers still see only their
-- own folder (20261019000000).
CREATE POLICY "Admins can view all driver documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (bucket_id = 'driver-documents' AND is_admin());

-- ---------------------------------------------------------------------
-- 3. Deciding
-- ---------------------------------------------------------------------

-- Approve or reject one pending document.
--
-- p_storage_path is the file the reviewer actually looked at. If the
-- driver uploaded a replacement while the reviewer had the old one open,
-- the path no longer matches and nothing is updated - otherwise an
-- approval could land on a file nobody has seen. Zero rows back means
-- "this changed underneath you; reload".
--
-- Approval requires an expiry date that hasn't passed: licenses,
-- registrations, and insurance all carry one, and a missing date is how
-- a lapsed policy would go on counting forever. Rejection requires a
-- reason, because the driver is told it and has to act on it.
CREATE OR REPLACE FUNCTION review_driver_document(
  p_document_id UUID,
  p_storage_path TEXT,
  p_decision TEXT,
  p_expires_on DATE DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS SETOF driver_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_admin() THEN
    RAISE EXCEPTION 'Only admins can review documents' USING HINT = 'not_admin';
  END IF;

  IF p_decision = 'approved' THEN
    IF p_expires_on IS NULL OR p_expires_on < CURRENT_DATE THEN
      RAISE EXCEPTION 'Approval needs an expiry date that has not passed'
        USING HINT = 'expiry_required';
    END IF;
  ELSIF p_decision = 'rejected' THEN
    IF NULLIF(TRIM(p_reason), '') IS NULL THEN
      RAISE EXCEPTION 'Rejection needs a reason' USING HINT = 'reason_required';
    END IF;
  ELSE
    RAISE EXCEPTION 'Decision must be approved or rejected';
  END IF;

  -- reviewed_at is stamped by the trigger from 20261019000000, and the
  -- driver's push goes out from 20261022000000's - both fire on this.
  RETURN QUERY
  UPDATE driver_documents
  SET status = p_decision,
      expires_on = CASE WHEN p_decision = 'approved' THEN p_expires_on END,
      rejection_reason = CASE WHEN p_decision = 'rejected' THEN TRIM(p_reason) END,
      reviewed_by = auth.uid()
  WHERE id = p_document_id
    AND storage_path = p_storage_path
    AND status = 'pending'
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION review_driver_document(UUID, TEXT, TEXT, DATE, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Point the Slack alert at the app
-- ---------------------------------------------------------------------

-- Same as 20261022000000 except the last line, which sent reviewers to a
-- dashboard that couldn't show them the file.
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
  -- upload gets a fresh storage path. A reviewer's decision must not
  -- alert the channel about their own edit.
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

  PERFORM net.http_post(
    url := v_webhook,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'text', format(
        E':page_facing_up: *Document to review*\n%s uploaded %s %s.\nReview it in the app under *Review*.',
        v_name,
        CASE WHEN v_replacement THEN 'a replacement' ELSE 'their' END,
        driver_document_label(NEW.doc_type)
      ),
      'unfurl_links', false,
      'unfurl_media', false
    )
  );

  RETURN NEW;
END;
$$;
