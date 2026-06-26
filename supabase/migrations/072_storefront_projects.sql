-- Migration 072: Storefront Studio projects
--
-- Persists a prospect's reconstructed shopfront (Storefront Studio). The model
-- is a parametric BLOCK spec (lib/storefront) — never an AI mesh — stored as
-- JSON, so a visualiser sign drops into the fascia mount at exact mm scale.
--
-- Source of truth: a nullable survey_id links the project to a site survey
-- (061), whose measured dimensions anchor the photo trace. A nullable
-- linked_visualiser_design_id records the sign placed into the fascia.
--
-- Inheritance chain (CLAUDE.md): org_id / site_id / contact_id carried for the
-- usual downstream linkage; all nullable since a prospect may have no org yet
-- (mirrors site_surveys, 061). Super-admin-only RLS, like visualiser_designs
-- (058) / site_surveys (061). Reference STF-YYYY-NNNNNN per the convention.

BEGIN;

CREATE SEQUENCE IF NOT EXISTS storefront_project_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.storefront_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE DEFAULT '',

    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),

    -- Inheritance chain (all nullable — a prospect may not be an org yet).
    org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
    site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,

    -- Dimensional source of truth + the placed sign.
    survey_id UUID REFERENCES public.site_surveys(id) ON DELETE SET NULL,
    linked_visualiser_design_id UUID REFERENCES public.visualiser_designs(id) ON DELETE SET NULL,

    -- The parametric block spec (lib/storefront StorefrontSpec).
    spec_json JSONB NOT NULL,
    -- Optional reference photo (data URL or storage URL) the trace was built on.
    reference_image_url TEXT,

    status TEXT NOT NULL DEFAULT 'draft',

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_projects_org
    ON public.storefront_projects(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storefront_projects_survey
    ON public.storefront_projects(survey_id) WHERE survey_id IS NOT NULL;

-- Auto-generate STF-YYYY-NNNNNN on insert (when left as the '' default),
-- exactly as generate_survey_reference() does (migration 061).
CREATE OR REPLACE FUNCTION generate_storefront_project_reference()
RETURNS TRIGGER AS $$
BEGIN
    NEW.reference := 'STF-' || to_char(NOW(), 'YYYY') || '-' ||
        lpad(nextval('storefront_project_number_seq')::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_storefront_project_reference ON public.storefront_projects;
CREATE TRIGGER trg_storefront_project_reference
    BEFORE INSERT ON public.storefront_projects
    FOR EACH ROW
    WHEN (NEW.reference = '')
    EXECUTE FUNCTION generate_storefront_project_reference();

-- Super-admin-only (writes go through the service-role admin client).
ALTER TABLE public.storefront_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS storefront_projects_super_admin ON public.storefront_projects;
CREATE POLICY storefront_projects_super_admin ON public.storefront_projects
    FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

COMMIT;
