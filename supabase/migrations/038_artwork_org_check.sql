-- Migration 038: enforce org_id OR is_orphan for artwork_jobs.
--
-- GATED: This migration will only succeed after all historic rows have been
-- linked or explicitly marked as orphans. Run this preflight query first:
--
--   SELECT COUNT(*) FROM public.artwork_jobs
--   WHERE org_id IS NULL AND is_orphan = false;
--
-- Expected: 0.
--
-- If non-zero, complete reconciliation via /admin/artwork/reconcile before
-- deploying this migration. If the constraint raises 23514 on apply, the
-- reconciliation backlog has not been cleared.

BEGIN;

-- Preflight assertion: fail fast with a clear message if unmatched rows exist.
DO $$
DECLARE
  unmatched_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO unmatched_count
    FROM public.artwork_jobs
    WHERE org_id IS NULL AND is_orphan = false;

  IF unmatched_count > 0 THEN
    RAISE EXCEPTION
      'Cannot apply migration 038: % artwork_jobs have org_id IS NULL AND is_orphan = false. Run /admin/artwork/reconcile first.',
      unmatched_count;
  END IF;
END $$;

ALTER TABLE public.artwork_jobs
  ADD CONSTRAINT artwork_jobs_org_or_orphan_chk
  CHECK (is_orphan = true OR org_id IS NOT NULL);

COMMIT;
