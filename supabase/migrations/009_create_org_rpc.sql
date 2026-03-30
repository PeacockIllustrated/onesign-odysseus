-- Migration: Create secure RPC for organization creation
-- This bypasses RLS policies safely to allow authenticated users to create orgs and become owners immediately.

-- Drop the old function signature if it exists (needed because we renamed parameters)
DROP FUNCTION IF EXISTS public.create_new_org(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.create_new_org(
    org_name TEXT,
    org_slug TEXT,
    owner_email_opt TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_org_id UUID;
    new_org JSONB;
    profile_id UUID;
BEGIN
    -- 1. Create the Organization
    INSERT INTO public.orgs (name, slug)
    VALUES (org_name, org_slug)
    RETURNING id INTO new_org_id;

    -- 2. Add the current user as the Owner
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (new_org_id, auth.uid(), 'owner');

    -- 3. If an owner email was provided, finding that user and adding them as OWNER as well
    IF owner_email_opt IS NOT NULL AND owner_email_opt != '' THEN
        SELECT id INTO profile_id FROM public.profiles WHERE email = owner_email_opt;
        
        IF profile_id IS NOT NULL AND profile_id != auth.uid() THEN
            INSERT INTO public.org_members (org_id, user_id, role)
            VALUES (new_org_id, profile_id, 'owner')
            ON CONFLICT (org_id, user_id) DO NOTHING;
        END IF;
    END IF;

    -- 4. Return the new Org object
    SELECT jsonb_build_object(
        'id', id,
        'name', name,
        'slug', slug,
        'created_at', created_at
    ) INTO new_org
    FROM public.orgs
    WHERE id = new_org_id;

    RETURN new_org;
END;
$$;
