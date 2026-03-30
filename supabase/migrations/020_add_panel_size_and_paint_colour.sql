-- Migration 020: Add panel_size and paint_colour to artwork_jobs
-- These fields display on the cover page for quick reference

ALTER TABLE artwork_jobs
ADD COLUMN panel_size TEXT DEFAULT NULL,
ADD COLUMN paint_colour TEXT DEFAULT NULL;
