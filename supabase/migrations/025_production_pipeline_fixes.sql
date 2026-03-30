-- Migration 025: Production pipeline fixes
-- 1. Unique constraint to prevent duplicate jobs from the same quote
-- 2. Broader RLS for shop floor staff to read stage logs and instructions

-- =============================================================================
-- 1. UNIQUE CONSTRAINT on production_jobs.quote_id
-- =============================================================================
-- Prevents race condition where two requests create jobs from the same quote.
-- Partial index (WHERE quote_id IS NOT NULL) allows multiple null values.

CREATE UNIQUE INDEX IF NOT EXISTS production_jobs_quote_id_unique
    ON public.production_jobs (quote_id)
    WHERE quote_id IS NOT NULL;

-- =============================================================================
-- 2. BROADER RLS POLICIES — allow authenticated users to read stage logs
--    and department instructions (needed for shop floor tablet view)
-- =============================================================================

-- job_stage_log: add SELECT for authenticated users
CREATE POLICY "Authenticated users can view stage logs"
    ON public.job_stage_log FOR SELECT
    TO authenticated
    USING (true);

-- department_instructions: add SELECT for authenticated users
CREATE POLICY "Authenticated users can view department instructions"
    ON public.department_instructions FOR SELECT
    TO authenticated
    USING (true);
