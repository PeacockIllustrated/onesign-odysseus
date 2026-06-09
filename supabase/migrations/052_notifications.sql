-- Migration 052: persisted notifications + Realtime triggers
--
-- The admin dashboard "Needs Attention" panel reads derived counts from
-- several tables (quotes, invoices, deliveries, maintenance). That's
-- cheap-enough to recompute on every page load.
--
-- For two event-driven sources we want *live* updates while the dashboard
-- is open, and we want "dismiss and stay dismissed" state across sessions:
--   * artwork_approvals transitioning to approved / changes_requested
--   * shop_floor_flags raised with status = 'open'
--
-- Triggers on those source tables insert one row into public.notifications
-- when the relevant event happens. The dashboard subscribes via Supabase
-- Realtime and refreshes when a new row appears or is dismissed.

BEGIN;

CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind TEXT NOT NULL
        CHECK (kind IN (
            'artwork_approved',
            'artwork_changes_requested',
            'shop_floor_flag'
        )),
    severity TEXT NOT NULL DEFAULT 'action'
        CHECK (severity IN ('urgent', 'action', 'info')),
    title TEXT NOT NULL,
    detail TEXT,
    href TEXT NOT NULL,
    -- Dedup anchor: if a trigger fires twice for the same source row, the
    -- unique index rejects the second insert. (source_table, source_id)
    -- identifies exactly one row in exactly one upstream table.
    source_table TEXT NOT NULL,
    source_id UUID NOT NULL,
    dismissed_at TIMESTAMPTZ,
    dismissed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_notifications_source
    ON public.notifications(source_table, source_id);
CREATE INDEX IF NOT EXISTS idx_notifications_active
    ON public.notifications(created_at DESC) WHERE dismissed_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Any authenticated staff member can read and dismiss notifications.
-- Inserts only happen via triggers (running as table owner) or the
-- service-role key; no public INSERT policy is required.
CREATE POLICY "Authed users can read notifications"
    ON public.notifications FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authed users can dismiss notifications"
    ON public.notifications FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- Register the table with Supabase Realtime so INSERT/UPDATE events
-- propagate to subscribed clients.
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- =============================================================================
-- Trigger: artwork_approvals → notifications
-- Fires when an approval row transitions to approved or changes_requested.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_artwork_approval_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    job_title TEXT;
    job_status TEXT;
    v_kind TEXT;
    v_severity TEXT;
    v_title TEXT;
    v_detail TEXT;
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('approved', 'changes_requested') THEN
        RETURN NEW;
    END IF;

    -- Skip noise once the job has already been released or completed.
    SELECT job_name, status INTO job_title, job_status
      FROM public.artwork_jobs
     WHERE id = NEW.job_id;

    IF job_status IN ('in_production', 'completed') THEN
        RETURN NEW;
    END IF;

    IF NEW.status = 'approved' THEN
        v_kind := 'artwork_approved';
        v_severity := 'action';
        v_title := 'Artwork approved: ' || COALESCE(job_title, 'job');
    ELSE
        v_kind := 'artwork_changes_requested';
        v_severity := 'urgent';
        v_title := 'Changes requested: ' || COALESCE(job_title, 'job');
    END IF;

    v_detail := CASE WHEN NEW.client_name IS NOT NULL
                     THEN 'by ' || NEW.client_name
                     ELSE NULL END;

    INSERT INTO public.notifications
        (kind, severity, title, detail, href, source_table, source_id)
    VALUES
        (v_kind, v_severity, v_title, v_detail,
         '/admin/artwork/' || NEW.job_id,
         'artwork_approvals', NEW.id)
    ON CONFLICT (source_table, source_id) DO UPDATE
        SET kind = EXCLUDED.kind,
            severity = EXCLUDED.severity,
            title = EXCLUDED.title,
            detail = EXCLUDED.detail,
            -- Reopen if a previously-dismissed approval flips state again
            -- (e.g. client came back and changed their mind).
            dismissed_at = NULL,
            dismissed_by = NULL;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_artwork_approval_notification ON public.artwork_approvals;
CREATE TRIGGER trg_artwork_approval_notification
    AFTER UPDATE ON public.artwork_approvals
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_artwork_approval_decision();

-- =============================================================================
-- Trigger: shop_floor_flags → notifications
-- Fires when a flag is raised; auto-dismisses when it's resolved.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.notify_shop_floor_flag()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_detail TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_detail := CASE WHEN NEW.reported_by_name IS NOT NULL
                         THEN 'from ' || NEW.reported_by_name
                         ELSE NULL END;

        INSERT INTO public.notifications
            (kind, severity, title, detail, href, source_table, source_id)
        VALUES
            ('shop_floor_flag', 'urgent',
             'Shop-floor problem: ' || LEFT(NEW.notes, 60)
                || CASE WHEN length(NEW.notes) > 60 THEN '…' ELSE '' END,
             v_detail,
             '/admin/jobs',
             'shop_floor_flags', NEW.id)
        ON CONFLICT (source_table, source_id) DO NOTHING;

        RETURN NEW;
    END IF;

    -- When a flag is resolved upstream, auto-dismiss its notification so
    -- staff don't have to click twice.
    IF TG_OP = 'UPDATE' AND NEW.status = 'resolved' AND OLD.status <> 'resolved' THEN
        UPDATE public.notifications
           SET dismissed_at = now(),
               dismissed_by = NEW.resolved_by
         WHERE source_table = 'shop_floor_flags'
           AND source_id = NEW.id
           AND dismissed_at IS NULL;
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_shop_floor_flag_notification ON public.shop_floor_flags;
CREATE TRIGGER trg_shop_floor_flag_notification
    AFTER INSERT OR UPDATE ON public.shop_floor_flags
    FOR EACH ROW
    EXECUTE FUNCTION public.notify_shop_floor_flag();

COMMIT;
