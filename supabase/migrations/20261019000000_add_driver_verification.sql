-- Driver verification: vehicle details, document uploads, and a gate on
-- accepting jobs.
--
-- Until now anyone could sign up as a driver and accept a job - there
-- was no record of what they drive, and nothing checked the role at all,
-- so a contractor account could accept a job too. This adds:
--
--   1. Vehicle details on users (type, trailer, trailer capacity).
--   2. driver_documents: license, registration, and insurance, each
--      reviewed by a person before it counts.
--   3. A private storage bucket for the files themselves.
--   4. accept_delivery_request now refuses unless the caller is a
--      verified driver, and refuses trailer jobs to drivers without one.
--
-- Review happens in the Supabase dashboard until there is an admin UI
-- (#15): open the file under Storage > driver-documents, then set
-- `status` (and `expires_on`, and `rejection_reason` when rejecting) on
-- the matching driver_documents row. reviewed_at stamps itself.

-- ---------------------------------------------------------------------
-- 1. Vehicle details
-- ---------------------------------------------------------------------

ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_type TEXT
  CHECK (vehicle_type IN ('pickup', 'flatbed', 'box_truck', 'dump_truck'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_trailer BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS trailer_capacity_lbs INTEGER
  CHECK (trailer_capacity_lbs > 0);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_trailer_capacity_required;
ALTER TABLE users ADD CONSTRAINT users_trailer_capacity_required
  CHECK (NOT has_trailer OR trailer_capacity_lbs IS NOT NULL);

-- Column-level write access on users.
--
-- The "Users can update their own profile" policy scopes writes to the
-- caller's own row, but not to particular columns - so a user could
-- already PATCH their own rating_avg / rating_count, which is what a
-- contractor sees as their driver's reputation. Postgres grants are the
-- column-level half that RLS can't express. Anything not listed here is
-- written only by triggers and SECURITY DEFINER functions.
--
-- These lists must cover every column the app writes, or that write
-- starts failing with "permission denied for table users":
--   INSERT - authService.ts createOrUpdateUserProfile
--   UPDATE - push token (notifications/index.ts), vehicle details
--            (driverVerification.ts)
REVOKE INSERT, UPDATE ON users FROM anon, authenticated;
GRANT INSERT (auth_id, email, name, role, created_at) ON users TO authenticated;
GRANT UPDATE (name, phone, expo_push_token, vehicle_type, has_trailer, trailer_capacity_lbs)
  ON users TO authenticated;

-- ---------------------------------------------------------------------
-- 2. Documents
-- ---------------------------------------------------------------------

-- One current row per driver per document type. Uploading a replacement
-- updates that row and puts it back into review, so "what's the state of
-- my insurance?" always has exactly one answer.
CREATE TABLE IF NOT EXISTS driver_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  doc_type TEXT NOT NULL CHECK (doc_type IN ('license', 'registration', 'insurance')),
  storage_path TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  -- Entered by the reviewer from the document itself, not by the driver.
  -- An expired document stops counting toward verification on its own,
  -- without anyone having to remember to revoke it.
  expires_on DATE,
  submitted_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE (driver_auth_id, doc_type)
);

ALTER TABLE driver_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can view their own documents"
  ON driver_documents
  FOR SELECT
  USING (driver_auth_id = auth.uid());

-- No INSERT or UPDATE policy: a driver who could write this table
-- directly could write status = 'approved'. Submissions go through
-- submit_driver_document below, and review happens as the dashboard's
-- service role, which bypasses RLS.

CREATE OR REPLACE FUNCTION stamp_driver_document_review()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status AND NEW.status <> 'pending' THEN
    NEW.reviewed_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS driver_documents_stamp_review ON driver_documents;

CREATE TRIGGER driver_documents_stamp_review
  BEFORE UPDATE ON driver_documents
  FOR EACH ROW
  EXECUTE FUNCTION stamp_driver_document_review();

-- ---------------------------------------------------------------------
-- 3. Storage
-- ---------------------------------------------------------------------

-- Private: these are licenses and insurance cards. Nothing is ever
-- served by public URL; the reviewer reads them through the dashboard.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'driver-documents',
  'driver-documents',
  FALSE,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/heic', 'application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- Files live under <driver auth uid>/, and a driver can only add files
-- to their own folder. There is deliberately no UPDATE or DELETE policy:
-- every upload gets a fresh path, so once a document is approved the
-- file the reviewer looked at can't be swapped out from under them. A
-- replacement is a new file and a new review.
CREATE POLICY "Drivers can upload their own documents"
  ON storage.objects
  FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Drivers can view their own documents"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'driver-documents'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- Record an uploaded file as the driver's current document of that type,
-- and put it (back) into review.
--
-- Checks the file actually exists in the caller's own folder: otherwise a
-- driver could submit a path pointing at nothing, or at someone else's
-- upload, and have a reviewer approve that.
CREATE OR REPLACE FUNCTION submit_driver_document(p_doc_type TEXT, p_storage_path TEXT)
RETURNS SETOF driver_documents
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be authenticated to submit a document';
  END IF;

  IF split_part(p_storage_path, '/', 1) <> auth.uid()::text OR NOT EXISTS (
    SELECT 1 FROM storage.objects
    WHERE bucket_id = 'driver-documents' AND name = p_storage_path
  ) THEN
    RAISE EXCEPTION 'No uploaded file at %', p_storage_path;
  END IF;

  RETURN QUERY
  INSERT INTO driver_documents (driver_auth_id, doc_type, storage_path)
  VALUES (auth.uid(), p_doc_type, p_storage_path)
  ON CONFLICT (driver_auth_id, doc_type) DO UPDATE
  SET storage_path = EXCLUDED.storage_path,
      status = 'pending',
      rejection_reason = NULL,
      expires_on = NULL,
      reviewed_at = NULL,
      submitted_at = NOW()
  RETURNING *;
END;
$$;

GRANT EXECUTE ON FUNCTION submit_driver_document(TEXT, TEXT) TO authenticated;

-- ---------------------------------------------------------------------
-- 4. Verification and the accept gate
-- ---------------------------------------------------------------------

-- Whether the caller may take jobs: a driver, with a vehicle on file, and
-- all three documents approved and unexpired. The one definition the
-- accept gate and the app's banner both use, so they can't disagree.
--
-- Takes no argument on purpose - it answers for the caller only, rather
-- than letting anyone probe another driver's verification status.
CREATE OR REPLACE FUNCTION is_verified_driver()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1 FROM users
      WHERE auth_id = auth.uid()::text
        AND role = 'driver'
        AND vehicle_type IS NOT NULL
    )
    AND (
      SELECT COUNT(*) FROM driver_documents
      WHERE driver_auth_id = auth.uid()
        AND status = 'approved'
        AND (expires_on IS NULL OR expires_on >= CURRENT_DATE)
    ) = 3;
$$;

GRANT EXECUTE ON FUNCTION is_verified_driver() TO authenticated;

-- Same atomic claim as 20260825003608, with two refusals in front of it.
--
-- Refusals raise rather than returning zero rows, because zero rows
-- already means "another driver got there first" to the app, and these
-- need a different answer. The HINT is what the app matches on; the
-- message is for logs.
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

  IF NOT is_verified_driver() THEN
    RAISE EXCEPTION 'Only verified drivers can accept delivery requests'
      USING HINT = 'driver_not_verified';
  END IF;

  IF EXISTS (
    SELECT 1 FROM delivery_requests
    WHERE id = p_request_id AND requires_trailer
  ) AND NOT EXISTS (
    SELECT 1 FROM users WHERE auth_id = auth.uid()::text AND has_trailer
  ) THEN
    RAISE EXCEPTION 'This delivery requires a trailer'
      USING HINT = 'trailer_required';
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
