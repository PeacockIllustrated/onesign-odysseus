-- Migration 064: publish shop_floor_flags to Realtime (audit G8).
--
-- The /admin/flags triage inbox reads shop_floor_flags directly but wasn't
-- live — a newly-raised flag only appeared on manual refresh. Adding the table
-- to the realtime publication lets FlagsClient refresh when a flag is raised or
-- resolved. (The dashboard already updates live via the notifications table.)

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = 'public'
          AND tablename = 'shop_floor_flags'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shop_floor_flags;
    END IF;
END $$;
