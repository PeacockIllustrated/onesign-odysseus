-- Migration: Create Design Packs Tables
-- Interactive design pack creator for client presentation sessions
-- Phase 1: Super-admin only access

-- =============================================================================
-- TABLES: Design Packs
-- =============================================================================

CREATE TABLE public.design_packs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_name TEXT NOT NULL,
    client_name TEXT NOT NULL,
    client_email TEXT,
    status TEXT NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'exported')),

    -- All design data stored as JSONB for flexibility
    -- Structure matches DesignPackData interface from types.ts
    data_json JSONB NOT NULL DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_design_packs_status ON public.design_packs(status);
CREATE INDEX idx_design_packs_created_at ON public.design_packs(created_at DESC);
CREATE INDEX idx_design_packs_created_by ON public.design_packs(created_by);

-- =============================================================================
-- TABLES: Export History
-- =============================================================================

CREATE TABLE public.design_pack_exports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    design_pack_id UUID NOT NULL REFERENCES public.design_packs(id) ON DELETE CASCADE,
    version INT NOT NULL CHECK (version > 0),
    pdf_storage_path TEXT NOT NULL,
    exported_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    exported_by UUID REFERENCES auth.users(id),

    -- Ensure unique version per pack
    UNIQUE (design_pack_id, version)
);

CREATE INDEX idx_design_pack_exports_pack ON public.design_pack_exports(design_pack_id);
CREATE INDEX idx_design_pack_exports_exported_at ON public.design_pack_exports(exported_at DESC);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Update timestamp trigger (reuses existing function)
CREATE TRIGGER trg_design_packs_updated_at
    BEFORE UPDATE ON public.design_packs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on design pack tables
ALTER TABLE public.design_packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_pack_exports ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES: Super-Admin Only
-- =============================================================================

-- design_packs
CREATE POLICY "Super admins can manage design_packs"
    ON public.design_packs FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- design_pack_exports
CREATE POLICY "Super admins can manage design_pack_exports"
    ON public.design_pack_exports FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
