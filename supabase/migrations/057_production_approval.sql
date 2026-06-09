-- Migration 057: internal production sign-off for artwork sub-items.
--
-- The PRODUCTION section on the designer's SubItemCard was stripped in
-- b031c6b (too much friction for the designer, belongs elsewhere). This
-- migration adds the data model for the replacement: a token-gated
-- production sign-off link that Chris / John open separately from the
-- designer UI and tick off each sub-item individually.
--
-- New surface:
--   * /production-sign-off/[token] — unauth, 64-hex token is the gate
--     (same invariant as /sign-off/[token] and /delivery/[token] in §3
--     of CLAUDE.md).
--
-- Data shape:
--   * artwork_production_approvals — one row per link cycle (mint, use,
--     complete / revoke, mint again if needed).
--   * artwork_component_items gains production_changes_requested_at /
--     production_changes_comment so the approver can reject a single
--     sub-item with a written reason that the designer sees back on the
--     admin page.
--   * artwork_components.production_signed_off_at already exists as a
--     legacy column (pre-039 spec-on-component days). Migration 039's
--     backfill copied it onto sub-items; this migration repurposes the
--     component-level column as the ROLLUP — stamped automatically by
--     the server action once every sub-item under the component has
--     its own production_signed_off_at set.
--
-- Dormant columns left untouched: rip_no_scaling_confirmed stays on
-- artwork_component_items but is no longer surfaced in any UI. Removing
-- it is a separate cleanup if we decide it's truly dead.

BEGIN;

CREATE TABLE IF NOT EXISTS public.artwork_production_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artwork_job_id UUID NOT NULL
        REFERENCES public.artwork_jobs(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE
        CHECK (length(token) = 64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_artwork_production_approvals_job
    ON public.artwork_production_approvals(artwork_job_id);
CREATE INDEX IF NOT EXISTS idx_artwork_production_approvals_token
    ON public.artwork_production_approvals(token);

ALTER TABLE public.artwork_production_approvals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage production approvals"
    ON public.artwork_production_approvals FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- The public production-sign-off page reads + writes via the service-role
-- key (token is the gate), so no public-facing policy is required.

ALTER TABLE public.artwork_component_items
    ADD COLUMN IF NOT EXISTS production_changes_requested_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS production_changes_comment TEXT
        CHECK (production_changes_comment IS NULL
            OR length(production_changes_comment) <= 2000);

CREATE INDEX IF NOT EXISTS idx_artwork_component_items_prod_changes
    ON public.artwork_component_items(production_changes_requested_at)
    WHERE production_changes_requested_at IS NOT NULL;

COMMENT ON COLUMN public.artwork_component_items.production_changes_requested_at IS
    'Stamped when the production approver (Chris/John) flags a sub-item as NOT ok to fabricate. Clears when the designer re-submits and the approver re-signs.';
COMMENT ON COLUMN public.artwork_component_items.production_changes_comment IS
    'Free-text reason written by the approver on the /production-sign-off link when they request changes to this sub-item.';

COMMIT;
