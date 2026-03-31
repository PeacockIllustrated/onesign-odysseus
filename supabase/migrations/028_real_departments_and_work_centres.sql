-- Migration 028: Real Onesign departments, work_centres table, job_items routing columns
-- Replaces the 7 placeholder production stage seeds with 13 real Onesign departments.
-- Adds work_centres (sub-contractors within a department).
-- Extends job_items with item_number, stage_routing, and work_centre_id.

-- =============================================================================
-- 1. REMOVE OLD PLACEHOLDER STAGE SEEDS
-- =============================================================================
-- Note: existing jobs/items referencing these stages must be removed first,
-- or this migration must be run on a fresh database (no production data).
-- The FKs do not use ON DELETE SET NULL — this migration assumes no live data.

DELETE FROM public.production_stages WHERE is_default = TRUE;

-- =============================================================================
-- 2. INSERT 13 REAL ONESIGN DEPARTMENTS
-- =============================================================================

INSERT INTO public.production_stages (name, slug, sort_order, color, is_approval_stage, is_default) VALUES
  ('Order Book',          'order-book',          1,  '#6366F1', FALSE, TRUE),
  ('Cut List',            'cut-list',             2,  '#8B5CF6', FALSE, TRUE),
  ('Laser',               'laser',                3,  '#EC4899', FALSE, TRUE),
  ('CNC Routing',         'cnc-routing',          4,  '#EF4444', FALSE, TRUE),
  ('Plastic Fabrication', 'plastic-fabrication',  5,  '#F97316', FALSE, TRUE),
  ('Metal Fabrication',   'metal-fabrication',    6,  '#F59E0B', FALSE, TRUE),
  ('Artwork Approval',    'artwork-approval',      7,  '#D85A30', TRUE,  TRUE),
  ('Painters',            'painters',             8,  '#22C55E', FALSE, TRUE),
  ('Lighting',            'lighting',             9,  '#06B6D4', FALSE, TRUE),
  ('Vinyl',               'vinyl',                10, '#3B82F6', FALSE, TRUE),
  ('Digital Print',       'digital-print',        11, '#7C3AED', FALSE, TRUE),
  ('Assembly',            'assembly',             12, '#14B8A6', FALSE, TRUE),
  ('Goods Out',           'goods-out',            13, '#4e7e8c', FALSE, TRUE);

-- =============================================================================
-- 3. CREATE work_centres TABLE
-- =============================================================================

CREATE TABLE public.work_centres (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id    UUID        NOT NULL REFERENCES public.production_stages(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (stage_id, slug)
);

-- =============================================================================
-- 4. SEED WORK CENTRES FOR PAINTERS
-- =============================================================================
-- Subquery resolves the stage UUID at migration time.

INSERT INTO public.work_centres (stage_id, name, slug, sort_order) VALUES
  ((SELECT id FROM public.production_stages WHERE slug = 'painters' AND is_default = TRUE), 'AMD',     'amd',     1),
  ((SELECT id FROM public.production_stages WHERE slug = 'painters' AND is_default = TRUE), 'Dacon',   'dacon',   2),
  ((SELECT id FROM public.production_stages WHERE slug = 'painters' AND is_default = TRUE), 'Sparkle', 'sparkle', 3);

-- =============================================================================
-- 5. EXTEND job_items WITH ROUTING COLUMNS
-- =============================================================================

ALTER TABLE public.job_items
  ADD COLUMN IF NOT EXISTS item_number    TEXT,
  ADD COLUMN IF NOT EXISTS stage_routing  UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS work_centre_id UUID REFERENCES public.work_centres(id) ON DELETE SET NULL;

-- =============================================================================
-- 6. ROW LEVEL SECURITY FOR work_centres
-- =============================================================================

ALTER TABLE public.work_centres ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view work centres"
    ON public.work_centres FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage work centres"
    ON public.work_centres FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- 7. INDEXES
-- =============================================================================

CREATE INDEX idx_work_centres_stage ON public.work_centres(stage_id);
CREATE INDEX idx_job_items_work_centre ON public.job_items(work_centre_id);

-- =============================================================================
-- 8. REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.work_centres;
