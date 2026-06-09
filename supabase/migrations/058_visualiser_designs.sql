-- Migration 058: folded aluminium panel visualiser designs
--
-- Stores saved visualiser designs (panel params + the raw uploaded aperture
-- SVG). Single-tenant internal tool — super-admin manages everything; any
-- authed Onesign user can read/create (mirrors the shop_floor_flags pattern
-- in migration 042). org_id / quote_id are optional links so a design can be
-- pre-filled from / attached to a quote line item, but a standalone scratch
-- design needs neither.

BEGIN;

CREATE TABLE IF NOT EXISTS public.visualiser_designs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    quote_item_id UUID REFERENCES public.quote_items(id) ON DELETE SET NULL,
    -- Panel parameters (PanelParams shape from lib/visualiser/types.ts).
    params_json JSONB NOT NULL,
    -- Raw uploaded aperture SVG, already flattened on import. Nullable —
    -- a panel-only design has no aperture artwork.
    svg_source TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visualiser_designs_org
    ON public.visualiser_designs(org_id);
CREATE INDEX IF NOT EXISTS idx_visualiser_designs_quote
    ON public.visualiser_designs(quote_id);
CREATE INDEX IF NOT EXISTS idx_visualiser_designs_created_at
    ON public.visualiser_designs(created_at DESC);

ALTER TABLE public.visualiser_designs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage visualiser designs"
    ON public.visualiser_designs FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can read visualiser designs"
    ON public.visualiser_designs FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can create visualiser designs"
    ON public.visualiser_designs FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
