-- Migration: close the open door on psp_purchasers.
--
-- `psp_purchasers` (id, name, email) belongs to the Persimmon ordering app and
-- holds personal data: a purchaser's name and email address. It shipped with
-- ROW LEVEL SECURITY DISABLED, which means every row was readable AND writable
-- by anyone holding the anon key — and the anon key is public by design; it
-- ships in the browser bundle of every app pointed at this project.
--
-- WHY THIS DOES NOT COPY ITS SIBLINGS
--
-- The obvious fix was to mirror psp_orders / psp_contacts / psp_sites /
-- bal_purchasers, which all have RLS *enabled*. But their single policy is:
--
--     FOR ALL TO public USING (true) WITH CHECK (true)
--
-- which grants anon full read and write. That satisfies the linter and secures
-- nothing. Copying it here would have turned a visible warning into an
-- invisible hole, which is the worse of the two — a table nobody is worried
-- about any more, still wide open.
--
-- THE MODEL INSTEAD
--
-- Rows arrive through the service role (Persimmon's own server actions, and
-- Odysseus's `lib/external-orders/adapters/persimmon.ts`, which uses
-- `createAdminClient()`). The service role BYPASSES RLS, so no policy is
-- needed for anything that writes today, and none is granted: there is no
-- INSERT, UPDATE or DELETE policy at all.
--
-- The one policy below lets Onesign super-admins READ the table through the
-- ordinary authenticated client, so a staff page can list purchasers without
-- reaching for the service role. That is the same shape as `design_requests`
-- (060): super-admin RLS, service-role writes, no anon policy anywhere.
--
-- The table is empty today, so nothing breaks on the way in. If the Persimmon
-- app turns out to read this table with the ANON key client-side, that read
-- will now return zero rows — the fix then is a scoped policy for the case it
-- actually needs, not a return to `USING (true)`.

ALTER TABLE public.psp_purchasers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins read psp_purchasers" ON public.psp_purchasers;
CREATE POLICY "Super admins read psp_purchasers"
    ON public.psp_purchasers
    FOR SELECT
    TO authenticated
    USING (public.is_super_admin());

COMMENT ON TABLE public.psp_purchasers IS
    'Persimmon purchaser contact details (name, email). Personal data: RLS on, super-admin read only, and every write goes through the service role. Do NOT add a USING (true) policy.';
