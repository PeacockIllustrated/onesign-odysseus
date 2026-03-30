-- Migration 024: Create Production Pipeline Tables
-- Phase 1: Job board, shop floor queue, stage tracking

-- =============================================================================
-- SEQUENCE: job numbers (monotonic, never resets)
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS job_number_seq START 1;

-- =============================================================================
-- TABLE: production_stages
-- =============================================================================

CREATE TABLE public.production_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  color TEXT NOT NULL DEFAULT '#4e7e8c',
  is_approval_stage BOOLEAN NOT NULL DEFAULT FALSE,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed default stages (org_id NULL = global defaults)
INSERT INTO public.production_stages (name, slug, sort_order, color, is_approval_stage, is_default) VALUES
  ('Design',           'design',          1, '#7F77DD', FALSE, TRUE),
  ('Artwork Approval', 'artwork-approval', 2, '#D85A30', TRUE,  TRUE),
  ('Print',            'print',            3, '#378ADD', FALSE, TRUE),
  ('Fabrication',      'fabrication',      4, '#BA7517', FALSE, TRUE),
  ('Finishing',        'finishing',        5, '#D4537E', FALSE, TRUE),
  ('QC',               'qc',               6, '#2D8A5E', FALSE, TRUE),
  ('Dispatch',         'dispatch',         7, '#4e7e8c', FALSE, TRUE);

-- =============================================================================
-- TABLE: production_jobs
-- =============================================================================

CREATE TABLE public.production_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  quote_id UUID REFERENCES public.quotes(id) ON DELETE SET NULL,
  job_number TEXT NOT NULL UNIQUE DEFAULT '',
  title TEXT NOT NULL,
  description TEXT,
  client_name TEXT NOT NULL,
  current_stage_id UUID REFERENCES public.production_stages(id),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('urgent', 'high', 'normal', 'low')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  assigned_to UUID REFERENCES auth.users(id),
  assigned_initials TEXT,
  due_date DATE,
  total_items INTEGER NOT NULL DEFAULT 1,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- =============================================================================
-- TABLE: job_items
-- =============================================================================

CREATE TABLE public.job_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  quote_item_id UUID REFERENCES public.quote_items(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  current_stage_id UUID REFERENCES public.production_stages(id),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLE: job_stage_log
-- =============================================================================

CREATE TABLE public.job_stage_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  job_item_id UUID REFERENCES public.job_items(id) ON DELETE CASCADE,
  from_stage_id UUID REFERENCES public.production_stages(id),
  to_stage_id UUID NOT NULL REFERENCES public.production_stages(id),
  moved_by UUID REFERENCES auth.users(id),
  moved_by_name TEXT,
  notes TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TABLE: department_instructions
-- =============================================================================

CREATE TABLE public.department_instructions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.production_jobs(id) ON DELETE CASCADE,
  stage_id UUID NOT NULL REFERENCES public.production_stages(id),
  instruction TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Generate job number: JOB-YYYY-000001
CREATE OR REPLACE FUNCTION generate_job_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_val BIGINT;
    year_str TEXT;
BEGIN
    seq_val := nextval('job_number_seq');
    year_str := to_char(now() AT TIME ZONE 'UTC', 'YYYY');
    NEW.job_number := 'JOB-' || year_str || '-' || lpad(seq_val::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_production_jobs_number
    BEFORE INSERT ON public.production_jobs
    FOR EACH ROW
    WHEN (NEW.job_number = '' OR NEW.job_number IS NULL)
    EXECUTE FUNCTION generate_job_number();

-- Reuse update_updated_at() from migration 012
CREATE TRIGGER trg_production_jobs_updated_at
    BEFORE UPDATE ON public.production_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_production_jobs_org ON public.production_jobs(org_id);
CREATE INDEX idx_production_jobs_stage ON public.production_jobs(current_stage_id);
CREATE INDEX idx_production_jobs_status ON public.production_jobs(status);
CREATE INDEX idx_production_jobs_due ON public.production_jobs(due_date);
CREATE INDEX idx_job_items_job ON public.job_items(job_id);
CREATE INDEX idx_job_stage_log_job ON public.job_stage_log(job_id);
CREATE INDEX idx_dept_instructions_job ON public.department_instructions(job_id);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.production_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_stage_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_instructions ENABLE ROW LEVEL SECURITY;

-- production_stages: readable by all authenticated users (config data)
CREATE POLICY "Authenticated users can view stages"
    ON public.production_stages FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Super admins can manage stages"
    ON public.production_stages FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- production_jobs: super admins manage all; org members can read their org's jobs
CREATE POLICY "Super admins can manage production jobs"
    ON public.production_jobs FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members can view their org jobs"
    ON public.production_jobs FOR SELECT
    USING (public.is_org_member(org_id));

-- job_items: mirror job access
CREATE POLICY "Super admins can manage job items"
    ON public.job_items FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members can view their job items"
    ON public.job_items FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.production_jobs pj
            WHERE pj.id = job_id AND public.is_org_member(pj.org_id)
        )
    );

-- job_stage_log: super admins only
CREATE POLICY "Super admins can manage stage log"
    ON public.job_stage_log FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- department_instructions: super admins only
CREATE POLICY "Super admins can manage department instructions"
    ON public.department_instructions FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- REALTIME
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE public.production_jobs;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_items;
ALTER PUBLICATION supabase_realtime ADD TABLE public.job_stage_log;
