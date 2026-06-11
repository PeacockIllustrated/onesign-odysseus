-- Migration 064: acrylic nesting saved designs
--
-- Lets the nesting tool save a nest for continuity / later revision: the raw
-- uploaded artwork SVG plus the run config (sheet size, gap, rotation, margin,
-- hole-nesting, width calibration). Same access model as visualiser_designs
-- (migration 058): super-admin manages everything via the service role; any
-- authed Onesign user can read/create. No org/quote links — a nest is a
-- standalone production aid, not part of the inheritance chain.

BEGIN;

CREATE TABLE IF NOT EXISTS public.nesting_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    -- Raw uploaded artwork SVG (the source of the cut pieces).
    svg_source TEXT NOT NULL,
    -- { config: NestConfig, widthCalMm: number|null, fileName: string|null }
    config_json JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_nesting_designs_updated_at
    ON public.nesting_designs(updated_at DESC);

ALTER TABLE public.nesting_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage nesting designs"
    ON public.nesting_designs FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can read nesting designs"
    ON public.nesting_designs FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can create nesting designs"
    ON public.nesting_designs FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
