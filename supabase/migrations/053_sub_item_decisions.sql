-- Migration 053: per-sub-item client approval decisions
--
-- Migration 051 recorded one decision per component. In practice each
-- component's sub-items are different design variants (A "Centred Tall",
-- B "Centre One-Line" …) and the client needs to approve each
-- individually — or approve one and request tweaks on another.
--
-- This migration adds sub_item_id to artwork_component_decisions:
--   * sub_item_id IS NOT NULL  → decision is about one sub-item
--   * sub_item_id IS NULL      → decision covers the whole component
--                                (components with no sub-items fall back
--                                 to this behaviour)
-- Uniqueness is enforced by two partial indexes so both shapes can
-- coexist on the same approval.

BEGIN;

ALTER TABLE public.artwork_component_decisions
    ADD COLUMN IF NOT EXISTS sub_item_id UUID
        REFERENCES public.artwork_component_items(id) ON DELETE CASCADE;

-- Drop the old single uniqueness; split into two partial-unique indexes.
ALTER TABLE public.artwork_component_decisions
    DROP CONSTRAINT IF EXISTS artwork_component_decisions_approval_id_component_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_acd_sub_item
    ON public.artwork_component_decisions(approval_id, sub_item_id)
    WHERE sub_item_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_acd_component_only
    ON public.artwork_component_decisions(approval_id, component_id)
    WHERE sub_item_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_acd_sub_item
    ON public.artwork_component_decisions(sub_item_id)
    WHERE sub_item_id IS NOT NULL;

COMMIT;
