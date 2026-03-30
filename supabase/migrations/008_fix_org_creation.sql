-- Ensure authenticated users can create organizations
-- This fixes the "new row violates row-level security policy" error during org creation

-- First drop the policy if it exists to avoid conflicts
DROP POLICY IF EXISTS "Authenticated users can create orgs" ON public.orgs;

-- Create the policy to allow any authenticated user to create an org
CREATE POLICY "Authenticated users can create orgs"
    ON public.orgs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);
