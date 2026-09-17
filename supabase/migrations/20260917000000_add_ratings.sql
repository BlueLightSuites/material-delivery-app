-- Two-sided ratings on completed deliveries.
--
-- Both parties can rate each other once per delivery. Only the
-- contractor-facing display is built for now (seeing their driver's
-- average once assigned), but the table is symmetric so the driver-side
-- view needs no schema change later.

CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_request_id UUID NOT NULL REFERENCES delivery_requests(id) ON DELETE CASCADE,
  rater_auth_id UUID NOT NULL,
  ratee_auth_id UUID NOT NULL,
  stars SMALLINT NOT NULL CHECK (stars BETWEEN 1 AND 5),
  comment TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  -- One rating per person per delivery. This is the constraint that
  -- makes "have I already rated this?" answerable without a race, and
  -- stops a disgruntled party rating repeatedly.
  UNIQUE (delivery_request_id, rater_auth_id)
);

CREATE INDEX IF NOT EXISTS idx_ratings_ratee ON ratings(ratee_auth_id);
CREATE INDEX IF NOT EXISTS idx_ratings_request ON ratings(delivery_request_id);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- You can read ratings you wrote or received. Deliberately not "anyone
-- can read any rating": aggregate reputation is exposed through the
-- function below, which returns an average and a count without handing
-- out individual comments about a third party.
CREATE POLICY "Users can view ratings they gave or received"
  ON ratings
  FOR SELECT
  USING (rater_auth_id = auth.uid() OR ratee_auth_id = auth.uid());

-- Ratings are written through the RPC below rather than a policy, because
-- the conditions worth enforcing (the delivery is complete, the caller
-- was actually on it, and the ratee is the other party) are a query, not
-- a row predicate.

-- Denormalised onto users so displaying a rating is a column read rather
-- than an aggregate over the ratings table on every render.
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(3,2);
ALTER TABLE users ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION refresh_user_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- users.auth_id is TEXT while these are UUID - the drift documented in
  -- 20260825003703 - so this has to cast.
  UPDATE users
  SET rating_avg = sub.avg_stars,
      rating_count = sub.total
  FROM (
    SELECT AVG(stars)::NUMERIC(3,2) AS avg_stars, COUNT(*) AS total
    FROM ratings
    WHERE ratee_auth_id = NEW.ratee_auth_id
  ) AS sub
  WHERE users.auth_id = NEW.ratee_auth_id::text;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS ratings_refresh_user_rating ON ratings;

CREATE TRIGGER ratings_refresh_user_rating
  AFTER INSERT ON ratings
  FOR EACH ROW
  EXECUTE FUNCTION refresh_user_rating();

-- Submit a rating for a delivery the caller took part in.
--
-- Guarded rather than policy-based because the rules are relational: the
-- delivery must be completed, the caller must have been the contractor
-- or the assigned driver on it, and the ratee is whichever of those the
-- caller wasn't. Deriving the ratee here rather than trusting a
-- parameter means a caller can't attach a one-star review to someone who
-- had nothing to do with the job.
CREATE OR REPLACE FUNCTION submit_rating(
  p_request_id UUID,
  p_stars SMALLINT,
  p_comment TEXT DEFAULT NULL
)
RETURNS SETOF ratings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request delivery_requests;
  v_ratee UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to submit a rating';
  END IF;

  IF p_stars < 1 OR p_stars > 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5';
  END IF;

  SELECT * INTO v_request FROM delivery_requests WHERE id = p_request_id;

  IF v_request.id IS NULL OR v_request.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed deliveries can be rated';
  END IF;

  IF v_request.auth_id = auth.uid() THEN
    v_ratee := v_request.assigned_driver_id;
  ELSIF v_request.assigned_driver_id = auth.uid() THEN
    v_ratee := v_request.auth_id;
  ELSE
    RAISE EXCEPTION 'Only the contractor or the assigned driver can rate this delivery';
  END IF;

  IF v_ratee IS NULL THEN
    RAISE EXCEPTION 'This delivery has no counterparty to rate';
  END IF;

  RETURN QUERY
  INSERT INTO ratings (delivery_request_id, rater_auth_id, ratee_auth_id, stars, comment)
  VALUES (p_request_id, auth.uid(), v_ratee, p_stars, NULLIF(TRIM(p_comment), ''))
  ON CONFLICT (delivery_request_id, rater_auth_id) DO NOTHING
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_rating(UUID, SMALLINT, TEXT) TO authenticated;

-- The other party's reputation on a given delivery.
--
-- Scoped to one delivery on purpose. The users table's SELECT policy
-- still only exposes a person their own row; rather than widening that
-- so contractors can read driver profiles generally, this returns an
-- average and a count for the counterparty on a job the caller is
-- actually on. That is the narrow version of the cross-party profile
-- read that 20260825003703 deliberately left for "when that UI is
-- actually built".
CREATE OR REPLACE FUNCTION get_counterparty_rating(p_request_id UUID)
RETURNS TABLE (rating_avg NUMERIC, rating_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request delivery_requests;
  v_other UUID;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO v_request FROM delivery_requests WHERE id = p_request_id;

  IF v_request.id IS NULL THEN
    RETURN;
  END IF;

  IF v_request.auth_id = auth.uid() THEN
    v_other := v_request.assigned_driver_id;
  ELSIF v_request.assigned_driver_id = auth.uid() THEN
    v_other := v_request.auth_id;
  ELSE
    RETURN;
  END IF;

  IF v_other IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT u.rating_avg, u.rating_count
  FROM users u
  WHERE u.auth_id = v_other::text;
END;
$$;

GRANT EXECUTE ON FUNCTION get_counterparty_rating(UUID) TO authenticated;
