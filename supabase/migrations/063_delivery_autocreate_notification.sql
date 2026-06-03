-- Migration 063: surface auto-delivery failures (audit G3).
--
-- When a production job reaches goods-out, advanceItemToNextRoutedStage calls
-- autoCreateDeliveryForCompletedJob. If that insert failed (e.g. a null org_id
-- hitting deliveries.org_id NOT NULL) the error was only console.error'd — the
-- job sat "completed" with no delivery and nobody knew. We now raise a
-- persisted notification so it shows in the dashboard "Needs Attention" panel.
--
-- This just widens the notifications.kind CHECK to allow the new kind; the
-- row is inserted by the (service-role) server action, not a trigger.

BEGIN;

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_kind_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_kind_check
    CHECK (kind IN (
        'artwork_approved',
        'artwork_changes_requested',
        'shop_floor_flag',
        'delivery_autocreate_failed'
    ));

COMMIT;
