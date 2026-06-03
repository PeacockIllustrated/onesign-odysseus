-- Migration 061: production packs (designer-authored internal works packs)
--
-- A block-based document builder for Tom & Davey to assemble detailed,
-- on-brand signage WORKS packs (the build document that travels with a job
-- through the shop), modelled on the depth of a competitor proposal Chris
-- liked. v1 is deliberately STANDALONE — a pack is authored by hand from a
-- block palette and is not yet wired to a quote / artwork job / production job.
--
-- The whole document (cover + one section per sign + the ordered content
-- blocks) is stored as JSONB so the block model can evolve without a migration
-- per change (mirrors design_packs.data_json, 014). title / client_name /
-- project_name are promoted to columns purely so the list view can sort,
-- search and show them without unpacking the JSON.
--
-- Single-tenant internal tool — super-admin manages everything, matching the
-- RLS stance of design_packs (014) and backshop_items (059).

BEGIN;

CREATE TABLE IF NOT EXISTS public.production_packs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    title TEXT NOT NULL DEFAULT 'Untitled production pack'
        CHECK (length(title) BETWEEN 1 AND 200),
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'ready', 'archived')),

    -- Promoted, list-relevant fields (kept in step with content.cover on save).
    client_name TEXT,
    project_name TEXT,

    -- The whole document: { cover: {...}, sections: [{ blocks: [...] }] }.
    -- Shape matches ProductionPackContent in lib/production-packs/types.ts.
    content JSONB NOT NULL DEFAULT '{"cover":{},"sections":[]}'::jsonb,

    -- Forward-compat seam. v1 packs stand alone, but these soft links let a
    -- later phase wire a pack to the records it documents without a rewrite.
    -- No FK on purpose: keep the standalone tool fully decoupled for now.
    linked_quote_id UUID,
    linked_artwork_job_id UUID,
    linked_production_job_id UUID,

    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_production_packs_status
    ON public.production_packs(status);
CREATE INDEX IF NOT EXISTS idx_production_packs_updated_at
    ON public.production_packs(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_production_packs_created_by
    ON public.production_packs(created_by);

-- Reuses the shared updated_at trigger function (defined in 012, used by 014).
DROP TRIGGER IF EXISTS trg_production_packs_updated_at ON public.production_packs;
CREATE TRIGGER trg_production_packs_updated_at
    BEFORE UPDATE ON public.production_packs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

ALTER TABLE public.production_packs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Super admins can manage production_packs" ON public.production_packs;
CREATE POLICY "Super admins can manage production_packs"
    ON public.production_packs FOR ALL TO authenticated
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- STORAGE: pack imagery (hero / elevation / section detail / reference photos)
-- =============================================================================
-- Public bucket so the print view and the builder can render images directly
-- without server-side signing. These are internal works docs (not secrets) and
-- object paths are unguessable UUIDs ({packId}/{uuid}.{ext}). Writes are
-- super-admin only; reads are public (bucket public = TRUE).
INSERT INTO storage.buckets (id, name, public)
VALUES ('production-packs', 'production-packs', TRUE)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Super admins upload production-pack images" ON storage.objects;
CREATE POLICY "Super admins upload production-pack images"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'production-packs' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admins update production-pack images" ON storage.objects;
CREATE POLICY "Super admins update production-pack images"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'production-packs' AND public.is_super_admin())
    WITH CHECK (bucket_id = 'production-packs' AND public.is_super_admin());

DROP POLICY IF EXISTS "Super admins delete production-pack images" ON storage.objects;
CREATE POLICY "Super admins delete production-pack images"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'production-packs' AND public.is_super_admin());

COMMIT;
