-- Migration 027: Purchase Orders
-- Creates purchase_orders and po_items tables with PO-YYYY-NNNNNN sequence

-- =============================================================================
-- SEQUENCE
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS po_number_seq START 1;

-- =============================================================================
-- TABLE: purchase_orders
-- =============================================================================

CREATE TABLE public.purchase_orders (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_number           TEXT NOT NULL UNIQUE DEFAULT '',
    org_id              UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    quote_id            UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    production_job_id   UUID REFERENCES public.production_jobs(id) ON DELETE SET NULL,
    supplier_name       TEXT NOT NULL,
    supplier_email      TEXT,
    supplier_reference  TEXT,
    description         TEXT NOT NULL,
    status              TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'sent', 'acknowledged', 'completed', 'cancelled')),
    issue_date          DATE NOT NULL DEFAULT CURRENT_DATE,
    required_by_date    DATE,
    notes_internal      TEXT,
    notes_supplier      TEXT,
    total_pence         INTEGER NOT NULL DEFAULT 0,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate PO number on insert
CREATE OR REPLACE FUNCTION generate_po_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.po_number := 'PO-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('po_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_po_number
    BEFORE INSERT ON public.purchase_orders
    FOR EACH ROW
    WHEN (NEW.po_number = '')
    EXECUTE FUNCTION generate_po_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_purchase_orders_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_purchase_orders_updated_at
    BEFORE UPDATE ON public.purchase_orders
    FOR EACH ROW EXECUTE FUNCTION trg_purchase_orders_updated_at();

-- =============================================================================
-- TABLE: po_items
-- =============================================================================

CREATE TABLE public.po_items (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id            UUID NOT NULL REFERENCES public.purchase_orders(id) ON DELETE CASCADE,
    description      TEXT NOT NULL,
    quantity         INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    unit_cost_pence  INTEGER NOT NULL DEFAULT 0 CHECK (unit_cost_pence >= 0),
    line_total_pence INTEGER NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.po_items ENABLE ROW LEVEL SECURITY;

-- Super admin: full access on purchase_orders
CREATE POLICY "Super admin full access on purchase_orders"
    ON public.purchase_orders FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

-- Super admin: full access on po_items (via purchase_orders)
CREATE POLICY "Super admin full access on po_items"
    ON public.po_items FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.purchase_orders po
            JOIN public.profiles p ON p.id = auth.uid()
            WHERE po.id = po_items.po_id AND p.role = 'super_admin'
        )
    );
