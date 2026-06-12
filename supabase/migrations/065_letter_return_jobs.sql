-- Migration 065: built-up letter return jobs (+ nest source linkage)
--
-- Backs the "Built-up returns" tool (app/(portal)/admin/visualiser/returns):
-- read an outlined-letter SVG, compute the side-wall RETURN strips (the brass
-- bent around each face's edge AND every counter, broken into welded segments
-- at sharp corners and at the stock strip length), then hand the faces +
-- returns to the acrylic nester as ONE cut (same material).
--
-- Same access model as nesting_designs (064) / visualiser_designs (058):
-- super-admin manages everything via the service role; any authed Onesign
-- user can read/create. A return job is a standalone production aid — no
-- org/quote links, not part of the inheritance chain.
--
-- Also adds a back-reference on nesting_designs so a nest produced by "Send to
-- nester" knows which return job it came from (the tools link both ways).
-- ON DELETE SET NULL: deleting a return job orphans its nest, it never
-- cascades away cut data.

BEGIN;

CREATE TABLE IF NOT EXISTS public.letter_return_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 120),
    -- Raw uploaded outlined-letter SVG (the source of faces + returns).
    svg_source TEXT NOT NULL,
    -- { config: ReturnsConfig, widthMm: number|null, heightMm: number|null,
    --   fileName: string|null } — enough to reopen the job exactly.
    config_json JSONB NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_letter_return_jobs_updated_at
    ON public.letter_return_jobs(updated_at DESC);

ALTER TABLE public.letter_return_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage letter return jobs"
    ON public.letter_return_jobs FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can read letter return jobs"
    ON public.letter_return_jobs FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can create letter return jobs"
    ON public.letter_return_jobs FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

-- Nest → source return job back-reference (nullable; only set by "Send to
-- nester"). Lets the nester surface "part of built-up job X" and link back to
-- the returns tool, and lets the returns tool list where it was nested.
ALTER TABLE public.nesting_designs
    ADD COLUMN IF NOT EXISTS source_kind TEXT,
    ADD COLUMN IF NOT EXISTS source_job_id UUID
        REFERENCES public.letter_return_jobs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nesting_designs_source_job
    ON public.nesting_designs(source_job_id);

COMMIT;
