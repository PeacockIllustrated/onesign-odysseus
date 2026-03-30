-- Migration: Create architect_leads table for architect enquiry form
-- This table is isolated to the architects arm of the site

CREATE TABLE public.architect_leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Practice Information
  practice_name TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  contact_role TEXT,
  email TEXT NOT NULL,
  phone TEXT,
  
  -- Project Information
  project_name TEXT,
  project_type TEXT, -- 'public_realm' | 'heritage' | 'education' | 'mixed_use' | 'other'
  riba_stage TEXT, -- '1' to '7' or 'not_sure'
  location TEXT,
  planning_sensitive BOOLEAN DEFAULT false, -- Conservation / listed / sensitive context
  
  -- Support Requirements
  support_needed TEXT[], -- Array of engagement types
  notes TEXT,
  
  -- Metadata
  status TEXT DEFAULT 'new',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.architect_leads ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Anonymous users can insert (public form submission)
CREATE POLICY "Allow anonymous inserts on architect_leads"
  ON public.architect_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- RLS Policy: Authenticated users can read leads
CREATE POLICY "Authenticated users can read architect_leads"
  ON public.architect_leads
  FOR SELECT
  TO authenticated
  USING (true);

-- RLS Policy: Super admins have full access
CREATE POLICY "Super admins have full access to architect_leads"
  ON public.architect_leads
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'super_admin'
    )
  );

-- Index on created_at for efficient sorting
CREATE INDEX idx_architect_leads_created_at ON public.architect_leads(created_at DESC);

-- Index on status for filtering
CREATE INDEX idx_architect_leads_status ON public.architect_leads(status);
