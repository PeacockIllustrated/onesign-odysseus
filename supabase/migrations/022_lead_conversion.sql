-- Migration: Add lead-to-org conversion bridge
-- Allows super admins to convert a marketing lead into an org + subscription in one transaction.

-- =============================================================================
-- COLUMNS: Track conversion state on marketing_leads
-- =============================================================================

ALTER TABLE public.marketing_leads
    ADD COLUMN converted_at TIMESTAMPTZ,
    ADD COLUMN converted_org_id UUID REFERENCES public.orgs(id);

CREATE INDEX idx_marketing_leads_converted_at ON public.marketing_leads(converted_at);

-- =============================================================================
-- RPC: convert_lead_to_org
-- =============================================================================

CREATE OR REPLACE FUNCTION public.convert_lead_to_org(
    lead_id UUID,
    org_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_lead RECORD;
    v_org_id UUID;
    v_slug TEXT;
    v_sub_id UUID;
    v_acc TEXT;
BEGIN
    -- Gate: super admin only
    IF NOT public.is_super_admin() THEN
        RAISE EXCEPTION 'Only super admins can convert leads';
    END IF;

    -- Fetch the lead
    SELECT * INTO v_lead FROM public.marketing_leads WHERE id = lead_id;
    IF v_lead IS NULL THEN
        RAISE EXCEPTION 'Lead not found: %', lead_id;
    END IF;
    IF v_lead.converted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Lead already converted at %', v_lead.converted_at;
    END IF;

    -- Determine org name (passed value takes precedence over lead company_name)
    IF org_name IS NULL OR org_name = '' THEN
        org_name := v_lead.company_name;
    END IF;

    -- Generate a URL-safe slug from the org name
    v_slug := lower(regexp_replace(org_name, '[^a-zA-Z0-9]+', '-', 'g'));
    v_slug := trim(BOTH '-' FROM v_slug);

    -- Ensure slug uniqueness by appending a short random suffix if taken
    IF EXISTS (SELECT 1 FROM public.orgs WHERE slug = v_slug) THEN
        v_slug := v_slug || '-' || substr(gen_random_uuid()::text, 1, 8);
    END IF;

    -- 1. Create org
    INSERT INTO public.orgs (name, slug)
    VALUES (org_name, v_slug)
    RETURNING id INTO v_org_id;

    -- 2. Create initial subscription from lead's package selection
    IF v_lead.package_key IS NOT NULL THEN
        INSERT INTO public.subscriptions (org_id, package_key, status)
        VALUES (v_org_id, v_lead.package_key, 'active')
        RETURNING id INTO v_sub_id;
    END IF;

    -- 3. Create accelerators from lead's selections
    IF v_lead.accelerator_keys IS NOT NULL AND array_length(v_lead.accelerator_keys, 1) > 0 THEN
        FOREACH v_acc IN ARRAY v_lead.accelerator_keys LOOP
            INSERT INTO public.subscription_accelerators (org_id, accelerator_key, status)
            VALUES (v_org_id, v_acc, 'active');
        END LOOP;
    END IF;

    -- 4. Mark lead as converted
    UPDATE public.marketing_leads
    SET converted_at = now(),
        converted_org_id = v_org_id
    WHERE id = lead_id;

    RETURN v_org_id;
END;
$$;
