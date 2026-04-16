-- Migration 046: allow 'changes_requested' status on artwork_approvals
--
-- Lets a client submit feedback without approving — "I don't like this,
-- try something different". The admin sees the comments, revises the
-- variants, and generates a new approval link.

BEGIN;

-- Widen the CHECK constraint to accept the new status value.
ALTER TABLE public.artwork_approvals
  DROP CONSTRAINT IF EXISTS artwork_approvals_status_check;

ALTER TABLE public.artwork_approvals
  ADD CONSTRAINT artwork_approvals_status_check
  CHECK (status IN ('pending', 'approved', 'expired', 'revoked', 'changes_requested'));

COMMIT;
