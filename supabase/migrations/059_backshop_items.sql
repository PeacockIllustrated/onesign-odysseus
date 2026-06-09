-- Migration 059: backshop screen items (workshop TV production board)
--
-- A designer pushes a finished visualiser design to the workshop TV with one
-- button ("Add to backshop screen"). Each board item is a SNAPSHOT of the
-- design at push time (name, spec, 3D thumbnail, reference PDF) plus the four
-- production check gates the floor ticks off (Designed / Cut / Painted /
-- Assembled). Snapshotting keeps the board stable even if the underlying design
-- is later edited; design_id is kept only as a soft link.
--
-- Single-tenant internal tool — mirrors the visualiser_designs (058) RLS:
-- super-admin manages everything; any authed Onesign user can read and tick the
-- checks (the floor staff on the TV). The reference PDF + thumbnail live in a
-- private 'backshop' storage bucket; uploads + signed-URL reads go through the
-- service-role admin client server-side, so the bucket needs no object RLS.

BEGIN;

CREATE TABLE IF NOT EXISTS public.backshop_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Soft link back to the source design (open in visualiser / re-push).
    design_id UUID REFERENCES public.visualiser_designs(id) ON DELETE SET NULL,
    -- Snapshot of the display fields at push time.
    name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 200),
    description TEXT,
    width_mm NUMERIC,
    height_mm NUMERIC,
    returns_mm NUMERIC,
    shadow_gap_mm NUMERIC,
    -- 3D preview PNG as a data URL — drives the board's list visual.
    thumbnail TEXT,
    -- Path inside the private 'backshop' storage bucket for the reference PDF.
    pdf_path TEXT,
    -- Production check gates. Keys match BACKSHOP_STAGES in
    -- lib/backshop/types.ts; status is derived (none / some / all ticked).
    checks JSONB NOT NULL DEFAULT
        '{"designed":false,"cut":false,"painted":false,"assembled":false}'::jsonb,
    -- Cleared off the active board when the job is done / shipped.
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One active board card per design (re-pushing updates the snapshot in place).
CREATE UNIQUE INDEX IF NOT EXISTS idx_backshop_items_design
    ON public.backshop_items(design_id) WHERE design_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_backshop_items_active
    ON public.backshop_items(created_at DESC) WHERE archived = FALSE;

ALTER TABLE public.backshop_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage backshop_items"
    ON public.backshop_items FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Authed users can read backshop_items"
    ON public.backshop_items FOR SELECT TO authenticated
    USING (auth.uid() IS NOT NULL);

-- Floor staff (any authed user) tick the production checks from the TV.
CREATE POLICY "Authed users can update backshop_items"
    ON public.backshop_items FOR UPDATE TO authenticated
    USING (auth.uid() IS NOT NULL)
    WITH CHECK (auth.uid() IS NOT NULL);

-- Private storage bucket for snapshot reference PDFs.
INSERT INTO storage.buckets (id, name, public)
VALUES ('backshop', 'backshop', FALSE)
ON CONFLICT (id) DO NOTHING;

COMMIT;

-- Realtime so the TV board refreshes itself when items are added / ticked.
-- Outside the txn and guarded — re-running won't error if already published.
DO $$
BEGIN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.backshop_items;
EXCEPTION
    WHEN duplicate_object THEN NULL;
    WHEN undefined_object THEN NULL;
END $$;
