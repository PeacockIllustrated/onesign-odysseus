-- Migration: Deliverables Workflow Enhancement
-- Adds new status workflow, category tracking, and template linking

-- =============================================================================
-- STEP 1: Create new status enum (cannot alter existing enum easily)
-- =============================================================================

-- Create the new enum type
CREATE TYPE deliverable_status_v2 AS ENUM ('draft', 'review', 'approved', 'scheduled', 'done');

-- Add category enum for deliverable grouping
CREATE TYPE deliverable_category AS ENUM ('creative', 'campaign', 'reporting', 'support');

-- =============================================================================
-- STEP 2: Add new columns to deliverables table
-- =============================================================================

-- Add category column
ALTER TABLE public.deliverables 
ADD COLUMN IF NOT EXISTS category deliverable_category DEFAULT 'campaign';

-- Add template_key to link deliverables to templates
ALTER TABLE public.deliverables 
ADD COLUMN IF NOT EXISTS template_key TEXT;

-- Add new status column with new enum
ALTER TABLE public.deliverables 
ADD COLUMN IF NOT EXISTS status_v2 deliverable_status_v2 DEFAULT 'draft';

-- =============================================================================
-- STEP 3: Migrate existing status values
-- =============================================================================

UPDATE public.deliverables SET status_v2 = 
    CASE status::text
        WHEN 'draft' THEN 'draft'::deliverable_status_v2
        WHEN 'in_progress' THEN 'review'::deliverable_status_v2
        WHEN 'submitted' THEN 'review'::deliverable_status_v2
        WHEN 'approved' THEN 'approved'::deliverable_status_v2
        WHEN 'rejected' THEN 'draft'::deliverable_status_v2
        ELSE 'draft'::deliverable_status_v2
    END;

-- =============================================================================
-- STEP 4: Swap status columns
-- =============================================================================

-- Drop old status column and rename new one
ALTER TABLE public.deliverables DROP COLUMN status;
ALTER TABLE public.deliverables RENAME COLUMN status_v2 TO status;

-- Make status NOT NULL with default
ALTER TABLE public.deliverables 
ALTER COLUMN status SET NOT NULL,
ALTER COLUMN status SET DEFAULT 'draft';

-- =============================================================================
-- STEP 5: Update deliverable_updates table for new statuses
-- =============================================================================

-- Add new status_change column with new enum
ALTER TABLE public.deliverable_updates 
ADD COLUMN IF NOT EXISTS status_change_v2 deliverable_status_v2;

-- Migrate any existing status changes
UPDATE public.deliverable_updates SET status_change_v2 = 
    CASE status_change::text
        WHEN 'draft' THEN 'draft'::deliverable_status_v2
        WHEN 'in_progress' THEN 'review'::deliverable_status_v2
        WHEN 'submitted' THEN 'review'::deliverable_status_v2
        WHEN 'approved' THEN 'approved'::deliverable_status_v2
        WHEN 'rejected' THEN 'draft'::deliverable_status_v2
        ELSE NULL
    END
WHERE status_change IS NOT NULL;

-- Drop old column and rename
ALTER TABLE public.deliverable_updates DROP COLUMN IF EXISTS status_change;
ALTER TABLE public.deliverable_updates RENAME COLUMN status_change_v2 TO status_change;

-- =============================================================================
-- STEP 6: Add index for template_key lookups
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_deliverables_template_key ON public.deliverables(template_key);
CREATE INDEX IF NOT EXISTS idx_deliverables_status ON public.deliverables(status);
CREATE INDEX IF NOT EXISTS idx_deliverables_category ON public.deliverables(category);

-- =============================================================================
-- STEP 7: Add is_super_admin check for generation permissions
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'super_admin'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- STEP 8: RLS policy for admin deliverable management
-- =============================================================================

-- Drop existing policy if it exists
DROP POLICY IF EXISTS "Admins can manage deliverables" ON public.deliverables;

-- Allow org admins to manage their org's deliverables
CREATE POLICY "Org admins can manage deliverables"
    ON public.deliverables FOR ALL
    USING (public.is_org_admin(org_id));

-- Allow super admins to manage all deliverables
CREATE POLICY "Super admins can manage all deliverables"
    ON public.deliverables FOR ALL
    USING (public.is_super_admin());

-- Allow super admins to insert deliverables for any org
CREATE POLICY "Super admins can insert deliverables"
    ON public.deliverables FOR INSERT
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- STEP 9: Cleanup old enum type (optional, can be done later)
-- =============================================================================

-- Note: We keep the old enum for now as it may be referenced elsewhere
-- DROP TYPE IF EXISTS deliverable_status;

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
