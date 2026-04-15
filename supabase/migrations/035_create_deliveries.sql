-- Migration 035: Deliveries + Proof of Delivery
-- Creates deliveries and delivery_items tables with DEL-YYYY-NNNNNN sequence

-- SEQUENCE
CREATE SEQUENCE IF NOT EXISTS delivery_number_seq START 1;

-- TABLE: deliveries
CREATE TABLE public.deliveries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_number     TEXT NOT NULL UNIQUE DEFAULT '',
    org_id              UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    production_job_id   UUID NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
    site_id             UUID REFERENCES public.org_sites(id) ON DELETE SET NULL,
    contact_id          UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
    status              TEXT NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'in_transit', 'delivered', 'failed')),
    driver_name         TEXT,
    driver_phone        TEXT,
    scheduled_date      DATE NOT NULL DEFAULT CURRENT_DATE,
    delivered_at        TIMESTAMPTZ,
    notes_internal      TEXT,
    notes_driver        TEXT,
    pod_token           TEXT UNIQUE,
    pod_status          TEXT DEFAULT 'pending'
        CHECK (pod_status IN ('pending', 'signed', 'refused')),
    pod_signed_by       TEXT,
    pod_signature_data  TEXT,
    pod_notes           TEXT,
    pod_signed_at       TIMESTAMPTZ,
    created_by          UUID REFERENCES auth.users(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate delivery number: DEL-YYYY-NNNNNN
CREATE OR REPLACE FUNCTION generate_delivery_number()
RETURNS TRIGGER AS $$
BEGIN
    NEW.delivery_number := 'DEL-' || to_char(NOW(), 'YYYY') || '-' || LPAD(nextval('delivery_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_delivery_number
    BEFORE INSERT ON public.deliveries
    FOR EACH ROW
    WHEN (NEW.delivery_number = '')
    EXECUTE FUNCTION generate_delivery_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION trg_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_deliveries_updated_at
    BEFORE UPDATE ON public.deliveries
    FOR EACH ROW EXECUTE FUNCTION trg_deliveries_updated_at();

-- TABLE: delivery_items
CREATE TABLE public.delivery_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    delivery_id     UUID NOT NULL REFERENCES public.deliveries(id) ON DELETE CASCADE,
    job_item_id     UUID REFERENCES public.job_items(id) ON DELETE SET NULL,
    description     TEXT NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One non-failed delivery per job
CREATE UNIQUE INDEX idx_one_delivery_per_job
    ON public.deliveries(production_job_id) WHERE status != 'failed';

-- Indexes
CREATE INDEX idx_deliveries_org ON public.deliveries(org_id);
CREATE INDEX idx_deliveries_status ON public.deliveries(status);
CREATE INDEX idx_deliveries_scheduled ON public.deliveries(scheduled_date);
CREATE INDEX idx_deliveries_created ON public.deliveries(created_at DESC);
CREATE INDEX idx_deliveries_pod_token ON public.deliveries(pod_token) WHERE pod_token IS NOT NULL;
CREATE INDEX idx_delivery_items_delivery ON public.delivery_items(delivery_id);

-- RLS
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admin full access on deliveries"
    ON public.deliveries FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles
            WHERE id = auth.uid() AND role = 'super_admin'
        )
    );

CREATE POLICY "Super admin full access on delivery_items"
    ON public.delivery_items FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.deliveries d
            JOIN public.profiles p ON p.id = auth.uid()
            WHERE d.id = delivery_items.delivery_id AND p.role = 'super_admin'
        )
    );

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.deliveries;
