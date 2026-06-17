-- Migration 069: optional Spline 3D scene URL on artwork jobs.
--
-- Some signage concepts are modelled in 3D (Spline). When a job has a Spline
-- share URL, the public client approval pack (/sign-off/[token]) embeds the
-- interactive scene as a "wow" hero. Entirely optional — most jobs leave it
-- null. Stored on the job so it travels with the approval pack like the rest
-- of the cover detail (panel size, paint colour, cover image).

ALTER TABLE public.artwork_jobs
    ADD COLUMN IF NOT EXISTS spline_url TEXT;
