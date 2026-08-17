-- Migration 074: fitting schedule (the digital board)
--
-- The wall whiteboard that schedules Onesign's fitting teams, made live.
-- Model follows the agreed principle "people move, vans don't": vans are the
-- stable board columns, fitters are a separate roster with a standing pairing
-- per van and per-day overrides for holidays and swaps.
--
-- The fitting job is the missing last node of the quote -> artwork ->
-- production -> delivery chain, so it is an inheritance-chain citizen:
-- org_id / contact_id / site_id are inherited and overridable, with free-text
-- fallbacks (same pattern as site_surveys, migration 061) for urgent work that
-- reaches the board before anyone raises a quote.
--
-- Access model mirrors nesting_designs / backshop_items: super-admin manages,
-- any authed Onesign user can read and create. Realtime-published so every
-- open board and the workshop TV stay in sync.

BEGIN;

-- ---------------------------------------------------------------------------
-- Project managers — card colour is whose job it is, not a status.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.project_managers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    -- Base hex. The board derives card background / border / chip from this
    -- via color-mix() against the active theme's panel colour, so a newly
    -- added PM gets a usable card in both light and dark without a second
    -- value being chosen by hand.
    colour TEXT NOT NULL CHECK (colour ~* '^#[0-9a-f]{6}$'),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Vans — the stable board columns. A fourth van is plausible, hence a table.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Fitters — two groups the UI keeps visually separate. Leavers are
-- deactivated, never deleted, so historic day crews still resolve.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fitters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
    roster_group TEXT NOT NULL DEFAULT 'crew'
        CHECK (roster_group IN ('crew', 'additional')),
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Standing pairing per van — applies to every day unless overridden.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.default_crew (
    van_id UUID NOT NULL REFERENCES public.vans(id) ON DELETE CASCADE,
    fitter_id UUID NOT NULL REFERENCES public.fitters(id) ON DELETE CASCADE,
    PRIMARY KEY (van_id, fitter_id)
);

-- A fitter has one standing van, so the same person can't be the default
-- crew of two vans at once.
CREATE UNIQUE INDEX IF NOT EXISTS idx_default_crew_one_van_per_fitter
    ON public.default_crew(fitter_id);

-- ---------------------------------------------------------------------------
-- Per-day overrides — holidays and swaps. One row per fitter per changed day;
-- days with no rows fall back to default_crew.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.day_crew_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    fitter_id UUID NOT NULL REFERENCES public.fitters(id) ON DELETE CASCADE,
    -- 'van' = out fitting on van_id; 'holiday' = off on leave;
    -- 'off' = in the workshop rather than out fitting.
    assignment TEXT NOT NULL CHECK (assignment IN ('van', 'holiday', 'off')),
    van_id UUID REFERENCES public.vans(id) ON DELETE CASCADE,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT day_crew_van_id_matches_assignment
        CHECK ((assignment = 'van') = (van_id IS NOT NULL)),
    UNIQUE (date, fitter_id)
);

CREATE INDEX IF NOT EXISTS idx_day_crew_overrides_date
    ON public.day_crew_overrides(date);

-- ---------------------------------------------------------------------------
-- Fitting jobs — one job = one card.
-- ---------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.fitting_job_number_seq;

