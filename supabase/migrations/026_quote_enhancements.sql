-- Migration 026: Quote enhancements
-- Adds client-facing notes, customer reference, and project name to quotes

ALTER TABLE public.quotes
    ADD COLUMN IF NOT EXISTS notes_client      TEXT,
    ADD COLUMN IF NOT EXISTS customer_reference TEXT,
    ADD COLUMN IF NOT EXISTS project_name       TEXT;
