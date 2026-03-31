-- Migration 032: Add new artwork component types for full production pipeline coverage
-- Adds: digital_print, flat_cut_letters, channel_letters, engraved, led_module
-- Each maps to a production department via component_stage_defaults.

-- 1. Drop and recreate the CHECK constraint with new types
ALTER TABLE public.artwork_components
    DROP CONSTRAINT IF EXISTS artwork_components_component_type_check;

ALTER TABLE public.artwork_components
    ADD CONSTRAINT artwork_components_component_type_check
    CHECK (component_type IN (
        'panel', 'vinyl', 'acrylic', 'push_through',
        'dibond', 'aperture_cut', 'foamex',
        'digital_print', 'flat_cut_letters', 'channel_letters',
        'engraved', 'led_module',
        'other'
    ));

-- 2. Seed default department mappings for new types
INSERT INTO public.component_stage_defaults (component_type, stage_id) VALUES
  ('digital_print',    (SELECT id FROM public.production_stages WHERE slug = 'digital-print'      AND is_default = TRUE)),
  ('flat_cut_letters', (SELECT id FROM public.production_stages WHERE slug = 'laser'               AND is_default = TRUE)),
  ('channel_letters',  (SELECT id FROM public.production_stages WHERE slug = 'metal-fabrication'   AND is_default = TRUE)),
  ('engraved',         (SELECT id FROM public.production_stages WHERE slug = 'laser'               AND is_default = TRUE)),
  ('led_module',       (SELECT id FROM public.production_stages WHERE slug = 'lighting'            AND is_default = TRUE))
ON CONFLICT DO NOTHING;
