-- Live driver location for in-progress deliveries.
--
-- Stored as columns on delivery_requests rather than in a separate
-- locations table: only the driver's *current* position matters, and
-- keeping it on the row means the contractor's existing "read my own
-- requests" policy already covers reading it, with no second table, no
-- second set of policies, and a natural target for a realtime
-- subscription scoped to one request.
--
-- The tradeoff accepted here is that no location history is kept - each
-- update overwrites the last. Nothing in the product needs a breadcrumb
-- trail today, and not storing one is the better privacy default.

ALTER TABLE delivery_requests ADD COLUMN IF NOT EXISTS driver_lat NUMERIC;
ALTER TABLE delivery_requests ADD COLUMN IF NOT EXISTS driver_lng NUMERIC;
ALTER TABLE delivery_requests ADD COLUMN IF NOT EXISTS driver_location_updated_at TIMESTAMP WITH TIME ZONE;

-- Report the calling driver's current position for one job they're
-- assigned to. Same reasoning as accept_delivery_request and
-- advance_delivery_status: drivers have no UPDATE access to
-- delivery_requests at all (the existing policy matches the contractor
-- who owns the row), and a SECURITY DEFINER function that writes exactly
-- three columns is a far narrower grant than an UPDATE policy that would
-- also let a driver rewrite addresses or material details.
--
-- Position is only accepted while the job is actually in progress, so a
-- driver isn't broadcasting their location on a job that's finished or
-- one they haven't started.
CREATE OR REPLACE FUNCTION report_driver_location(
  p_request_id UUID,
  p_lat NUMERIC,
  p_lng NUMERIC
)
RETURNS SETOF delivery_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to report a location';
  END IF;

  RETURN QUERY
  UPDATE delivery_requests
  SET driver_lat = p_lat,
      driver_lng = p_lng,
      driver_location_updated_at = NOW()
  WHERE id = p_request_id
    AND assigned_driver_id = auth.uid()
    AND status IN ('assigned', 'in_transit')
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION report_driver_location(UUID, NUMERIC, NUMERIC) TO authenticated;

-- Drop the driver's position once the delivery is done. The contractor
-- has no reason to see where their driver is after delivery, and holding
-- a stale fix indefinitely is a privacy cost with no product benefit.
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
      updated_at = NOW(),
      driver_lat = CASE WHEN p_next_status = 'completed' THEN NULL ELSE driver_lat END,
      driver_lng = CASE WHEN p_next_status = 'completed' THEN NULL ELSE driver_lng END,
      driver_location_updated_at = CASE
        WHEN p_next_status = 'completed' THEN NULL
        ELSE driver_location_updated_at
      END
  WHERE id = p_request_id
    AND assigned_driver_id = auth.uid()
    AND status = v_expected_current
  RETURNING *;
END;
$$;

-- Realtime delivers row-level changes to subscribers; without this the
-- publication carries nothing for this table and a subscription silently
-- receives no events. Guarded because ALTER PUBLICATION ... ADD TABLE
-- has no IF NOT EXISTS form and errors if the table is already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'delivery_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE delivery_requests;
  END IF;
END;
$$;
