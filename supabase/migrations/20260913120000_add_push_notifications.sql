-- Push notifications for delivery status changes.
--
-- Today a contractor only learns their request was accepted by opening
-- the app and refreshing. This sends them a notification instead.

-- One token per user rather than a device_tokens table: a driver or
-- contractor uses one phone, and the extra table would buy multi-device
-- support nobody has asked for. Signing in on a second device overwrites
-- the first, which is the accepted tradeoff - revisit if it bites.
--
-- No RPC needed to write it: the "Users can update their own profile"
-- policy from 20260825003703 already lets a user set this on their own
-- row, and the token is not sensitive enough to warrant narrowing
-- further (it can only be used to send that device a notification).
ALTER TABLE users ADD COLUMN IF NOT EXISTS expo_push_token TEXT;

-- pg_net lets Postgres make outbound HTTP calls, which is what allows a
-- trigger to reach Expo's push API directly. The alternative is a
-- database webhook into an Edge Function - better logging and retries,
-- but a whole new deployment surface for what is currently one HTTP
-- POST. Worth revisiting if delivery failures ever need investigating,
-- since the failure mode here is quiet.
CREATE EXTENSION IF NOT EXISTS pg_net;

/**
 * Notify the contractor when their delivery is accepted or completed.
 *
 * Deliberately not notifying on every status change: 'in_transit' is
 * visible in the app and a third push per delivery is how people turn
 * notifications off.
 */
CREATE OR REPLACE FUNCTION notify_contractor_of_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, net
AS $$
DECLARE
  v_token TEXT;
  v_title TEXT;
  v_body TEXT;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'assigned' THEN
    v_title := 'Driver assigned';
    v_body := 'A driver accepted your ' || COALESCE(NEW.material_category, 'delivery') || ' request.';
  ELSIF NEW.status = 'completed' THEN
    v_title := 'Delivery complete';
    v_body := 'Your ' || COALESCE(NEW.material_category, 'delivery') || ' has been delivered.';
  ELSE
    RETURN NEW;
  END IF;

  -- users.auth_id is TEXT while delivery_requests.auth_id is UUID - the
  -- schema drift documented in 20260825003703 - so this comparison has
  -- to cast or it fails with "operator does not exist: text = uuid".
  SELECT expo_push_token INTO v_token
  FROM users
  WHERE auth_id = NEW.auth_id::text;

  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

  -- Fire and forget. A failed send must never roll back the status
  -- change that triggered it: the delivery genuinely advanced, and
  -- losing that because a push failed would be far worse than a missed
  -- notification. pg_net queues the request and returns immediately.
  PERFORM net.http_post(
    url := 'https://exp.host/--/api/v2/push/send',
    headers := '{"Content-Type": "application/json", "Accept": "application/json"}'::jsonb,
    body := jsonb_build_object(
      'to', v_token,
      'title', v_title,
      'body', v_body,
      'sound', 'default',
      'data', jsonb_build_object('requestId', NEW.id, 'status', NEW.status)
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS delivery_request_status_notification ON delivery_requests;

CREATE TRIGGER delivery_request_status_notification
  AFTER UPDATE OF status ON delivery_requests
  FOR EACH ROW
  EXECUTE FUNCTION notify_contractor_of_status_change();