CREATE TABLE IF NOT EXISTS public.fitting_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_ref TEXT NOT NULL UNIQUE DEFAULT '',

    -- Inheritance chain. Nullable because an urgent callout can hit the board
    -- before a quote exists; the *_fallback columns cover that case.
    org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
    contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL,
    quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    production_job_id UUID REFERENCES public.production_jobs(id) ON DELETE SET NULL,

    -- Free-text fallbacks + the display fields the board reads directly.
    customer_fallback TEXT,
    -- Kept alongside quote_id for jobs that pre-date Odysseus or arrive
    -- outside the quote flow.
    quote_ref TEXT,
    location TEXT,
    postcode TEXT,
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,

    pm_id UUID REFERENCES public.project_managers(id) ON DELETE SET NULL,

    -- Placement. scheduled_date NULL = unscheduled, sitting in a holding
    -- panel identified by `lane`.
    van_id UUID REFERENCES public.vans(id) ON DELETE SET NULL,
    scheduled_date DATE,
    lane TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (lane IN ('scheduled', 'delivery')),
    slot TEXT NOT NULL DEFAULT 'AM'
        CHECK (slot IN ('AM', 'PM', 'DAY', 'OOH')),
    sort_order INTEGER NOT NULL DEFAULT 0,

    done BOOLEAN NOT NULL DEFAULT FALSE,
    done_at TIMESTAMPTZ,
    -- Materials drop off ahead of the fit. Renders a marker on the card
    -- rather than forcing a second entry on the board.
    delivery_required BOOLEAN NOT NULL DEFAULT FALSE,
    delivery_id UUID REFERENCES public.deliveries(id) ON DELETE SET NULL,

    crew_override TEXT,
    access_equipment TEXT,
    notes TEXT,

    -- Jobs are a permanent record: completed work stays on the board ticked
    -- and struck through, and even an explicit delete is a soft archive.
    archived_at TIMESTAMPTZ,

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- A scheduled job needs a van; an unscheduled one sits in a holding lane.
    CONSTRAINT fitting_jobs_scheduled_has_van
        CHECK (scheduled_date IS NULL OR van_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_fitting_jobs_date
    ON public.fitting_jobs(scheduled_date)
    WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fitting_jobs_holding
    ON public.fitting_jobs(lane, created_at)
    WHERE scheduled_date IS NULL AND archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_fitting_jobs_quote
    ON public.fitting_jobs(quote_id) WHERE quote_id IS NOT NULL;

-- FIT-YYYY-NNNNNN, same trigger pattern as invoices / design requests.
CREATE OR REPLACE FUNCTION public.set_fitting_job_ref()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.job_ref IS NULL OR NEW.job_ref = '' THEN
        NEW.job_ref := 'FIT-' || to_char(now(), 'YYYY') || '-' ||
            lpad(nextval('public.fitting_job_number_seq')::TEXT, 6, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fitting_job_ref ON public.fitting_jobs;
CREATE TRIGGER trg_fitting_job_ref
    BEFORE INSERT ON public.fitting_jobs
    FOR EACH ROW EXECUTE FUNCTION public.set_fitting_job_ref();

CREATE OR REPLACE FUNCTION public.touch_fitting_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.updated_at := now();
    -- Keep done_at honest in both directions so the permanent record shows
    -- when work was actually signed off.
    IF NEW.done AND NOT OLD.done THEN
        NEW.done_at := now();
    ELSIF NOT NEW.done AND OLD.done THEN
        NEW.done_at := NULL;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_touch_fitting_job ON public.fitting_jobs;
CREATE TRIGGER trg_touch_fitting_job
    BEFORE UPDATE ON public.fitting_jobs
    FOR EACH ROW EXECUTE FUNCTION public.touch_fitting_job();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.project_managers   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitters            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.default_crew       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.day_crew_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fitting_jobs       ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'project_managers', 'vans', 'fitters',
        'default_crew', 'day_crew_overrides', 'fitting_jobs'
    ] LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS "Super admins manage %1$s" ON public.%1$I', t);
        EXECUTE format(
            'CREATE POLICY "Super admins manage %1$s" ON public.%1$I
               FOR ALL TO authenticated
               USING (public.is_super_admin())
               WITH CHECK (public.is_super_admin())', t);
        EXECUTE format(
            'DROP POLICY IF EXISTS "Authed users can read %1$s" ON public.%1$I', t);
        EXECUTE format(
            'CREATE POLICY "Authed users can read %1$s" ON public.%1$I
               FOR SELECT TO authenticated
               USING (auth.uid() IS NOT NULL)', t);
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Realtime — the whole point of the board. Every open screen and the
-- workshop TV must see a change within a couple of seconds.
-- ---------------------------------------------------------------------------
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'fitting_jobs', 'day_crew_overrides', 'default_crew',
        'vans', 'fitters', 'project_managers'
    ] LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables
            WHERE pubname = 'supabase_realtime'
              AND schemaname = 'public'
              AND tablename = t
        ) THEN
            EXECUTE format(
                'ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Seed: the four PMs, three vans and the roster as it stands today.
-- ---------------------------------------------------------------------------
-- Guarded with NOT EXISTS rather than a unique constraint on name: two people
-- can share a first name, and two vans could legitimately be renamed alike.
INSERT INTO public.project_managers (name, colour, sort_order)
SELECT * FROM (VALUES
    ('Chris',   '#d69713', 1),
    ('Adam',    '#199c63', 2),
    ('Michael', '#d64545', 3),
    ('Mak',     '#2f7fd1', 4)
) AS seed(name, colour, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.project_managers);

INSERT INTO public.vans (name, sort_order)
SELECT * FROM (VALUES
    ('Van 1', 1), ('Van 2', 2), ('Van 3', 3)
) AS seed(name, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.vans);

INSERT INTO public.fitters (name, roster_group, sort_order)
SELECT * FROM (VALUES
    ('Paul',    'crew', 1),
    ('Aaron',   'crew', 2),
    ('Dave',    'crew', 3),
    ('Mark',    'crew', 4),
    ('Lewis',   'crew', 5),
    ('Josh',    'crew', 6),
    ('Mak',       'additional', 1),
    ('Bob',       'additional', 2),
    ('Lee',       'additional', 3),
    ('Gary Mac',  'additional', 4),
    ('Alex',      'additional', 5),
    ('Scott',     'additional', 6),
    ('Adam',      'additional', 7),
    ('David S',   'additional', 8),
    ('Chris',     'additional', 9)
) AS seed(name, roster_group, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.fitters);

-- Standing pairings: Van 1 Paul & Aaron, Van 2 Dave & Mark, Van 3 Josh & Lewis.
INSERT INTO public.default_crew (van_id, fitter_id)
SELECT v.id, f.id
FROM (VALUES
    ('Van 1', 'Paul'), ('Van 1', 'Aaron'),
    ('Van 2', 'Dave'), ('Van 2', 'Mark'),
    ('Van 3', 'Josh'), ('Van 3', 'Lewis')
) AS pair(van_name, fitter_name)
JOIN public.vans v ON v.name = pair.van_name
JOIN public.fitters f
    ON f.name = pair.fitter_name AND f.roster_group = 'crew'
ON CONFLICT DO NOTHING;

COMMIT;
