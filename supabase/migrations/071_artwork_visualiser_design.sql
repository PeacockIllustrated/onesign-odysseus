-- Migration 071: link an artwork job to a saved visualiser design
--
-- The client approval pack (/sign-off/[token]) shows the sign in interactive 3D
-- for the "wow factor", driven by the visualiser design itself — the same
-- load-on-click embed pattern the Spline URL uses (migrations 069/070), but
-- from a real linked design instead of a pasted URL.
--
-- A visualiser design only links to a job through the quote chain
-- (artwork_job → job_item → production_job → quote → quote_item →
-- visualiser_designs), which often doesn't exist for a standalone
-- visual-approval job. So we add a DIRECT, nullable link on the job — explicit,
-- reliable, and the same shape as spline_url. ON DELETE SET NULL: deleting the
-- design just unlinks it, never cascades the job away. Production packs read
-- the same link.

BEGIN;

ALTER TABLE public.artwork_jobs
    ADD COLUMN IF NOT EXISTS visualiser_design_id UUID
        REFERENCES public.visualiser_designs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_artwork_jobs_visualiser_design
    ON public.artwork_jobs(visualiser_design_id);

COMMIT;
