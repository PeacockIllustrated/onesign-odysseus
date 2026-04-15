-- Migration 042: shop-floor problem reports
--
-- Minimal escape-hatch table so a shop-floor worker can flag an issue
-- against a sub-item mid-check. Insert + read are open to any authed
-- user; resolve/delete are super-admin only.

BEGIN;

CREATE TABLE IF NOT EXISTS public.shop_floor_flags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sub_item_id UUID NOT NULL
        REFERENCES public.artwork_component_items(id) ON DELETE CASCADE,
    job_item_id UUID NOT NULL
        REFERENCES public.job_items(id) ON DELETE CASCADE,
    stage_id UUID REFERENCES public.production_stages(id) ON DELETE SET NULL,
    reported_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    reported_by_name TEXT,
    notes TEXT NOT NULL CHECK (length(notes) BETWEEN 1 AND 500),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'resolved')),
    resolved_at TIMESTAMPTZ,
    resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_shop_floor_flags_sub_item
    ON public.shop_floor_flags(sub_item_id);
CREATE INDEX IF NOT EXISTS idx_shop_floor_flags_job_item
    ON public.shop_floor_flags(job_item_id);
CREATE INDEX IF NOT EXISTS idx_shop_floor_flags_open
    ON public.shop_floor_flags(status) WHERE status = 'open';

ALTER TABLE public.shop_floor_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage flags"
    ON public.shop_floor_flags FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can create flags"
    ON public.shop_floor_flags FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can read flags"
    ON public.shop_floor_flags FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

COMMIT;
