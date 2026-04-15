-- Migration 044: enforce "one production job per visual" at the DB level.
-- Closes the race in createProductionFromVisual's check-then-insert.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_artwork_jobs_one_prod_per_visual
  ON public.artwork_jobs(parent_visual_job_id)
  WHERE job_type = 'production' AND parent_visual_job_id IS NOT NULL;

COMMIT;
