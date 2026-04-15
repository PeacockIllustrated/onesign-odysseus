-- Migration 039: promote artwork_component_items to spec-bearing sub-items.
--
-- After this migration every artwork_component has 1..n sub-items. A
-- pre-existing component with spec data gets a single "A" sub-item seeded
-- from its columns. Components stay as pure containers; their legacy
-- spec columns remain on the table but are no longer read by app code.

BEGIN;

ALTER TABLE public.artwork_component_items
    ADD COLUMN IF NOT EXISTS name TEXT,
    ADD COLUMN IF NOT EXISTS material TEXT,
    ADD COLUMN IF NOT EXISTS application_method TEXT,
    ADD COLUMN IF NOT EXISTS finish TEXT,
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS target_stage_id UUID
        REFERENCES public.production_stages(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS designed_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS design_signed_off_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS design_signed_off_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS production_checked_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS production_signed_off_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS production_signed_off_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS material_confirmed BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS rip_no_scaling_confirmed BOOLEAN NOT NULL DEFAULT false;

-- quantity >= 1 sanity check. Named so we can drop/re-add safely.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'artwork_component_items_quantity_positive_chk'
  ) THEN
    ALTER TABLE public.artwork_component_items
      ADD CONSTRAINT artwork_component_items_quantity_positive_chk
      CHECK (quantity >= 1);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_artwork_component_items_target_stage
    ON public.artwork_component_items(target_stage_id);
CREATE INDEX IF NOT EXISTS idx_artwork_component_items_design_signoff
    ON public.artwork_component_items(design_signed_off_at);
CREATE INDEX IF NOT EXISTS idx_artwork_component_items_production_signoff
    ON public.artwork_component_items(production_signed_off_at);

-- Backfill: every artwork_component with a real spec becomes a single
-- sub-item labelled 'A' at sort_order 0. Components with zero spec data
-- (started-but-not-filled-in) are skipped; the UI will prompt "add a
-- sub-item to begin".
DO $$
BEGIN
  INSERT INTO public.artwork_component_items (
    component_id, label, sort_order,
    name, material, application_method, finish, quantity, notes,
    target_stage_id,
    width_mm, height_mm, returns_mm,
    measured_width_mm, measured_height_mm,
    dimension_flag, width_deviation_mm, height_deviation_mm,
    designed_by, design_signed_off_at, design_signed_off_by,
    production_checked_by, production_signed_off_at, production_signed_off_by,
    material_confirmed, rip_no_scaling_confirmed
  )
  SELECT
    c.id, 'A', 0,
    c.name, c.material, NULL, NULL, 1, c.notes,
    c.target_stage_id,
    c.width_mm, c.height_mm, c.returns_mm,
    c.measured_width_mm, c.measured_height_mm,
    c.dimension_flag, c.width_deviation_mm, c.height_deviation_mm,
    c.designed_by, c.design_signed_off_at, c.design_signed_off_by,
    c.production_checked_by, c.production_signed_off_at, c.production_signed_off_by,
    c.material_confirmed, c.rip_no_scaling_confirmed
  FROM public.artwork_components c
  WHERE c.width_mm IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.artwork_component_items i
      WHERE i.component_id = c.id AND i.sort_order = 0
    );
END $$;

COMMENT ON COLUMN public.artwork_component_items.name IS
    'Human-readable name for this sub-item (e.g. "QUEEN BEE letters").';
COMMENT ON COLUMN public.artwork_component_items.material IS
    'Free-text material spec (e.g. "5mm rose-gold mirrored acrylic"). Phase 2 may promote to a lookup table.';
COMMENT ON COLUMN public.artwork_component_items.application_method IS
    'How the sub-item is applied or fixed (e.g. "stuck to face", "weeded and applied"). Free text.';
COMMENT ON COLUMN public.artwork_component_items.finish IS
    'Surface finish / colour (e.g. "rose gold mirror", "matte white"). Free text.';
COMMENT ON COLUMN public.artwork_component_items.target_stage_id IS
    'Department this sub-item routes to in the production pipeline. Replaces the component-level target_stage_id for spec-bearing rows.';

COMMIT;
