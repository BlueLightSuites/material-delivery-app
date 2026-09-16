-- Let a driver acknowledge a cancelled job, so the notice can persist
-- until they've actually seen it.
--
-- Cancellation was only communicated in the instant it happened: a push
-- (which can't reach a simulator, a driver who declined notifications,
-- or a phone that's offline) and an in-app alert that only fired if the
-- driver happened to be on that screen. Miss the moment and the job just
-- vanished from the list with no explanation, which reads as "did I lose
-- it?" rather than "it was called off".
--
-- Acknowledgement is stored server-side rather than on the device so it
-- survives a reinstall, is consistent if the driver uses more than one
-- device, and leaves a record that they were informed - which matters if
-- a wasted trip is ever disputed.
ALTER TABLE delivery_requests
  ADD COLUMN IF NOT EXISTS driver_ack_cancelled_at TIMESTAMP WITH TIME ZONE;

-- Drivers have no UPDATE access to delivery_requests, so this follows the
-- same guarded SECURITY DEFINER pattern as the other driver actions:
-- one column, only on a cancelled job, only by the driver it was
-- assigned to.
CREATE OR REPLACE FUNCTION acknowledge_cancelled_job(p_request_id UUID)
RETURNS SETOF delivery_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to acknowledge a cancellation';
  END IF;

  RETURN QUERY
  UPDATE delivery_requests
  SET driver_ack_cancelled_at = NOW()
  WHERE id = p_request_id
    AND assigned_driver_id = auth.uid()
    AND status = 'cancelled'
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION acknowledge_cancelled_job(UUID) TO authenticated;
