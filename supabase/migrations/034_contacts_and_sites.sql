-- Migration 034: Clients, contacts, sites + interconnection FKs across all modules.

-- ============================================================================
-- A. Extend orgs with company details
-- ============================================================================
ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS business_type TEXT,
  ADD COLUMN IF NOT EXISTS account_number TEXT,
  ADD COLUMN IF NOT EXISTS company_reg_number TEXT,
  ADD COLUMN IF NOT EXISTS vat_number TEXT,
  ADD COLUMN IF NOT EXISTS tax_code TEXT DEFAULT 'T1 (20%)',
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'GBP',
  ADD COLUMN IF NOT EXISTS payment_terms_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS sales_discount_percent NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_orgs_tags ON public.orgs USING GIN(tags);

-- ============================================================================
-- B. Contacts table
-- ============================================================================
CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  mobile TEXT,
  job_title TEXT,
  contact_type TEXT NOT NULL DEFAULT 'general'
    CHECK (contact_type IN ('primary', 'billing', 'site', 'general')),
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contacts_primary_per_org
  ON public.contacts(org_id) WHERE is_primary = TRUE;
CREATE INDEX idx_contacts_org ON public.contacts(org_id);
CREATE INDEX idx_contacts_email ON public.contacts(email) WHERE email IS NOT NULL;

-- ============================================================================
-- C. Org sites table
-- ============================================================================
CREATE TABLE public.org_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  address_line_1 TEXT,
  address_line_2 TEXT,
  city TEXT,
  county TEXT,
  postcode TEXT,
  country TEXT NOT NULL DEFAULT 'United Kingdom',
  phone TEXT,
  email TEXT,
  site_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  is_primary BOOLEAN NOT NULL DEFAULT FALSE,
  is_billing_address BOOLEAN NOT NULL DEFAULT FALSE,
  is_delivery_address BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_sites_primary_per_org
  ON public.org_sites(org_id) WHERE is_primary = TRUE;
CREATE INDEX idx_sites_org ON public.org_sites(org_id);
CREATE INDEX idx_sites_postcode ON public.org_sites(postcode) WHERE postcode IS NOT NULL;

-- ============================================================================
-- D. Interconnection FKs (all nullable)
-- ============================================================================

-- Quotes: link to org + contact + site
ALTER TABLE public.quotes
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_quotes_org ON public.quotes(org_id) WHERE org_id IS NOT NULL;

-- Production jobs: add contact + site (already has org_id)
ALTER TABLE public.production_jobs
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL;

-- Invoices: billing contact + address (already has org_id)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS billing_contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS billing_site_id UUID REFERENCES public.org_sites(id) ON DELETE SET NULL;

-- Artwork jobs: link to org + contact
ALTER TABLE public.artwork_jobs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_artwork_jobs_org ON public.artwork_jobs(org_id) WHERE org_id IS NOT NULL;

-- Design packs: link to org + contact
ALTER TABLE public.design_packs
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_design_packs_org ON public.design_packs(org_id) WHERE org_id IS NOT NULL;

-- ============================================================================
-- E. Row Level Security
-- ============================================================================
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_sites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins can manage contacts"
  ON public.contacts FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members can view their org contacts"
  ON public.contacts FOR SELECT
  USING (public.is_org_member(org_id));

CREATE POLICY "Super admins can manage org_sites"
  ON public.org_sites FOR ALL
  USING (public.is_super_admin())
  WITH CHECK (public.is_super_admin());

CREATE POLICY "Org members can view their org sites"
  ON public.org_sites FOR SELECT
  USING (public.is_org_member(org_id));
