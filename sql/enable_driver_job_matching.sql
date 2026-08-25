-- Enables the driver-side job feed and accept flow for delivery_requests.
--
-- Two problems this fixes:
--
-- 1. The existing SELECT policy on delivery_requests only allows a row's
--    owner (auth_id = auth.uid()) to read it. That means the driver job
--    feed (queries status=eq.pending) silently returns zero rows for any
--    driver, since a driver is never the auth_id of a contractor's
--    request. PostgREST/RLS filters this out with no error, so it just
--    looks like "no jobs available" forever. This adds a policy so any
--    authenticated user can see pending requests, and so an assigned
--    driver can keep seeing the request they accepted.
--
-- 2. There is no way for a driver to claim ("accept") a request. Rather
--    than widen the general UPDATE policy (which would let any
--    authenticated user rewrite pickup/dropoff/material fields on
--    someone else's request, not just claim it), this adds a narrow
--    SECURITY DEFINER function that does exactly one guarded update:
--    set assigned_driver_id = the caller and status = 'assigned', only
--    on a row that is currently 'pending'. The function itself is the
--    security boundary, so no broader UPDATE policy is needed for
--    drivers at all.

-- Any authenticated user (i.e. any driver) can see open jobs.
CREATE POLICY "Authenticated users can view pending delivery requests"
  ON delivery_requests
  FOR SELECT
  USING (status = 'pending');

-- A driver can keep seeing a request once it's assigned to them.
CREATE POLICY "Assigned drivers can view their assigned delivery requests"
  ON delivery_requests
  FOR SELECT
  USING (assigned_driver_id = auth.uid());

-- Atomically claim a pending request. Returns the updated row, or zero
-- rows if it was already taken (status was no longer 'pending' by the
-- time this ran) — callers should treat an empty result as "already
-- accepted by someone else," not an error.
CREATE OR REPLACE FUNCTION accept_delivery_request(p_request_id UUID)
RETURNS SETOF delivery_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to accept a delivery request';
  END IF;

  RETURN QUERY
  UPDATE delivery_requests
  SET assigned_driver_id = auth.uid(),
      status = 'assigned',
      updated_at = NOW()
  WHERE id = p_request_id
    AND status = 'pending'
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_delivery_request(UUID) TO authenticated;
