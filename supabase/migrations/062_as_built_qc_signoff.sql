-- Migration 062: separate as-built QC from "approved to fabricate".
--
-- Audit B5: the shop-floor guided check and the /production-sign-off token
-- flow both wrote artwork_component_items.production_signed_off_at, with no
-- coordination — the floor path skipped the component/approval rollup, and
-- each rejected the other ("production already signed off"). They are two
-- different things:
--
--   * production_signed_off_at  — set ONLY by the token flow (Chris/John):
--       "this sub-item is approved to fabricate". Feeds release readiness.
--   * as_built_signed_off_at    — set by the shop-floor worker at the end of
--       the guided check: "the piece I built matches spec". As-built QC.
--
-- This migration gives the as-built QC its own column so the two no longer
-- collide. production_signed_off_at is left to the token flow.

BEGIN;

ALTER TABLE public.artwork_component_items
    ADD COLUMN IF NOT EXISTS as_built_signed_off_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS as_built_signed_off_by UUID
        REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artwork_component_items_as_built
    ON public.artwork_component_items(as_built_signed_off_at)
    WHERE as_built_signed_off_at IS NOT NULL;

COMMENT ON COLUMN public.artwork_component_items.as_built_signed_off_at IS
    'Stamped when a shop-floor worker completes the guided check confirming the fabricated piece matches spec. Distinct from production_signed_off_at (the token "approved to fabricate" gate).';

COMMIT;
