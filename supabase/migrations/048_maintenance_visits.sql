-- Migration 048: maintenance visits — surveys, inspections, repairs, cleaning

BEGIN;

CREATE TABLE IF NOT EXISTS public.maintenance_visits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  visit_type TEXT NOT NULL DEFAULT 'inspection'
    CHECK (visit_type IN ('survey', 'inspection', 'repair', 'cleaning', 'other')),
  status TEXT NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  scheduled_date DATE NOT NULL DEFAULT CURRENT_DATE,
  completed_date DATE,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_visits_org
  ON public.maintenance_visits(org_id);
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_site
  ON public.maintenance_visits(site_id) WHERE site_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_status
  ON public.maintenance_visits(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_visits_scheduled
  ON public.maintenance_visits(scheduled_date);

CREATE TRIGGER trg_maintenance_visits_updated_at
  BEFORE UPDATE ON public.maintenance_visits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.maintenance_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage maintenance_visits"
  ON public.maintenance_visits FOR ALL TO authenticated
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members read their maintenance_visits"
  ON public.maintenance_visits FOR SELECT TO authenticated
  USING (public.is_org_member(org_id));

COMMIT;
