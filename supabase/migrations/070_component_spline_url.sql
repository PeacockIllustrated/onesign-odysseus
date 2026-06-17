-- Migration 070: optional Spline 3D scene URL per artwork component.
--
-- Complements the job-level spline_url (migration 069): individual components
-- can each carry their own 3D scene, shown click-to-load inside that
-- component's card on the public client approval pack. Optional; null for the
-- (vast) majority of components.

ALTER TABLE public.artwork_components
    ADD COLUMN IF NOT EXISTS spline_url TEXT;
