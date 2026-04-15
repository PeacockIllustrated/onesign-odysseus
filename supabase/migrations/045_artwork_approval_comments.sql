-- Migration 045: client comments on artwork approvals
--
-- Adds an optional free-text comment field so the client can leave
-- feedback (changes they'd like, notes, sign-off caveats) alongside
-- the signature. Shown on the admin approval card.

BEGIN;

ALTER TABLE public.artwork_approvals
  ADD COLUMN IF NOT EXISTS client_comments TEXT;

COMMENT ON COLUMN public.artwork_approvals.client_comments IS
  'Optional free-text feedback submitted by the client on the approval page — e.g. "please tighten the kerning on option A".';

COMMIT;
