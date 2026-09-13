-- Create users table
--
-- src/services/firebase/authService.ts reads and writes this table on every
-- sign up / sign in (auth_id, email, name, role), but until now no
-- migration for it existed in the repo - it only ever existed as whatever
-- was clicked together in the Supabase dashboard for the live project. This
-- makes that schema reproducible from a clean project.
--
-- Live-schema note (found 2026-09-12, running this migration for the first
-- time against the real project): the dashboard-created table already has
-- auth_id as TEXT (not UUID - it stores the Supabase Auth UUID as a string,
-- which is why authService.ts's plain string comparisons still work) and a
-- bigint `id` primary key instead of UUID. Neither of those is worth
-- correcting here: authService.ts never reads public.users.id (the User
-- object's `id` field is always auth_id, i.e. authUser.id), so the bigint
-- PK is inert, and retyping a live column with real rows is a separate,
-- riskier migration than this one. The policies below are written against
-- TEXT accordingly. The live table was also missing `phone` and
-- `updated_at` (present here from the start, but CREATE TABLE IF NOT
-- EXISTS is a no-op against an existing table), so those are added
-- explicitly - `updated_at` in particular has to exist before the trigger
-- at the bottom of this file is created, or the first real UPDATE to a
-- user row starts throwing.
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL DEFAULT 'driver', -- 'contractor', 'driver', or 'admin'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create index on auth_id for the auth_id=eq.<uuid> lookups authService.ts
-- does on every sign-in.
CREATE INDEX IF NOT EXISTS idx_users_auth_id ON users(auth_id);

-- Enable Row Level Security (RLS)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- RLS Policy: users can view their own profile
CREATE POLICY "Users can view their own profile"
  ON users
  FOR SELECT
  USING (auth_id = auth.uid()::text);

-- RLS Policy: users can create their own profile (signup)
CREATE POLICY "Users can create their own profile"
  ON users
  FOR INSERT
  WITH CHECK (auth_id = auth.uid()::text);

-- RLS Policy: users can update their own profile
CREATE POLICY "Users can update their own profile"
  ON users
  FOR UPDATE
  USING (auth_id = auth.uid()::text)
  WITH CHECK (auth_id = auth.uid()::text);

-- Not covered here: letting a contractor/driver read the *public* profile
-- fields (e.g. name) of whoever they're currently matched with on a
-- delivery_request. That needs a policy that joins through
-- delivery_requests.assigned_driver_id / auth_id and is intentionally left
-- for when that UI is actually built, rather than opened up speculatively.

-- Auto-update the updated_at timestamp on every change.
CREATE OR REPLACE FUNCTION update_users_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at_trigger
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_users_updated_at();
