-- Lets an assigned driver advance a delivery request through its lifecycle
-- (assigned -> in_transit -> completed) from the job detail screen.
--
-- The general "Users can update their own delivery requests" policy on
-- delivery_requests only matches auth_id = auth.uid(), i.e. the contractor
-- who created the request - a driver is never that row's auth_id, so they
-- have no UPDATE access at all today. Rather than add a broad UPDATE
-- policy for drivers (which would let them rewrite pickup/dropoff/material
-- fields on a job they're merely assigned to), this follows the same
-- pattern as accept_delivery_request in enable_driver_job_matching.sql: a
-- narrow SECURITY DEFINER function that only moves `status` forward one
-- step, and only for the driver the job is actually assigned to.

CREATE OR REPLACE FUNCTION advance_delivery_status(p_request_id UUID, p_next_status TEXT)
RETURNS SETOF delivery_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_current TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to update a delivery request';
  END IF;

  v_expected_current := CASE p_next_status
    WHEN 'in_transit' THEN 'assigned'
    WHEN 'completed' THEN 'in_transit'
    ELSE NULL
  END;

  IF v_expected_current IS NULL THEN
    RAISE EXCEPTION 'Invalid status transition to %', p_next_status;
  END IF;

  RETURN QUERY
  UPDATE delivery_requests
  SET status = p_next_status,
      updated_at = NOW()
  WHERE id = p_request_id
    AND assigned_driver_id = auth.uid()
    AND status = v_expected_current
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION advance_delivery_status(UUID, TEXT) TO authenticated;
