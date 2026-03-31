-- Migration 030: Link artwork compliance to production pipeline
-- Adds job_item_id FK on artwork_jobs (nullable — standalone artwork stays unchanged).
-- Adds target_stage_id on artwork_components (department assignment per component).
-- Creates component_stage_defaults table for auto-fill on component creation.

-- 1. Link artwork_jobs to production job_items
ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS job_item_id UUID REFERENCES public.job_items(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_artwork_jobs_job_item
  ON public.artwork_jobs(job_item_id) WHERE job_item_id IS NOT NULL;

-- 2. Department assignment per artwork component
ALTER TABLE public.artwork_components
  ADD COLUMN IF NOT EXISTS target_stage_id UUID REFERENCES public.production_stages(id) ON DELETE SET NULL;

-- 3. Default component-type-to-department mapping
CREATE TABLE IF NOT EXISTS public.component_stage_defaults (
  component_type TEXT NOT NULL,
  stage_id UUID NOT NULL REFERENCES public.production_stages(id) ON DELETE CASCADE,
  PRIMARY KEY (component_type, stage_id)
);

-- 4. Seed defaults
INSERT INTO public.component_stage_defaults (component_type, stage_id) VALUES
  ('vinyl',        (SELECT id FROM public.production_stages WHERE slug = 'vinyl' AND is_default = TRUE)),
  ('panel',        (SELECT id FROM public.production_stages WHERE slug = 'metal-fabrication' AND is_default = TRUE)),
  ('acrylic',      (SELECT id FROM public.production_stages WHERE slug = 'plastic-fabrication' AND is_default = TRUE)),
  ('push_through', (SELECT id FROM public.production_stages WHERE slug = 'plastic-fabrication' AND is_default = TRUE)),
  ('dibond',       (SELECT id FROM public.production_stages WHERE slug = 'cnc-routing' AND is_default = TRUE)),
  ('foamex',       (SELECT id FROM public.production_stages WHERE slug = 'cnc-routing' AND is_default = TRUE)),
  ('aperture_cut', (SELECT id FROM public.production_stages WHERE slug = 'laser' AND is_default = TRUE))
ON CONFLICT DO NOTHING;

-- 5. RLS for component_stage_defaults
ALTER TABLE public.component_stage_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view component stage defaults"
  ON public.component_stage_defaults FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage component stage defaults"
  ON public.component_stage_defaults FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

-- 6. Index on artwork_components.target_stage_id
CREATE INDEX IF NOT EXISTS idx_artwork_components_target_stage
  ON public.artwork_components(target_stage_id) WHERE target_stage_id IS NOT NULL;
