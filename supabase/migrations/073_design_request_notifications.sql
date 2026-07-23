-- Migration 073: surface new public design requests in Needs Attention
--
-- The /design studio promises customers a reply "usually within 1 working
-- day", but nothing told staff a request had landed — no notifications row,
-- no badge, no email. Leads sat unseen until someone happened to open
-- /admin/design-requests. This installs the same SECURITY DEFINER trigger
-- pattern as the Persimmon inbox (migration 056): every INSERT into
-- design_requests drops a row into public.notifications, which the dashboard
-- Needs Attention panel already renders live via Supabase Realtime.
--
-- Dedup follows the house scheme: (source_table, source_id) unique index on
-- notifications makes retries a no-op.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_design_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_title TEXT;
    v_detail TEXT;
BEGIN
    -- The DSR reference is stamped by the BEFORE trigger (migration 060), so
    -- it is populated by the time this AFTER trigger fires.
    v_title := 'New design request'
        || COALESCE(' — ' || NULLIF(NEW.customer_name, ''), '')
        || COALESCE(' (' || NULLIF(NEW.reference, '') || ')', '');
    v_detail := COALESCE(
        NULLIF(NEW.sign_type, ''),
        NULLIF(NEW.company, ''),
        NEW.customer_email
    );

    INSERT INTO public.notifications
        (kind, severity, title, detail, href, source_table, source_id)
    VALUES
        ('design_request', 'action', v_title, v_detail,
         '/admin/design-requests',
         'design_requests', NEW.id)
    ON CONFLICT (source_table, source_id) DO NOTHING;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_design_request_notification ON public.design_requests;
CREATE TRIGGER trg_design_request_notification
    AFTER INSERT ON public.design_requests
    FOR EACH ROW EXECUTE FUNCTION public.notify_design_request();

-- Expand the notifications.kind CHECK constraint to include the new kind
-- (same expand-in-place approach as migrations 055/056).
ALTER TABLE public.notifications
    DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications
    ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN (
        'artwork_approved',
        'artwork_changes_requested',
        'shop_floor_flag',
        'external_order',
        'design_request'
    ));

COMMIT;
