-- Migration: Add super_admin to user_role enum
-- The profiles.role column uses an enum type, not TEXT

-- Add 'super_admin' to the user_role enum if it doesn't exist
DO $$
BEGIN
    -- Check if super_admin already exists in the enum
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum 
        WHERE enumlabel = 'super_admin' 
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')
    ) THEN
        ALTER TYPE user_role ADD VALUE 'super_admin';
    END IF;
EXCEPTION
    WHEN duplicate_object THEN
        -- Value already exists, ignore
        NULL;
END $$;

-- =============================================================================
-- To make a user a super_admin, run this in Supabase SQL Editor:
-- =============================================================================
-- UPDATE public.profiles 
-- SET role = 'super_admin' 
-- WHERE id = 'YOUR_USER_UUID_HERE';
-- =============================================================================
