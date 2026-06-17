-- Migration 068: panel-visualiser "extra face" nest linkage
--
-- The panel visualiser can now add an EXTRA FACE (brass / stainless / aluminium
-- / copper / mirror) over push-through, aperture-cut or backlit letters — a
-- second set of cut pieces in a metal finish, laminated on the letter faces.
-- "Send metal faces to nester" hands those cut pieces to the acrylic nester as
-- ONE linked nest, exactly like the built-up returns tool does (migration 065).
--
-- 065 linked a nest back to a letter_return_jobs row via source_job_id. A nest
-- from the visualiser instead links to its visualiser_designs row (058). We add
-- a parallel nullable back-reference rather than overloading source_job_id, so
-- each FK keeps its own referential integrity. source_kind disambiguates the
-- origin ('letter_returns' vs 'panel_extra_face'); it's free TEXT (065), so no
-- change is needed there. ON DELETE SET NULL: deleting the design orphans the
-- nest, it never cascades cut data away.

BEGIN;

ALTER TABLE public.nesting_designs
    ADD COLUMN IF NOT EXISTS source_design_id UUID
        REFERENCES public.visualiser_designs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nesting_designs_source_design
    ON public.nesting_designs(source_design_id);

COMMIT;
