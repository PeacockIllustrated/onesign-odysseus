-- Migration 077: take Davey and John off the project-manager list.
--
-- 076 seeded five PMs from a first pass at how the office runs; two of them
-- don't run fitting work, and every name on the list costs something real —
-- card colour IS whose job it is (CLAUDE.md §2d), so the board's key has to be
-- read from across a workshop and a name nobody is running is one more colour
-- to decode for nothing.
--
-- Two paths, because `fitting_jobs.pm_id` is ON DELETE SET NULL:
--
--   * no jobs ever assigned -> delete the row outright. Nothing references it,
--     and a deactivated row that never carried work is just clutter.
--   * jobs assigned -> deactivate. Deleting would null their pm_id and strip
--     the colour off work they actually ran, and completed jobs keeping their
--     PM identity is the reason colour means ownership rather than status.
--     The board resolves colour from every PM and only filters the places that
--     ask you to *choose* one (`activePms` in lib/schedule/utils.ts), so a
--     deactivated PM's historic cards look exactly as they always did.
--
-- Matched case-insensitively on name, the same way 076 guarded its inserts.
-- Re-runnable: a second pass finds nothing to do.

BEGIN;

UPDATE public.project_managers
SET is_active = FALSE,
    updated_at = now()
WHERE lower(name) IN ('davey', 'john')
  AND is_active
  AND EXISTS (
      SELECT 1 FROM public.fitting_jobs j WHERE j.pm_id = project_managers.id
  );

DELETE FROM public.project_managers
WHERE lower(name) IN ('davey', 'john')
  AND NOT EXISTS (
      SELECT 1 FROM public.fitting_jobs j WHERE j.pm_id = project_managers.id
  );

COMMIT;
