-- Migration: Fix Super Admin Access
-- 1. Create is_super_admin function (missing in previous migrations)
-- 2. Ensure Super Admin policies exist for orgs and profiles

-- 1. Create Helper Function
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Profiles Policies
-- Super admins need to view all profiles to see member details
CREATE POLICY "Super admins can view all profiles"
    ON public.profiles FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can update all profiles"
    ON public.profiles FOR UPDATE
    USING (public.is_super_admin());

-- 3. Ensure Org policies exist (re-applying if 006 failed or wasn't run)
-- We use DO block to avoid error if policy already exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'orgs' AND policyname = 'Super admins can view all orgs'
    ) THEN
        CREATE POLICY "Super admins can view all orgs"
            ON public.orgs FOR SELECT
            USING (public.is_super_admin());
    END IF;

    -- Create/Update permission for orgs
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'orgs' AND policyname = 'Super admins can create orgs'
    ) THEN
        CREATE POLICY "Super admins can create orgs"
            ON public.orgs FOR INSERT
            WITH CHECK (public.is_super_admin());
    END IF;
    
    -- Update permission
     IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'orgs' AND policyname = 'Super admins can update all orgs'
    ) THEN
        CREATE POLICY "Super admins can update all orgs"
            ON public.orgs FOR UPDATE
            USING (public.is_super_admin());
    END IF;
END $$;
