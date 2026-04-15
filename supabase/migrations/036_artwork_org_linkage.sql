-- Migration 036: artwork_jobs org linkage
-- Phase 1 of artwork integration refactor.
-- - Adds client_name_snapshot (preserves legacy free-text)
-- - Adds is_orphan flag (explicit marker for jobs with no org)
-- - Ensures org_id FK exists
-- - Backfills org_id for rows where client_name matches exactly one org name

BEGIN;

ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS client_name_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS is_orphan BOOLEAN NOT NULL DEFAULT false;

-- Ensure FK on org_id (migration 015 created the column but may have skipped the constraint)
ALTER TABLE public.artwork_jobs
  DROP CONSTRAINT IF EXISTS artwork_jobs_org_id_fkey;
ALTER TABLE public.artwork_jobs
  ADD CONSTRAINT artwork_jobs_org_id_fkey
  FOREIGN KEY (org_id) REFERENCES public.orgs(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_org_id
  ON public.artwork_jobs(org_id);

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_is_orphan
  ON public.artwork_jobs(is_orphan) WHERE is_orphan = true;

-- Backfill: snapshot legacy client_name and auto-link exact matches.
DO $$
BEGIN
  UPDATE public.artwork_jobs
    SET client_name_snapshot = client_name
    WHERE client_name_snapshot IS NULL;

  UPDATE public.artwork_jobs aj
    SET org_id = o.id
    FROM public.orgs o
    WHERE aj.org_id IS NULL
      AND aj.client_name IS NOT NULL
      AND LOWER(TRIM(aj.client_name)) = LOWER(TRIM(o.name))
      AND (
        SELECT COUNT(*) FROM public.orgs o2
        WHERE LOWER(TRIM(o2.name)) = LOWER(TRIM(aj.client_name))
      ) = 1;
END $$;

COMMENT ON COLUMN public.artwork_jobs.client_name_snapshot IS
  'Historical free-text client name preserved from pre-Phase-1 jobs. Read-only.';
COMMENT ON COLUMN public.artwork_jobs.is_orphan IS
  'True when the job has no org link (e.g. warranty/rework). Explicit opt-in at creation.';

COMMIT;
