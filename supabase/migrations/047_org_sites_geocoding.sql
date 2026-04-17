-- Migration 047: lat/lng on org_sites for map geocoding
-- Populated by postcodes.io on site create/update. Nullable — sites
-- without a valid UK postcode simply don't appear on the map.

BEGIN;

ALTER TABLE public.org_sites
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_org_sites_geocoded
  ON public.org_sites(latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

COMMIT;
