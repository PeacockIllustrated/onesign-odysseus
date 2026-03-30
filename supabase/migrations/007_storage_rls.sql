-- Migration: Storage RLS Policies
-- Enables access to client-assets bucket based on org membership

-- Ensure bucket exists (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('client-assets', 'client-assets', false)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on objects (standard, but good to ensure)
-- REMOVED: storage.objects already has RLS enabled and modifying it requires ownership permissions
-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES
-- =============================================================================

-- Policy: Users can view assets in their org's folder
-- Path: {org_id}/{filename}
CREATE POLICY "Users can view their org assets"
ON storage.objects FOR SELECT
USING (
    bucket_id = 'client-assets'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
);

-- Policy: Users can upload assets to their org's folder
CREATE POLICY "Users can upload org assets"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'client-assets'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
);

-- Policy: Users can delete/update assets in their org's folder
CREATE POLICY "Users can update/delete org assets"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'client-assets'
    AND public.is_org_member((storage.foldername(name))[1]::uuid)
);

-- Note: We generally don't allow UPDATE on storage objects (replacing files), 
-- but if needed, it would follow the same pattern.
