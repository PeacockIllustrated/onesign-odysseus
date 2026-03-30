-- Migration: Create Artwork Compliance Tables
-- Tracks design-to-production compliance for signage jobs
-- Phase 1: Super-admin only access

-- =============================================================================
-- SEQUENCES
-- =============================================================================

-- Job reference sequence (monotonic, never resets)
CREATE SEQUENCE artwork_job_number_seq START 1;

-- =============================================================================
-- TABLES: Artwork Jobs
-- =============================================================================

CREATE TABLE public.artwork_jobs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_name TEXT NOT NULL,
    job_reference TEXT NOT NULL UNIQUE,
    client_name TEXT,
    description TEXT,
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'in_progress', 'design_complete', 'in_production', 'completed')),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_artwork_jobs_status ON public.artwork_jobs(status);
CREATE INDEX idx_artwork_jobs_created_at ON public.artwork_jobs(created_at DESC);
CREATE INDEX idx_artwork_jobs_reference ON public.artwork_jobs(job_reference);
CREATE INDEX idx_artwork_jobs_created_by ON public.artwork_jobs(created_by);

-- =============================================================================
-- TABLES: Artwork Components
-- =============================================================================

CREATE TABLE public.artwork_components (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.artwork_jobs(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    component_type TEXT NOT NULL DEFAULT 'panel'
        CHECK (component_type IN ('panel', 'vinyl', 'acrylic', 'push_through', 'other')),
    sort_order INT NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending_design'
        CHECK (status IN (
            'pending_design',
            'design_submitted',
            'design_signed_off',
            'in_production',
            'production_complete',
            'flagged'
        )),

    -- Design authority fields
    width_mm NUMERIC(10, 2),
    height_mm NUMERIC(10, 2),
    returns_mm NUMERIC(10, 2),
    material TEXT,
    scale_confirmed BOOLEAN NOT NULL DEFAULT false,
    bleed_included BOOLEAN NOT NULL DEFAULT false,
    file_path TEXT,
    artwork_thumbnail_url TEXT,
    notes TEXT,

    -- Design sign-off
    designed_by UUID REFERENCES auth.users(id),
    design_signed_off_at TIMESTAMPTZ,
    design_signed_off_by UUID REFERENCES auth.users(id),

    -- Production verification fields
    measured_width_mm NUMERIC(10, 2),
    measured_height_mm NUMERIC(10, 2),
    material_confirmed BOOLEAN NOT NULL DEFAULT false,
    rip_no_scaling_confirmed BOOLEAN NOT NULL DEFAULT false,
    production_notes TEXT,

    -- Dimension mismatch detection
    dimension_flag TEXT
        CHECK (dimension_flag IS NULL OR dimension_flag IN ('within_tolerance', 'out_of_tolerance')),
    width_deviation_mm NUMERIC(10, 2),
    height_deviation_mm NUMERIC(10, 2),

    -- Production sign-off
    production_checked_by UUID REFERENCES auth.users(id),
    production_signed_off_at TIMESTAMPTZ,
    production_signed_off_by UUID REFERENCES auth.users(id),

    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_artwork_components_job ON public.artwork_components(job_id);
CREATE INDEX idx_artwork_components_status ON public.artwork_components(status);
CREATE INDEX idx_artwork_components_job_sort ON public.artwork_components(job_id, sort_order);

-- =============================================================================
-- TABLES: Component Version History
-- =============================================================================

CREATE TABLE public.artwork_component_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    component_id UUID NOT NULL REFERENCES public.artwork_components(id) ON DELETE CASCADE,
    version_number INT NOT NULL CHECK (version_number > 0),

    -- Snapshot of design fields at time of version creation
    width_mm NUMERIC(10, 2),
    height_mm NUMERIC(10, 2),
    returns_mm NUMERIC(10, 2),
    material TEXT,
    scale_confirmed BOOLEAN,
    bleed_included BOOLEAN,
    file_path TEXT,
    artwork_thumbnail_url TEXT,
    notes TEXT,

    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,

    UNIQUE (component_id, version_number)
);

CREATE INDEX idx_artwork_component_versions_component
    ON public.artwork_component_versions(component_id);
CREATE INDEX idx_artwork_component_versions_lookup
    ON public.artwork_component_versions(component_id, version_number DESC);

-- =============================================================================
-- TABLES: Production Checks (append-only audit log)
-- =============================================================================

CREATE TABLE public.artwork_production_checks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    component_id UUID NOT NULL REFERENCES public.artwork_components(id) ON DELETE CASCADE,
    check_type TEXT NOT NULL
        CHECK (check_type IN (
            'dimension_measurement',
            'material_confirmation',
            'rip_scaling_check',
            'quality_checkpoint',
            'final_signoff'
        )),
    passed BOOLEAN NOT NULL,
    value_json JSONB DEFAULT '{}',
    notes TEXT,
    checked_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_artwork_production_checks_component
    ON public.artwork_production_checks(component_id);
CREATE INDEX idx_artwork_production_checks_type
    ON public.artwork_production_checks(component_id, check_type);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Generate job reference: AWC-YYYY-000001
CREATE OR REPLACE FUNCTION generate_artwork_job_reference()
RETURNS TRIGGER AS $$
DECLARE
    seq_val BIGINT;
    year_str TEXT;
BEGIN
    seq_val := nextval('artwork_job_number_seq');
    year_str := to_char(now() AT TIME ZONE 'UTC', 'YYYY');
    NEW.job_reference := 'AWC-' || year_str || '-' || lpad(seq_val::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_artwork_jobs_generate_reference
    BEFORE INSERT ON public.artwork_jobs
    FOR EACH ROW
    WHEN (NEW.job_reference IS NULL)
    EXECUTE FUNCTION generate_artwork_job_reference();

-- Update timestamp triggers (reuses existing function)
CREATE TRIGGER trg_artwork_jobs_updated_at
    BEFORE UPDATE ON public.artwork_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_artwork_components_updated_at
    BEFORE UPDATE ON public.artwork_components
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.artwork_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_component_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artwork_production_checks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES: Super-Admin Only
-- =============================================================================

CREATE POLICY "Super admins can manage artwork_jobs"
    ON public.artwork_jobs FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can manage artwork_components"
    ON public.artwork_components FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can manage artwork_component_versions"
    ON public.artwork_component_versions FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can manage artwork_production_checks"
    ON public.artwork_production_checks FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- STORAGE: Artwork Assets Bucket
-- =============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('artwork-assets', 'artwork-assets', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Super admins can manage artwork-assets"
    ON storage.objects FOR ALL
    USING (bucket_id = 'artwork-assets' AND public.is_super_admin())
    WITH CHECK (bucket_id = 'artwork-assets' AND public.is_super_admin());

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
