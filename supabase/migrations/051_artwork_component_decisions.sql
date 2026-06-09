-- Migration 051: per-component client approval decisions
--
-- Until now artwork_approvals recorded a single status for the whole job:
-- approved / changes_requested / revoked / expired. That made the client's
-- feedback too coarse — one typo in one component meant rejecting the entire
-- pack. This migration adds per-component decisions so a client can tick off
-- individual lines and leave comments against each.
--
-- The overall artwork_approvals.status is derived at submission time:
--   * all components approved   → 'approved'
--   * any component changes_req → 'changes_requested'
--   * otherwise stays 'pending'

BEGIN;

CREATE TABLE IF NOT EXISTS public.artwork_component_decisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    approval_id UUID NOT NULL
        REFERENCES public.artwork_approvals(id) ON DELETE CASCADE,
    component_id UUID NOT NULL
        REFERENCES public.artwork_components(id) ON DELETE CASCADE,
    decision TEXT NOT NULL
        CHECK (decision IN ('approved', 'changes_requested')),
    comment TEXT CHECK (comment IS NULL OR length(comment) <= 2000),
    decided_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (approval_id, component_id)
);

CREATE INDEX IF NOT EXISTS idx_acd_approval
    ON public.artwork_component_decisions(approval_id);
CREATE INDEX IF NOT EXISTS idx_acd_component
    ON public.artwork_component_decisions(component_id);

ALTER TABLE public.artwork_component_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage component decisions"
    ON public.artwork_component_decisions FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- The public approval page writes these via the service-role key
-- (the token check happens in the server action), so no public
-- insert policy is required here — RLS stays locked down.

COMMIT;
