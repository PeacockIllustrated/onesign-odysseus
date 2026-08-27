-- Migration: multi-day jobs, an on-demand extra van, and three more PMs.
--
-- Three unrelated board changes that all land in the same tables, kept in one
-- migration so a deploy applies them together.

-- ---------------------------------------------------------------------------
-- 1. Jobs that run over more than one day.
-- ---------------------------------------------------------------------------
-- A fit is not always a day's work — a shopfront can take Monday to Wednesday,
-- and until now that needed three separate cards saying the same thing.
--
-- `scheduled_date` stays the anchor: it is the START, every existing query,
-- the drag & drop and the holding lanes are untouched, and a NULL end_date
-- means a single-day job exactly as before. The board renders a job in every
-- cell from scheduled_date through end_date inclusive.
--
-- A contiguous span rather than a set of dates: the office ticks days on a
-- week, and "Monday and Friday but not Tuesday" is two jobs, not one job with
-- a hole in it. The UI ticks fill the range so what is stored is what is seen.
ALTER TABLE public.fitting_jobs
    ADD COLUMN IF NOT EXISTS end_date DATE;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fitting_jobs_end_after_start'
    ) THEN
        ALTER TABLE public.fitting_jobs
            ADD CONSTRAINT fitting_jobs_end_after_start
            CHECK (end_date IS NULL OR scheduled_date IS NULL OR end_date >= scheduled_date);
    END IF;
END $$;

COMMENT ON COLUMN public.fitting_jobs.end_date IS
    'Last day of a multi-day fit, inclusive. NULL = a single-day job on scheduled_date. Always >= scheduled_date.';

-- Span lookups scan by start date; the board window query already filters on
-- scheduled_date, so this index carries the overlap test too.
CREATE INDEX IF NOT EXISTS idx_fitting_jobs_span
    ON public.fitting_jobs (scheduled_date, end_date)
    WHERE archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. An additional van, switched on from the board.
-- ---------------------------------------------------------------------------
-- Vans are the stable board columns (CLAUDE.md §2d), so a fourth one cannot
-- just be added and left there — it would sit empty most weeks and steal a
-- quarter of the width from the three that are always running. Flagging it
-- `is_additional` lets the toolbar switch it on for the weeks a hired or spare
-- van is out, and off again afterwards.
--
-- The switch is `is_active` on the row, which means it is DATABASE state, not
-- a per-device preference: the workshop TV sees the extra column the moment
-- the office turns it on, over the same Realtime channel as everything else.
ALTER TABLE public.vans
    ADD COLUMN IF NOT EXISTS is_additional BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.vans.is_additional IS
    'Marks the spare/hired van that the board can switch on and off. Toggled via is_active, which is shared state so every board and the workshop TV agree.';

-- Seeded switched OFF, so the board looks exactly as it does today until
-- somebody turns it on. Guarded by name so a re-run cannot duplicate it.
INSERT INTO public.vans (name, sort_order, is_active, is_additional)
SELECT 'Van 4', 4, FALSE, TRUE
WHERE NOT EXISTS (
    SELECT 1 FROM public.vans WHERE is_additional
);

-- ---------------------------------------------------------------------------
-- 3. The project managers, as the office actually runs them.
-- ---------------------------------------------------------------------------
-- 074 seeded four, and only when the table was completely empty — so this
-- cannot reuse that pattern or it would insert nothing. Guarded per NAME
-- instead, which makes it additive: PMs already present keep their colour and
-- their jobs, and only the missing ones are created.
--
-- Colours are picked to stay distinct from the four already seeded (amber,
-- green, red, blue) once mixed to ~12% against a white card — card colour is
-- whose job it is, so two PMs that read alike defeat the board.
INSERT INTO public.project_managers (name, colour, sort_order)
SELECT v.name, v.colour, v.sort_order
FROM (VALUES
    ('Lucy',    '#9333ea', 5),
    ('John',    '#0f766e', 6),
    ('Davey',   '#c2410c', 7),
    ('Adam',    '#199c63', 2),
    ('Michael', '#d64545', 3)
) AS v(name, colour, sort_order)
WHERE NOT EXISTS (
    SELECT 1 FROM public.project_managers p WHERE lower(p.name) = lower(v.name)
);
