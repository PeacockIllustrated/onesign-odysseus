-- Migration: a one-line summary of the job, shown on the schedule card.
--
-- The board already carries `notes` — "anything the fitters need to know" —
-- but notes is a free-text dumping ground that never reaches the card, and a
-- card that says only "Persimmon" tells the office who, never what. This is
-- the what: a short line under the customer name, sized below it, so a glance
-- at the wall answers "fascia or window graphics?" without opening anything.
--
-- Deliberately separate from `notes` rather than reusing it: notes is long,
-- private to the job, and would wrap a card into uselessness. Summary is
-- capped in the UI at a length that fits one or two lines on a card.
--
-- Additive and nullable: every existing job keeps rendering exactly as it does
-- today, with no backfill.

ALTER TABLE public.fitting_jobs
    ADD COLUMN IF NOT EXISTS summary TEXT;

COMMENT ON COLUMN public.fitting_jobs.summary IS
    'Short description of the work, rendered on the schedule card beneath the customer name in a smaller font. Distinct from notes, which is long-form and stays inside the job modal.';
