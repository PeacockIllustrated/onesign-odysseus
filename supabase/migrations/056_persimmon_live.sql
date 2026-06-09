-- Migration 056: make Persimmon orders live in the External Orders inbox
--
-- We don't own psp_orders but we can still:
--   * Add it to the supabase_realtime publication so the admin inbox
--     subscribes to INSERT events and refreshes in real time.
--   * Install a SECURITY DEFINER trigger that inserts a row into our
--     public.notifications table whenever a new Persimmon order lands,
--     so the dashboard Needs Attention panel surfaces it alongside
--     artwork approvals, shop-floor flags, and manual external orders.
--
-- The notifications row points at /admin/external-orders; staff see a
-- synthetic "psp:<uuid>" card until they acknowledge it, at which point
-- listExternalOrders() upserts a real tracking row in external_orders.

BEGIN;

-- Best-effort: add psp_orders to the Realtime publication. Fails silently
-- if already registered (idempotent across re-runs).
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.psp_orders;
EXCEPTION WHEN duplicate_object THEN
    -- already in the publication
    NULL;
END $$;

CREATE OR REPLACE FUNCTION public.notify_persimmon_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_title TEXT;
    v_detail TEXT;
BEGIN
    v_title := 'New Persimmon order'
        || COALESCE(' — ' || NEW.contact_name, '')
        || COALESCE(' (' || NEW.order_number || ')', '');
    v_detail := COALESCE(
        NEW.site_name,
        NEW.po_number,
        NULL
    );

    -- Key the notification by the psp_orders.id so re-inserts or retries
    -- don't double-fire. source_table lines up with the same dedup scheme
    -- we use for artwork / shop-floor triggers.
    INSERT INTO public.notifications
        (kind, severity, title, detail, href, source_table, source_id)
    VALUES
        ('external_order', 'action', v_title, v_detail,
         '/admin/external-orders',
         'psp_orders', NEW.id)
    ON CONFLICT (source_table, source_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_persimmon_order_notification ON public.psp_orders;
CREATE TRIGGER trg_persimmon_order_notification
    AFTER INSERT ON public.psp_orders
    FOR EACH ROW EXECUTE FUNCTION public.notify_persimmon_order();

COMMIT;
