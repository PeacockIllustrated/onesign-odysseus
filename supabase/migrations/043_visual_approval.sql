-- Migration 043: visual approval jobs + per-component variants
--
-- Reuses artwork_jobs for a second flavour of job (visual_approval) whose
-- components carry mockup variants instead of sub-items. The existing
-- production flow is untouched — default job_type is 'production'.

BEGIN;

-- 1. artwork_jobs gains a type, an optional quote link, and an optional
--    back-reference to the visual job that spawned it (when job_type='production').
ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS job_type TEXT NOT NULL DEFAULT 'production'
    CHECK (job_type IN ('production', 'visual_approval')),
  ADD COLUMN IF NOT EXISTS quote_id UUID
    REFERENCES public.quotes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS parent_visual_job_id UUID
    REFERENCES public.artwork_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_job_type
  ON public.artwork_jobs(job_type);
CREATE INDEX IF NOT EXISTS idx_artwork_jobs_quote_id
  ON public.artwork_jobs(quote_id) WHERE quote_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_artwork_jobs_parent_visual
  ON public.artwork_jobs(parent_visual_job_id) WHERE parent_visual_job_id IS NOT NULL;

-- 2. New table: one row per mockup option on a component.
CREATE TABLE IF NOT EXISTS public.artwork_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component_id UUID NOT NULL REFERENCES public.artwork_components(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  description TEXT,
  thumbnail_url TEXT,
  material TEXT,
  application_method TEXT,
  finish TEXT,
  width_mm NUMERIC(10, 2),
  height_mm NUMERIC(10, 2),
  returns_mm NUMERIC(10, 2),
  is_chosen BOOLEAN NOT NULL DEFAULT FALSE,
  chosen_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_artwork_variants_component
  ON public.artwork_variants(component_id);
CREATE INDEX IF NOT EXISTS idx_artwork_variants_chosen
  ON public.artwork_variants(component_id) WHERE is_chosen = TRUE;

CREATE TRIGGER trg_artwork_variants_updated_at
  BEFORE UPDATE ON public.artwork_variants
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.artwork_variants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage artwork_variants"
  ON public.artwork_variants FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users read artwork_variants"
  ON public.artwork_variants FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

COMMIT;
