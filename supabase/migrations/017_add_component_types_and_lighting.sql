-- Migration 017: Add new component types (dibond, aperture_cut, foamex) and lighting column
-- =============================================================================

-- 1. Drop the existing component_type CHECK constraint and add updated one
ALTER TABLE public.artwork_components
    DROP CONSTRAINT IF EXISTS artwork_components_component_type_check;

ALTER TABLE public.artwork_components
    ADD CONSTRAINT artwork_components_component_type_check
    CHECK (component_type IN (
        'panel', 'vinyl', 'acrylic', 'push_through',
        'dibond', 'aperture_cut', 'foamex',
        'other'
    ));

-- 2. Add lighting column (nullable — not all components are lit)
ALTER TABLE public.artwork_components
    ADD COLUMN IF NOT EXISTS lighting TEXT DEFAULT NULL
    CHECK (lighting IS NULL OR lighting IN ('backlit', 'halo', 'edge_lit'));

-- 3. Add lighting to version snapshots so revisions preserve it
ALTER TABLE public.artwork_component_versions
    ADD COLUMN IF NOT EXISTS lighting TEXT DEFAULT NULL;
