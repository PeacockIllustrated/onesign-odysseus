-- Migration 066: SVG binder — a reusable library of client logo SVGs
--
-- Backs "Save to binder" in the Image → SVG converter and a binder picker
-- surfaced at every "upload SVG" point (visualiser, neon, built-up returns,
-- nesting), so a logo vectorised + cleaned once is reusable everywhere — an
-- SVG library of clients' logos.
--
-- Same access model as nesting_designs (064) / letter_return_jobs (065):
-- super-admin manages everything via the service role; any authed Onesign user
-- can read/create. org_id is an OPTIONAL link to the client the logo belongs
-- to — ON DELETE SET NULL, so losing a client never deletes the artwork.

BEGIN;

CREATE TABLE IF NOT EXISTS public.binder_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
    -- The SVG itself (a cleaned, signage-ready logo).
    svg_source TEXT NOT NULL,
    -- Optional client this logo belongs to.
    org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_binder_assets_updated_at
    ON public.binder_assets(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_binder_assets_org
    ON public.binder_assets(org_id);

ALTER TABLE public.binder_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage binder assets"
    ON public.binder_assets FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can read binder assets"
    ON public.binder_assets FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can create binder assets"
    ON public.binder_assets FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

COMMIT;
