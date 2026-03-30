-- Patch: Add INSERT policies to enable signup flow
-- Run this if you already applied 002_create_portal_tables.sql

-- Allow authenticated users to create orgs
CREATE POLICY "Authenticated users can create orgs"
    ON public.orgs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Allow users to add themselves as owner to a new org (first member only)
CREATE POLICY "Users can add themselves as owner"
    ON public.org_members FOR INSERT
    WITH CHECK (
        user_id = auth.uid() 
        AND role = 'owner'
        AND NOT EXISTS (
            SELECT 1 FROM public.org_members om WHERE om.org_id = org_members.org_id
        )
    );

-- Drop the old restrictive policy if it exists
DROP POLICY IF EXISTS "Admins can insert members" ON public.org_members;

-- Add policy for admins to add other members
CREATE POLICY "Admins can insert other members"
    ON public.org_members FOR INSERT
    WITH CHECK (
        user_id != auth.uid() 
        AND public.is_org_admin(org_id)
    );
