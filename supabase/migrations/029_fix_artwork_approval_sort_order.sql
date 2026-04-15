-- Migration 029: Move Artwork Approval to position 2 (after Order Book)
-- Artwork must be approved before fabrication begins.
-- This is a fixup in case migration 028 was applied with the old sort order.

UPDATE public.production_stages SET sort_order = 2  WHERE slug = 'artwork-approval' AND is_default = TRUE;
UPDATE public.production_stages SET sort_order = 3  WHERE slug = 'cut-list'          AND is_default = TRUE;
UPDATE public.production_stages SET sort_order = 4  WHERE slug = 'laser'             AND is_default = TRUE;
UPDATE public.production_stages SET sort_order = 5  WHERE slug = 'cnc-routing'       AND is_default = TRUE;
UPDATE public.production_stages SET sort_order = 6  WHERE slug = 'plastic-fabrication' AND is_default = TRUE;
UPDATE public.production_stages SET sort_order = 7  WHERE slug = 'metal-fabrication' AND is_default = TRUE;
-- Painters (8), Lighting (9), Vinyl (10), Digital Print (11), Assembly (12), Goods Out (13) stay unchanged.
