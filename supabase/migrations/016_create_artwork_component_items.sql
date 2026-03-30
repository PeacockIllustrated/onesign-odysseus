-- Migration 016: Extra dimension items for artwork components
-- Allows multiple dimension sets (A, B, C, D...) per component
-- A = primary dimensions on artwork_components row
-- B, C, D... = extra items in this table

-- =============================================================================
-- TABLE: artwork_component_items
-- =============================================================================

CREATE TABLE public.artwork_component_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    component_id UUID NOT NULL REFERENCES public.artwork_components(id) ON DELETE CASCADE,
    label TEXT NOT NULL,              -- 'B', 'C', 'D', etc. (A is implicit from component)
    sort_order INT NOT NULL,          -- Starting from 1 (A=0 is implicit)

    -- Design dimensions
    width_mm NUMERIC(10, 2),
    height_mm NUMERIC(10, 2),
    returns_mm NUMERIC(10, 2),

    -- Production measurements
    measured_width_mm NUMERIC(10, 2),
    measured_height_mm NUMERIC(10, 2),

    -- Dimension mismatch detection
    dimension_flag TEXT CHECK (dimension_flag IS NULL OR dimension_flag IN ('within_tolerance', 'out_of_tolerance')),
    width_deviation_mm NUMERIC(10, 2),
    height_deviation_mm NUMERIC(10, 2),

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_artwork_component_items_component ON public.artwork_component_items(component_id);
CREATE INDEX idx_artwork_component_items_sort ON public.artwork_component_items(component_id, sort_order);

-- Reuse existing trigger function from migration 012
CREATE TRIGGER trg_artwork_component_items_updated_at
    BEFORE UPDATE ON public.artwork_component_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.artwork_component_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage artwork_component_items"
    ON public.artwork_component_items FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- ALTER: artwork_component_versions — add extra_items_json for version snapshots
-- =============================================================================

ALTER TABLE public.artwork_component_versions
    ADD COLUMN extra_items_json JSONB DEFAULT '[]';
