-- Helper script to manually link a user to an organization
-- Usage: Replace 'YOUR_EMAIL_HERE' with your email address

DO $$
DECLARE
    -- INPUTS:
    v_user_email TEXT := 'YOUR_EMAIL_HERE'; -- Change this to your email
    v_org_slug TEXT := NULL; -- Optional: Set to specific org slug (e.g. 'onesign'). If NULL, uses the most recent org.
    
    -- VARIABLES:
    v_user_id UUID;
    v_org_id UUID;
    v_org_name TEXT;
BEGIN
    -- 1. Find User ID from Profiles
    SELECT id INTO v_user_id FROM public.profiles WHERE email = v_user_email;
    
    -- If not found in profiles, try auth.users (if you have permission to view it)
    IF v_user_id IS NULL THEN
        SELECT id INTO v_user_id FROM auth.users WHERE email = v_user_email;
    END IF;

    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'User not found with email: %', v_user_email;
    END IF;

    -- 2. Find Organization ID
    IF v_org_slug IS NOT NULL THEN
        SELECT id, name INTO v_org_id, v_org_name FROM public.orgs WHERE slug = v_org_slug;
    ELSE
        -- Default to the most recently created organization
        SELECT id, name INTO v_org_id, v_org_name FROM public.orgs ORDER BY created_at DESC LIMIT 1;
    END IF;

    IF v_org_id IS NULL THEN
        RAISE EXCEPTION 'No organization found.';
    END IF;

    -- 3. Insert or Update Membership
    INSERT INTO public.org_members (org_id, user_id, role)
    VALUES (v_org_id, v_user_id, 'owner')
    ON CONFLICT (org_id, user_id) 
    DO UPDATE SET role = 'owner';
    
    RAISE NOTICE 'SUCCESS: Users % linked to Org "%" matches id %', v_user_email, v_org_name, v_org_id;
END $$;
