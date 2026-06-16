-- Migration 068: expiry for proof-of-delivery + production sign-off tokens
--
-- Artwork-approval tokens already expire after 7 days (lib/artwork/
-- approval-actions.ts), but `deliveries.pod_token` and
-- `artwork_production_approvals.token` were valid FOREVER — a forwarded or
-- bookmarked link stayed exploitable indefinitely (audit finding M2).
--
-- This adds a nullable `*_expires_at` to both. The server actions set it at
-- mint time (now + 30 days) and reject expired tokens on read. Nullable and
-- backward-compatible: existing rows (expires_at IS NULL) keep working until
-- the link is re-minted, so no live link is invalidated by this migration.
--
-- Purely additive (two nullable TIMESTAMPTZ columns) — no data change, safe to
-- apply on a live database.

BEGIN;

ALTER TABLE public.deliveries
    ADD COLUMN IF NOT EXISTS pod_token_expires_at TIMESTAMPTZ;

ALTER TABLE public.artwork_production_approvals
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

COMMIT;
