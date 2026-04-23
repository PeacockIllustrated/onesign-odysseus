-- Migration 054: "approved with feedback" is NOT a clean approval
--
-- When a client ticks approve on every sub-item but leaves an overall
-- comment — or when they approve a visual but still type "btw can we
-- nudge the kerning" — that's feedback, not a clean sign-off. The
-- notifications trigger from 052 used to classify any status='approved'
-- transition as `artwork_approved` with severity='action'. This version
-- looks at client_comments too and upgrades to severity='urgent' with
-- a title that tells staff to read the feedback.

BEGIN;

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
    has_comments BOOLEAN;
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    IF NEW.status NOT IN ('approved', 'changes_requested') THEN
        RETURN NEW;
    END IF;

    SELECT job_name, status INTO job_title, job_status
      FROM public.artwork_jobs
     WHERE id = NEW.job_id;

    IF job_status IN ('in_production', 'completed') THEN
        RETURN NEW;
    END IF;

    has_comments := NEW.client_comments IS NOT NULL
                    AND length(trim(NEW.client_comments)) > 0;

    IF NEW.status = 'changes_requested' THEN
        v_kind := 'artwork_changes_requested';
        v_severity := 'urgent';
        v_title := 'Changes requested: ' || COALESCE(job_title, 'job');
    ELSIF has_comments THEN
        -- Approved, but the client left feedback — do not let this look
        -- like a clean sign-off on the dashboard. Flag it as urgent.
        v_kind := 'artwork_approved';
        v_severity := 'urgent';
        v_title := 'Approved with feedback: ' || COALESCE(job_title, 'job');
    ELSE
        v_kind := 'artwork_approved';
        v_severity := 'action';
        v_title := 'Artwork approved: ' || COALESCE(job_title, 'job');
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
            dismissed_at = NULL,
            dismissed_by = NULL;

    RETURN NEW;
END;
$$;

COMMIT;
