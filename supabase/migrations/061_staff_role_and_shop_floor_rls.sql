-- Migration 061: per-worker `staff` role + scoped RLS for the shop floor.
--
-- Until now the only privileged role was `super_admin`. Production tables
-- (job_items, production_jobs, …) granted writes to super-admins only and
-- reads to org members. Shop-floor workers are neither — they are Onesign
-- staff who are not members of the *client* org and should not be full
-- super-admins. The result (audit B1): a non-admin worker's start/pause/
-- advance silently updated 0 rows under RLS, and their queue read returned
-- nothing.
--
-- This migration introduces a third role, `staff`, sitting between an
-- ordinary authed user and a super_admin: it can read and progress
-- production work across every client (single-tenant — staff legitimately
-- work on all jobs) but cannot manage stages, pricing, orgs, etc.
--
-- `is_staff()` is true for BOTH `staff` and `super_admin`, so every staff
-- policy below also covers super-admins (who already had access via their
-- own FOR ALL policies — these are additive, never restrictive).

-- ---------------------------------------------------------------------------
-- 1. Add `staff` to the user_role enum (mirrors migration 005).
--    Must be committed before any query *uses* the value; nothing here does.
-- ---------------------------------------------------------------------------
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'staff';

-- ---------------------------------------------------------------------------
-- 2. is_staff() helper — staff OR super_admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role IN ('staff', 'super_admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ---------------------------------------------------------------------------
-- 3. Scoped RLS for staff on the production + artwork-spec tables the shop
--    floor touches. All additive; DROP-then-CREATE for idempotent re-runs.
-- ---------------------------------------------------------------------------

-- production_jobs: staff read all jobs and may flip status to completed
-- (advanceItemToNextRoutedStage marks the parent job complete).
DROP POLICY IF EXISTS "Staff can view production jobs" ON public.production_jobs;
CREATE POLICY "Staff can view production jobs"
    ON public.production_jobs FOR SELECT
    USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can update production jobs" ON public.production_jobs;
CREATE POLICY "Staff can update production jobs"
    ON public.production_jobs FOR UPDATE
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

-- job_items: the heart of the shop floor — read the queue, update status +
-- current_stage_id as work progresses.
DROP POLICY IF EXISTS "Staff can view job items" ON public.job_items;
CREATE POLICY "Staff can view job items"
    ON public.job_items FOR SELECT
    USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can update job items" ON public.job_items;
CREATE POLICY "Staff can update job items"
    ON public.job_items FOR UPDATE
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

-- job_stage_log: staff append move/completion entries. (SELECT is already
-- open to all authenticated users via migration 025.)
DROP POLICY IF EXISTS "Staff can insert stage log" ON public.job_stage_log;
CREATE POLICY "Staff can insert stage log"
    ON public.job_stage_log FOR INSERT
    WITH CHECK (public.is_staff());

-- artwork_jobs / artwork_components: read-only context for the guided check
-- (the spec the worker is building to, and the artwork-approval gate lookup).
DROP POLICY IF EXISTS "Staff can view artwork jobs" ON public.artwork_jobs;
CREATE POLICY "Staff can view artwork jobs"
    ON public.artwork_jobs FOR SELECT
    USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can view artwork components" ON public.artwork_components;
CREATE POLICY "Staff can view artwork components"
    ON public.artwork_components FOR SELECT
    USING (public.is_staff());

-- artwork_component_items: staff read the sub-item spec and write the
-- as-built QC fields (measured dims + as_built_signed_off_at — migration 062).
DROP POLICY IF EXISTS "Staff can view artwork sub-items" ON public.artwork_component_items;
CREATE POLICY "Staff can view artwork sub-items"
    ON public.artwork_component_items FOR SELECT
    USING (public.is_staff());

DROP POLICY IF EXISTS "Staff can update artwork sub-items" ON public.artwork_component_items;
CREATE POLICY "Staff can update artwork sub-items"
    ON public.artwork_component_items FOR UPDATE
    USING (public.is_staff())
    WITH CHECK (public.is_staff());

-- ---------------------------------------------------------------------------
-- To make a user shop-floor staff, run in the Supabase SQL editor:
--   UPDATE public.profiles SET role = 'staff' WHERE id = 'USER_UUID';
-- ---------------------------------------------------------------------------
