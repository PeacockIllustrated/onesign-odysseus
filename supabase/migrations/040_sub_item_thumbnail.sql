-- Migration 040: per-sub-item thumbnail
--
-- Sub-items can optionally carry their own artwork thumbnail image (e.g. a
-- close-up of the vinyl strapline, separate from the panel-level artwork).
-- Component-level thumbnail on artwork_components.artwork_thumbnail_url stays
-- intact — this is additive, shown below the component image on the detail
-- page and on the print compliance sheet.

BEGIN;

ALTER TABLE public.artwork_component_items
    ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;

COMMENT ON COLUMN public.artwork_component_items.thumbnail_url IS
    'Optional per-sub-item thumbnail. Public URL into the artwork-assets bucket. Component-level thumbnail remains primary; this is for items that warrant their own close-up.';

COMMIT;
