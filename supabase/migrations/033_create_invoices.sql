-- Migration 033: Invoices
-- Creates invoices and invoice_items tables with INV-YYYY-NNNNNN sequence

-- SEQUENCE
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START 1;

-- TABLE: invoices
CREATE TABLE public.invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_number      TEXT NOT NULL UNIQUE DEFAULT '',
    org_id              UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    quote_id            UUID NOT NULL REFERENCES public.quotes(id) ON DELETE RESTRICT,
    production_job_id   UUID REFERENCES public.production_jobs(id) ON DELETE SET NULL,
    customer_name       TEXT NOT NULL,
    customer_email      TEXT,
    customer_phone      TEXT,
    customer_reference  TEXT,
    project_name        TEXT,
    status              TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')),
    invoice_date        DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date            DATE,
    payment_terms_days  INTEGER NOT NULL DEFAULT 30,
    notes_internal      TEXT,
    notes_customer      TEXT,
    subtotal_pence      INTEGER NOT NULL DEFAULT 0,
    vat_rate            NUMERIC(5,2) NOT NULL DEFAULT 20.00,
    vat_pence           INTEGER NOT NULL DEFAULT 0,
    total_pence         INTEGER NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate invoice number: INV-YYYY-NNNNNN
CREATE OR REPLACE FUNCTION generate_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.invoice_number := 'INV-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('invoice_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_invoice_number
    BEFORE INSERT ON public.invoices
    FOR EACH ROW
    WHEN (NEW.invoice_number = '')
    EXECUTE FUNCTION generate_invoice_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_invoices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION trg_invoices_updated_at();

-- TABLE: invoice_items
CREATE TABLE public.invoice_items (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    invoice_id        UUID NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
    quote_item_id     UUID REFERENCES public.quote_items(id) ON DELETE SET NULL,
    description       TEXT NOT NULL,
    quantity          INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_price_pence  INTEGER NOT NULL DEFAULT 0 CHECK (unit_price_pence >= 0),
    line_total_pence  INTEGER NOT NULL DEFAULT 0,
    sort_order        INTEGER NOT NULL DEFAULT 0,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One non-cancelled invoice per quote
CREATE UNIQUE INDEX idx_one_invoice_per_quote
    ON public.invoices(quote_id) WHERE status != 'cancelled';

-- Indexes
CREATE INDEX idx_invoices_org ON public.invoices(org_id);
CREATE INDEX idx_invoices_status ON public.invoices(status);
CREATE INDEX idx_invoices_created ON public.invoices(created_at DESC);
CREATE INDEX idx_invoice_items_invoice ON public.invoice_items(invoice_id);

-- RLS (mirrors PO pattern exactly)
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access on invoices"
    ON public.invoices FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Super admin full access on invoice_items"
    ON public.invoice_items FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.invoices inv
            JOIN public.profiles p ON p.id = auth.uid()
            WHERE inv.id = invoice_items.invoice_id AND p.role = 'super_admin'
        )
    );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.invoices;
