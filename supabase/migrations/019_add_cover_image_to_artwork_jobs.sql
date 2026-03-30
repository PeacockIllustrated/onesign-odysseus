-- Migration 019: Add cover image field to artwork_jobs
-- Allows admins to upload an overview image for the job cover page

ALTER TABLE artwork_jobs
ADD COLUMN cover_image_path TEXT DEFAULT NULL;

COMMENT ON COLUMN artwork_jobs.cover_image_path IS 'Storage path for cover page overview image (stored in artwork-assets bucket)';
