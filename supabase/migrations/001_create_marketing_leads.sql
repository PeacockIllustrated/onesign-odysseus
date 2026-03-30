-- Migration: Create marketing_leads table for enquiry wizard
-- Prefixed with marketing_ to differentiate from signage workflow tables

CREATE TABLE public.marketing_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Contact Information
  contact_name TEXT NOT NULL,
  contact_role TEXT,
  contact_email TEXT NOT NULL,
  contact_phone TEXT,
  
  -- Business Information
  company_name TEXT NOT NULL,
  company_website TEXT,
  industry_type TEXT,
  service_areas TEXT[], -- Array of locations/regions
  
  -- Commercial Details
  avg_job_value TEXT, -- Range like "£1k-5k", "£5k-10k", etc.
  capacity_per_week TEXT,
  coverage_radius TEXT,
  ideal_customer TEXT,
  
  -- Current State
  current_lead_sources TEXT[], -- Array: "referrals", "organic", "paid", etc.
  has_existing_ads BOOLEAN DEFAULT false,
  has_existing_landing_page BOOLEAN DEFAULT false,
  
  -- Intent & Selection
  desired_start_date TEXT,
  package_key TEXT, -- 'launch' | 'scale' | 'dominate'
  accelerator_keys TEXT[], -- Array of accelerator item keys
  notes TEXT,
  
  -- Metadata
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.marketing_leads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anonymous users (anon key) can insert
CREATE POLICY "Allow anonymous inserts"
  ON public.marketing_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- RLS Policy: Only authenticated users can read leads
CREATE POLICY "Authenticated users can read marketing leads"
  ON public.marketing_leads
  FOR SELECT
  TO authenticated
  USING (true);

-- Optional: Index on created_at for efficient sorting
CREATE INDEX idx_marketing_leads_created_at ON public.marketing_leads(created_at DESC);

-- Optional: Index on status for filtering
CREATE INDEX idx_marketing_leads_status ON public.marketing_leads(status);
