-- Migration 079: Sign calculator (panel_letters_v2)
--
-- Brings Mak's standalone pricing calculator into Odysseus. Two tables:
--
--   calculator_price_books — the calculator's price book as one JSON document,
--     versioned. Every save inserts a new row; nothing is ever updated in place,
--     so a priced job can always name the exact prices it used, and the quote
--     stamp ("priced from v7, saved 5 Oct by …") is true by construction rather
--     than depending on someone remembering to export.
--
--     Why not the 012 rate-card tables: v2 needs data they cannot hold without
--     breaking v1 for existing quotes (real sheet dimensions and an active
--     flag, an illumination SELL price per letter, joint allowance, sheet
--     sharing, cutting priority). v1 keeps its tables and its quotes keep their
--     prices; v2 owns this document.
--
--   calculator_jobs — saved calculations, so "new job" no longer throws the
--     last one away. Ref CAL-YYYY-NNNNNN. A job that has been turned into a
--     quote links to it (quote_id); the quote is then the record that flows on
--     to artwork, and the job is the working behind it.
--
-- Super-admin only, matching the quoter tables in 012.

-- ---------------------------------------------------------------------------
-- Price book versions
-- ---------------------------------------------------------------------------

CREATE TABLE public.calculator_price_books (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    version INTEGER NOT NULL UNIQUE CHECK (version > 0),
    book JSONB NOT NULL,
    note TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_by_email TEXT
);

CREATE INDEX idx_calculator_price_books_version
    ON public.calculator_price_books (version DESC);

-- Versions are history: never rewritten.
CREATE OR REPLACE FUNCTION public.calculator_price_books_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'calculator price book versions are immutable — save a new version instead';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculator_price_books_immutable
    BEFORE UPDATE ON public.calculator_price_books
    FOR EACH ROW EXECUTE FUNCTION public.calculator_price_books_immutable();

-- ---------------------------------------------------------------------------
-- Saved jobs
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS calculator_job_number_seq START 1;

CREATE TABLE public.calculator_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    reference TEXT UNIQUE,
    title TEXT NOT NULL DEFAULT 'Untitled job',
    client_name TEXT,
    org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
    job JSONB NOT NULL,
    -- 0 = priced from the built-in defaults, before any book was saved.
    price_book_version INTEGER NOT NULL DEFAULT 0,
    net_pence INTEGER NOT NULL DEFAULT 0 CHECK (net_pence >= 0),
    gross_pence INTEGER NOT NULL DEFAULT 0 CHECK (gross_pence >= 0),
    quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_calculator_jobs_updated ON public.calculator_jobs (updated_at DESC);
CREATE INDEX idx_calculator_jobs_quote ON public.calculator_jobs (quote_id);

CREATE OR REPLACE FUNCTION public.generate_calculator_job_reference()
RETURNS TRIGGER AS $$
BEGIN
    NEW.reference := 'CAL-' || to_char(now() AT TIME ZONE 'UTC', 'YYYY') || '-'
        || lpad(nextval('calculator_job_number_seq')::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calculator_jobs_reference
    BEFORE INSERT ON public.calculator_jobs
    FOR EACH ROW
    WHEN (NEW.reference IS NULL)
    EXECUTE FUNCTION public.generate_calculator_job_reference();

-- update_updated_at() is defined in 012.
CREATE TRIGGER trg_calculator_jobs_updated_at
    BEFORE UPDATE ON public.calculator_jobs
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — super-admin only, as the rest of the quoter
-- ---------------------------------------------------------------------------

ALTER TABLE public.calculator_price_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calculator_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can read calculator_price_books"
    ON public.calculator_price_books FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can add calculator_price_books"
    ON public.calculator_price_books FOR INSERT
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can manage calculator_jobs"
    ON public.calculator_jobs FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());
