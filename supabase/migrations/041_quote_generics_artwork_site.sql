-- Migration 041: generic quote items + artwork site inheritance + approval snapshot
--
-- Additive only. Existing panel_letters_v1 quote items keep working untouched.
-- See docs/superpowers/specs/2026-04-14-generic-quote-items-and-artwork-qol-design.md

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Close the inheritance gap: artwork_jobs gets site_id.
--    quotes, production_jobs, deliveries all have site_id already (034).
-- -----------------------------------------------------------------------------
ALTER TABLE public.artwork_jobs
    ADD COLUMN IF NOT EXISTS site_id UUID
        REFERENCES public.org_sites(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_site_id
    ON public.artwork_jobs(site_id);

-- -----------------------------------------------------------------------------
-- 2. Generic quote items — new columns on quote_items.
--    item_type stays TEXT; 'panel_letters_v1' continues to mean engine-calculated,
--    'generic' is the new free-form shape, 'service' is the subset of 'generic'
--    where is_production_work = false.
-- -----------------------------------------------------------------------------
ALTER TABLE public.quote_items
    ADD COLUMN IF NOT EXISTS part_label TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT,
    ADD COLUMN IF NOT EXISTS component_type TEXT,
    ADD COLUMN IF NOT EXISTS is_production_work BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS unit_cost_pence INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS quantity INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS markup_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS lighting TEXT,
    ADD COLUMN IF NOT EXISTS spec_notes TEXT;

-- Quantity sanity.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'quote_items_quantity_positive_chk'
    ) THEN
        ALTER TABLE public.quote_items
            ADD CONSTRAINT quote_items_quantity_positive_chk CHECK (quantity >= 1);
    END IF;
END $$;

COMMENT ON COLUMN public.quote_items.part_label IS
    'Short human-readable label ("Main fascia panel", "Fitting"). Matches Clarity''s Part Code field.';
COMMENT ON COLUMN public.quote_items.component_type IS
    'Optional mapping to an artwork component_type (panel, vinyl, acrylic...) — drives skeleton generation on acceptance.';
COMMENT ON COLUMN public.quote_items.is_production_work IS
    'True for items that produce artwork + enter fabrication. False for services (fitting, removal, survey).';

-- -----------------------------------------------------------------------------
-- 3. Approval snapshot columns — capture the client/site at link generation time
--    so the signed approval is a faithful record even if the org data changes later.
-- -----------------------------------------------------------------------------
ALTER TABLE public.artwork_approvals
    ADD COLUMN IF NOT EXISTS snapshot_contact_name TEXT,
    ADD COLUMN IF NOT EXISTS snapshot_contact_email TEXT,
    ADD COLUMN IF NOT EXISTS snapshot_site_name TEXT,
    ADD COLUMN IF NOT EXISTS snapshot_site_address TEXT;

COMMENT ON COLUMN public.artwork_approvals.snapshot_site_address IS
    'Multi-line address captured at link generation time (not a live FK). Source of truth for the public approval page''s install-address block.';

COMMIT;
