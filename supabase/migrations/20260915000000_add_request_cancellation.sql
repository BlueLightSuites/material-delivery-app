-- Contractor-side cancellation, and a much narrower update policy.
--
-- Two problems this fixes.
--
-- 1. A contractor could not cancel a request at all. Once submitted, the
--    only way out was asking someone to delete the row by hand.
--
-- 2. The original UPDATE policy was far wider than anything the app
--    needs:
--
--      USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid())
--
--    That allows a contractor to change any column on their own request
--    at any status - including setting status back to 'pending' on a job
--    in transit, or clearing assigned_driver_id to unassign a driver
--    mid-delivery. Nothing in the app does that, but the REST API is
--    open to anyone holding their own token, so the policy is the only
--    thing standing in the way.

-- Editing is now limited to requests that are still pending, and the row
-- has to still be pending afterwards. The WITH CHECK is what stops a
-- contractor writing their own status transitions: they can correct an
-- address or a weight before anyone accepts, and nothing else.
--
-- Cancellation therefore cannot go through this policy at all - it has
-- to change status, which this forbids by design. It goes through the
-- function below instead.
DROP POLICY IF EXISTS "Users can update their own delivery requests" ON delivery_requests;

CREATE POLICY "Users can update their own pending delivery requests"
  ON delivery_requests
  FOR UPDATE
  USING (auth_id = auth.uid() AND status = 'pending')
  WITH CHECK (auth_id = auth.uid() AND status = 'pending');

-- Cancel a request the caller owns.
--
-- Allowed while 'pending' (nobody is affected) and while 'assigned' (a
-- driver has committed but hasn't loaded yet, so they can be told and
-- move on). Deliberately not allowed once 'in_transit': at that point
-- the driver is physically carrying the load, and "cancelled" is not a
-- state the real world can be put back into by an app.
--
-- SECURITY DEFINER for the same reason as the driver-side functions: the
-- narrow, audited operation is the security boundary, rather than an
-- UPDATE policy broad enough to allow it.
CREATE OR REPLACE FUNCTION cancel_delivery_request(p_request_id UUID)
RETURNS SETOF delivery_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to cancel a delivery request';
  END IF;

  RETURN QUERY
  UPDATE delivery_requests
  SET status = 'cancelled',
      updated_at = NOW(),
      -- The driver's position is no business of the contractor once the
      -- job is off, same as on completion.
      driver_lat = NULL,
      driver_lng = NULL,
      driver_location_updated_at = NULL
  WHERE id = p_request_id
    AND auth_id = auth.uid()
    AND status IN ('pending', 'assigned')
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION cancel_delivery_request(UUID) TO authenticated;

-- Extend the status-change notification to cover cancellation.
--
-- Cancellation is the one transition where the person who needs telling
-- is the driver, not the contractor: the contractor pressed the button,
-- while the driver may be on their way to a pickup that no longer
-- exists. Leaving them to discover it on arrival is the worst version of
-- this feature.
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
  v_recipient UUID;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NEW;
  END IF;

  IF NEW.status = 'assigned' THEN
    v_recipient := NEW.auth_id;
    v_title := 'Driver assigned';
    v_body := 'A driver accepted your ' || COALESCE(NEW.material_category, 'delivery') || ' request.';
  ELSIF NEW.status = 'completed' THEN
    v_recipient := NEW.auth_id;
    v_title := 'Delivery complete';
    v_body := 'Your ' || COALESCE(NEW.material_category, 'delivery') || ' has been delivered.';
  ELSIF NEW.status = 'cancelled' THEN
    -- Only worth sending if a driver had actually committed; a request
    -- cancelled while still pending affects nobody.
    v_recipient := NEW.assigned_driver_id;
    v_title := 'Job cancelled';
    v_body := 'The contractor cancelled the ' || COALESCE(NEW.material_category, 'delivery') || ' job you accepted.';
  ELSE
    RETURN NEW;
  END IF;

  IF v_recipient IS NULL THEN
    RETURN NEW;
  END IF;

  -- users.auth_id is TEXT while these columns are UUID - the drift
  -- documented in 20260825003703 - so this has to cast.
  SELECT expo_push_token INTO v_token
  FROM users
  WHERE auth_id = v_recipient::text;

  IF v_token IS NULL THEN
    RETURN NEW;
  END IF;

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
