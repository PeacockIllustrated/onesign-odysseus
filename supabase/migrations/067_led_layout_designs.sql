-- Migration 067: LED layout & wiring designs
--
-- Backs the "LED layout & wiring" tool (app/(portal)/admin/visualiser/led-layout):
-- read an outlined-letters / cabinet SVG, lay LED modules into each face, chain
-- them into runs, size the power supplies (drivers) and produce the workshop
-- wiring drawing + power schedule. The illuminated counterpart to the neon tool.
--
-- Same access model as nesting_designs (064) / letter_return_jobs (065) /
-- binder_assets (066): super-admin manages via the service role; any authed
-- Onesign user can read/create. `source_design_id` is an OPTIONAL back-link to
-- the panel design it came from (a visualiser "Send to LED layout" handoff) —
-- ON DELETE SET NULL, so losing the panel design never deletes the layout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.led_layout_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    -- Raw uploaded outlined-letters / cabinet SVG.
    svg_source TEXT NOT NULL,
    -- { config: LedLayoutConfig, widthMm: number|null, heightMm: number|null,
    --   fileName: string|null } — enough to reopen the layout exactly.
    config_json JSONB NOT NULL,
    source_design_id UUID REFERENCES public.visualiser_designs(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_led_layout_designs_updated_at
    ON public.led_layout_designs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_led_layout_designs_source
    ON public.led_layout_designs(source_design_id);

ALTER TABLE public.led_layout_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage led layout designs"
    ON public.led_layout_designs FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can read led layout designs"
    ON public.led_layout_designs FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can create led layout designs"
    ON public.led_layout_designs FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
