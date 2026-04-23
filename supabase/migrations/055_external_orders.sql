-- Migration 055: external_orders — unified inbox for orders placed via
-- external Onesign apps (Persimmon, Mapleleaf, onesign-lynx shop, etc).
--
-- Most of these land in Supabase directly. A couple (e.g. Mapleleaf) are
-- entered manually by staff from an email. This table gives a single
-- "new orders" view regardless of origin and keeps the raw payload
-- preserved in case the normalised fields miss something.
--
-- Orders are NOT automatically converted to quotes/production jobs —
-- staff have to acknowledge first, then choose to convert, complete,
-- or cancel. Auto-create of clients is deferred; unknown clients stay
-- on the card until someone links them manually.

BEGIN;

CREATE TABLE IF NOT EXISTS public.external_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_app TEXT NOT NULL
        CHECK (source_app IN ('persimmon', 'mapleleaf', 'lynx', 'other')),
    external_ref TEXT,                      -- the source's own order number
    status TEXT NOT NULL DEFAULT 'new'
        CHECK (status IN ('new', 'acknowledged', 'in_progress', 'converted', 'completed', 'cancelled')),

    -- Snapshot of who placed the order. These may or may not map to a
    -- row in public.orgs — we don't auto-create. The linked_org_id FK
    -- below is populated manually when staff match them up.
    client_name TEXT,
    client_email TEXT,
    client_phone TEXT,
    site_name TEXT,
    site_address TEXT,
    site_postcode TEXT,

    -- Order content, normalised + raw.
    placed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    item_count INTEGER,
    item_summary TEXT,                      -- human-readable description
    total_pence INTEGER,
    raw_payload JSONB,                      -- whatever the source sent

    -- Linkage after conversion / match.
    linked_org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
    linked_quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
    linked_production_job_id UUID REFERENCES public.production_jobs(id) ON DELETE SET NULL,

    notes TEXT,

    acknowledged_at TIMESTAMPTZ,
    acknowledged_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    cancelled_at TIMESTAMPTZ,
    cancelled_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Prevent double-inserting the same source-level order (e.g. if Persimmon
-- retries a webhook). external_ref uniqueness is scoped by source_app so
-- two different apps can legitimately share an order number.
CREATE UNIQUE INDEX IF NOT EXISTS uq_external_orders_source_ref
    ON public.external_orders(source_app, external_ref)
    WHERE external_ref IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_external_orders_status
    ON public.external_orders(status);
CREATE INDEX IF NOT EXISTS idx_external_orders_placed_at
    ON public.external_orders(placed_at DESC);
CREATE INDEX IF NOT EXISTS idx_external_orders_source
    ON public.external_orders(source_app);
CREATE INDEX IF NOT EXISTS idx_external_orders_linked_org
    ON public.external_orders(linked_org_id) WHERE linked_org_id IS NOT NULL;

-- Auto-update updated_at
CREATE TRIGGER trg_external_orders_updated_at
    BEFORE UPDATE ON public.external_orders
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.external_orders ENABLE ROW LEVEL SECURITY;

-- Staff can read + update; service-role key handles inbound webhook
-- inserts without needing a public INSERT policy. Deletes require
-- super-admin.
CREATE POLICY "Authed users read external_orders"
    ON public.external_orders FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users update external_orders"
    ON public.external_orders FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users insert external_orders (manual entry)"
    ON public.external_orders FOR INSERT TO authenticated
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins delete external_orders"
    ON public.external_orders FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- Register with Supabase Realtime so the dashboard + orders page can
-- react to new orders the moment they land.
ALTER PUBLICATION supabase_realtime ADD TABLE public.external_orders;

-- =============================================================================
-- Trigger: notify on new external order
-- Mirrors the pattern used for artwork approvals / shop-floor flags —
-- inserts into public.notifications so the dashboard Needs Attention
-- panel surfaces new orders in real time.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_external_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_title TEXT;
    v_detail TEXT;
    v_source_label TEXT;
BEGIN
    v_source_label := CASE NEW.source_app
        WHEN 'persimmon' THEN 'Persimmon'
        WHEN 'mapleleaf' THEN 'Mapleleaf'
        WHEN 'lynx' THEN 'Lynx shop'
        ELSE 'external order'
    END;

    v_title := 'New order from ' || v_source_label
        || COALESCE(' — ' || NEW.client_name, '');
    v_detail := COALESCE(NEW.item_summary, NEW.external_ref);

    INSERT INTO public.notifications
        (kind, severity, title, detail, href, source_table, source_id)
    VALUES
        ('external_order', 'action', v_title, v_detail,
         '/admin/external-orders',
         'external_orders', NEW.id)
    ON CONFLICT (source_table, source_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_external_order_notification ON public.external_orders;
CREATE TRIGGER trg_external_order_notification
    AFTER INSERT ON public.external_orders
    FOR EACH ROW EXECUTE FUNCTION public.notify_external_order();

-- Expand the notifications.kind CHECK constraint to include this new kind.
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN (
        'artwork_approved',
        'artwork_changes_requested',
        'shop_floor_flag',
        'external_order'
    ));

COMMIT;
