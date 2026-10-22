-- Stream driver_documents changes to the app, so a driver sees a review
-- decision the moment it's made instead of the next time they happen to
-- reopen a screen. Push covers this on a real phone, but not on a
-- simulator, not for a driver who declined notifications, and not while
-- they're already looking at the screen in question.
--
-- Row-level security applies to the stream, so a driver receives events
-- for their own documents only ("Drivers can view their own documents",
-- 20261019000000).
--
-- Guarded the same way as 20260913000000: ADD TABLE has no IF NOT EXISTS
-- form and errors if the table is already a member.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'driver_documents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE driver_documents;
  END IF;
END;
$$;
