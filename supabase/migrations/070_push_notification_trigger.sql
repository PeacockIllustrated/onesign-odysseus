-- Migration 070: push-dispatch trigger on notifications.
--
-- The SQL equivalent of a Supabase Database Webhook: on every INSERT into
-- public.notifications, POST the row to the app's /api/push/dispatch endpoint
-- (which fans it out as Web Push to every subscribed device). Uses pg_net
-- (async, fire-and-forget) + Supabase Vault.
--
-- SECRET HANDLING: the Bearer token is NOT in this file. It lives in Vault
-- under the name 'push_dispatch_secret' (set out-of-band via vault.create_secret)
-- and must equal PUSH_DISPATCH_SECRET in the app env. The dispatch URL is not
-- sensitive, so it's inlined.
--
-- SAFETY: public.notifications is written by several other triggers (artwork
-- approvals, shop-floor flags, external/Persimmon orders). This AFTER INSERT
-- trigger is fully exception-guarded so a pg_net/Vault hiccup can NEVER roll
-- back the originating insert.

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_push_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_secret text;
BEGIN
    BEGIN
        SELECT decrypted_secret INTO v_secret
          FROM vault.decrypted_secrets
          WHERE name = 'push_dispatch_secret';

        IF v_secret IS NOT NULL THEN
            PERFORM net.http_post(
                url := 'https://onesign-odysseus.vercel.app/api/push/dispatch',
                headers := jsonb_build_object(
                    'Content-Type', 'application/json',
                    'Authorization', 'Bearer ' || v_secret
                ),
                body := jsonb_build_object(
                    'type', 'INSERT',
                    'table', 'notifications',
                    'record', to_jsonb(NEW)
                )
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        -- Never let push dispatch break the notification insert.
        NULL;
    END;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notifications_push_dispatch ON public.notifications;
CREATE TRIGGER trg_notifications_push_dispatch
    AFTER INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION public.notify_push_dispatch();

COMMIT;
