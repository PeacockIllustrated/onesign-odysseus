-- Migration 060: public "Design Your Sign" requests
--
-- The visualiser (058) is staff-only. This adds a PUBLIC, unauthenticated
-- front door: a customer builds a folded-aluminium sign at /design and clicks
-- "Send to Onesign". Their design + contact details land here as a lead for the
-- team to price and follow up.
--
-- Auth model (mirrors the tokenised sign-off / delivery pattern in CLAUDE.md
-- §3): the /design page has NO Supabase session. Submissions are written by a
-- server action through the SERVICE-ROLE admin client, which bypasses RLS — so
-- this table needs NO anon INSERT policy. Reads + triage are super-admin only,
-- exactly like visualiser_designs (058) and backshop_items (059).
--
-- The design is stored as the same PanelParams JSON the visualiser uses, plus
-- the flattened aperture SVG and a face-on PNG thumbnail (data URL, as on
-- backshop_items.thumbnail) so the inbox shows a preview without re-rendering.
-- A nullable design_id links a request to a visualiser_designs row once a staff
-- member promotes it into the internal tool ("Open in visualiser").
--
-- Pricing note (roadmap): packages will later be priced and Stripe-served. The
-- status enum carries a 'quoted' state and the table is the natural anchor for
-- a future checkout/session link, so that can drop in without a reshape.

BEGIN;

-- Auto-incrementing reference: DSR-YYYY-NNNNNN (Design Sign Request), matching
-- the OSD-/INV-/PO- convention (CLAUDE.md "Conventions").
CREATE SEQUENCE IF NOT EXISTS design_request_number_seq START 1;

CREATE TABLE IF NOT EXISTS public.design_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference TEXT NOT NULL UNIQUE DEFAULT '',

    -- Lead contact details (collected on submit; name + email required).
    customer_name TEXT NOT NULL CHECK (length(customer_name) BETWEEN 1 AND 200),
    customer_email TEXT NOT NULL CHECK (length(customer_email) BETWEEN 3 AND 200),
    customer_phone TEXT,
    company TEXT,
    postcode TEXT,
    project_notes TEXT,

    -- Human-readable summary of what they built (e.g. "Aperture panel +
    -- projecting sign"), derived from the design at submit time.
    sign_type TEXT,

    -- The design itself: PanelParams JSON (lib/visualiser/types.ts), the
    -- flattened aperture SVG, and a face-on PNG preview as a data URL.
    params_json JSONB NOT NULL,
    svg_source TEXT,
    thumbnail TEXT,

    -- Triage state. 'new' on arrival; staff move it through to a quote/close.
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'reviewing', 'quoted', 'won', 'closed')),

    -- Set once a staff member promotes the request into the internal
    -- visualiser ("Open in visualiser") — soft link, survives design deletion.
    design_id UUID REFERENCES public.visualiser_designs(id) ON DELETE SET NULL,

    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_requests_status
    ON public.design_requests(status);
CREATE INDEX IF NOT EXISTS idx_design_requests_created_at
    ON public.design_requests(created_at DESC);

-- Auto-generate the reference on insert (when left as the '' default), exactly
-- as generate_invoice_number() does for invoices (migration 033).
CREATE OR REPLACE FUNCTION generate_design_request_reference()
RETURNS TRIGGER AS $$
BEGIN
    NEW.reference := 'DSR-' || to_char(NOW(), 'YYYY') || '-' ||
        LPAD(nextval('design_request_number_seq')::TEXT, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_design_request_reference
    BEFORE INSERT ON public.design_requests
    FOR EACH ROW
    WHEN (NEW.reference = '')
    EXECUTE FUNCTION generate_design_request_reference();

CREATE OR REPLACE FUNCTION trg_design_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_design_requests_updated_at
    BEFORE UPDATE ON public.design_requests
    FOR EACH ROW EXECUTE FUNCTION trg_design_requests_updated_at();

ALTER TABLE public.design_requests ENABLE ROW LEVEL SECURITY;

-- Super-admin (Onesign staff) read + triage everything. There is deliberately
-- NO anon/authenticated INSERT policy: public submissions come in via the
-- service-role admin client server-side (see lib/design-requests/actions.ts),
-- which bypasses RLS — the same gate-by-server-action pattern as the tokenised
-- approval/delivery flows.
CREATE POLICY "Super admins manage design_requests"
    ON public.design_requests FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

COMMIT;

-- Realtime so the admin inbox can surface new submissions live. Outside the
-- txn and guarded so re-running won't error if already published.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.design_requests;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;
