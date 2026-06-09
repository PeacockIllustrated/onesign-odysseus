-- Migration 061: site surveys — digitise the on-site measure-up
--
-- Today a surveyor goes to site, measures the parts, and jots them on paper with
-- a crude sketch for the designers. Paper gets lost. This stores the survey in
-- Odysseus and is the source for a printable "survey pack" (a machine-drawn
-- dimensioned diagram per item + the surveyor's annotated photos + the build /
-- access conditions).
--
-- Shape (mirrors the quoter's quotes -> quote_items style, not one JSONB blob,
-- because photos attach to items and we list / reorder them):
--   site_surveys   — the visit header + site/access conditions
--   survey_items   — one row per measured sign / part (generic measurements)
--   survey_photos  — site photos with normalized-coordinate annotation markup
--
-- A survey sits UPSTREAM of a quote and may be taken for a prospect who isn't an
-- org yet, so org_id / site_id / contact_id are all nullable (with free-text
-- client_name / site_address fallbacks). A nullable maintenance_visit_id links a
-- survey to a scheduled maintenance 'survey' visit (048) when one exists.
--
-- Single-tenant internal tool — super-admin manages everything (mirrors
-- maintenance_visits 048 / design_requests 060). Photos live in a private
-- 'site-surveys' bucket; uploads + signed-URL reads go through the service-role
-- admin client server-side, so the bucket needs no object RLS.

BEGIN;

-- Auto-incrementing reference: SVY-YYYY-NNNNNN, matching the
-- OSD-/INV-/PO-/DSR- convention (CLAUDE.md "Conventions").
CREATE SEQUENCE IF NOT EXISTS survey_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.site_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE DEFAULT '',

    -- Inheritance chain (CLAUDE.md): set here, carried downstream, overridable.
    -- All nullable — a survey can precede the client/site existing as a record.
    org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
    site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    -- Optional link to a scheduled maintenance 'survey' visit (migration 048).
    maintenance_visit_id UUID REFERENCES public.maintenance_visits(id) ON DELETE SET NULL,

    -- Free-text fallbacks for a prospect not yet in the CRM.
    client_name TEXT,
    site_address TEXT,

    title TEXT,
    surveyor_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    survey_date DATE NOT NULL DEFAULT CURRENT_DATE,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'completed')),

    -- Site / access checklist: scaffolding_required, cherrypicker_required,
    -- traffic_management_required, power_available, permit_required (booleans),
    -- access_notes, parking_notes (text). Schema enforced in lib/site-surveys.
    conditions_json JSONB NOT NULL DEFAULT '{}'::jsonb,
    notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.survey_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES public.site_surveys(id) ON DELETE CASCADE,
    sort_order INTEGER NOT NULL DEFAULT 0,

    label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 200),
    sign_type TEXT,

    -- Generic measurements: { width_mm, height_mm, depth_mm, return_depth_mm,
    -- shadow_gap_mm, extra:[{label,value_mm}] }. The dimensioned sketch is drawn
    -- from this on the fly (lib/site-surveys/sketch.ts) — not stored.
    measurements_json JSONB NOT NULL DEFAULT '{}'::jsonb,

    -- Spec flags that change the build (and later the quote).
    has_returns BOOLEAN NOT NULL DEFAULT FALSE,
    shadow_gap_required BOOLEAN NOT NULL DEFAULT FALSE,
    new_fascia_required BOOLEAN NOT NULL DEFAULT FALSE,
    illuminated BOOLEAN NOT NULL DEFAULT FALSE,
    fixing_substrate TEXT,

    item_notes TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.survey_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES public.site_surveys(id) ON DELETE CASCADE,
    -- A photo may be attached to a specific item or be a general site photo.
    -- Deleting an item keeps its photos (unlinks them) — photos are precious.
    item_id UUID REFERENCES public.survey_items(id) ON DELETE SET NULL,

    -- Path inside the private 'site-surveys' storage bucket.
    file_path TEXT NOT NULL,
    -- Pixel size of the stored (downscaled) image, captured client-side. Lets
    -- the pack overlay annotations on an aspect-correct viewBox.
    width_px INTEGER,
    height_px INTEGER,
    caption TEXT,

    -- Annotation markup: array of normalized-coordinate shapes (measure lines,
    -- pins, notes, rects). Shape enforced in lib/site-surveys/types.ts.
    annotations_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_site_surveys_org
    ON public.site_surveys(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_site_surveys_status
    ON public.site_surveys(status);
CREATE INDEX IF NOT EXISTS idx_site_surveys_created_at
    ON public.site_surveys(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_survey_items_survey
    ON public.survey_items(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_photos_survey
    ON public.survey_photos(survey_id);
CREATE INDEX IF NOT EXISTS idx_survey_photos_item
    ON public.survey_photos(item_id) WHERE item_id IS NOT NULL;

-- Auto-generate the reference on insert (when left as the '' default), exactly
-- as generate_design_request_reference() does (migration 060).
CREATE OR REPLACE FUNCTION generate_survey_reference()
RETURNS TRIGGER AS $$
BEGIN
    NEW.reference := 'SVY-' || to_char(NOW(), 'YYYY') || '-' ||
        LPAD(nextval('survey_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_site_survey_reference
    BEFORE INSERT ON public.site_surveys
    FOR EACH ROW
    WHEN (NEW.reference = '')
    EXECUTE FUNCTION generate_survey_reference();

-- Reuse the shared updated_at helper (used since migration 048).
CREATE TRIGGER trg_site_surveys_updated_at
    BEFORE UPDATE ON public.site_surveys
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_survey_items_updated_at
    BEFORE UPDATE ON public.survey_items
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER trg_survey_photos_updated_at
    BEFORE UPDATE ON public.survey_photos
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.site_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.survey_photos ENABLE ROW LEVEL SECURITY;

-- Super-admin (Onesign staff) manage everything; mutations run through the
-- service-role admin client server-side (lib/site-surveys/actions.ts).
CREATE POLICY "Super admins manage site_surveys"
    ON public.site_surveys FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins manage survey_items"
    ON public.survey_items FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins manage survey_photos"
    ON public.survey_photos FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Private storage bucket for survey photos.
INSERT INTO storage.buckets (id, name, public)
VALUES ('site-surveys', 'site-surveys', FALSE)
ON CONFLICT (id) DO NOTHING;

COMMIT;
