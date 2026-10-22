-- Every account has a name.
--
-- Reviewers match the name on a driver's license against the account,
-- Slack alerts and the review queue identify drivers by it, and a
-- contractor will eventually see their driver's. Two accounts from the
-- project's first day have none ('' - the column was already NOT NULL),
-- predating the signup form's own check, and one fallback path could
-- still create more: when the profile row fails to insert at signup,
-- sign-in recreates it from the auth user's metadata, which held no
-- name. Signup now stores the name in that metadata too.
--
-- NOT VALID so the existing blank rows don't block the migration: the
-- check applies to every insert and to any update of a row, and the app
-- asks a nameless account for its name before anything else. Once no
-- blank rows remain it can be validated with
--
--   ALTER TABLE users VALIDATE CONSTRAINT users_name_not_blank;
--
-- Until those two accounts set a name, updates to their rows - saving a
-- push token, the rating trigger - fail the check. That's the tradeoff
-- for not inventing names for real people.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_name_not_blank;
ALTER TABLE users ADD CONSTRAINT users_name_not_blank
  CHECK (length(trim(name)) > 0) NOT VALID;
