-- Migration 069: push_subscriptions — Web Push (PWA) device subscriptions.
--
-- One row per browser/device that has opted in to notifications. Written by
-- the authenticated user via savePushSubscription (lib/push/actions.ts); read
-- by the service-role dispatcher (lib/push/send.ts) to fan a notification out
-- to every device. endpoint is globally unique (the push service URL).
--
-- Purely additive new table. RLS: a user manages only their own rows; the
-- service-role dispatcher bypasses RLS to read all + prune dead endpoints.

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    endpoint TEXT NOT NULL UNIQUE,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user
    ON public.push_subscriptions(user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own push subscriptions"
    ON public.push_subscriptions FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

COMMIT;
