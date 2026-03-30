-- Migration: Admin RLS Policies & Lead Conversion Tracking
-- Adds super_admin access to all tables and lead conversion tracking columns

-- =============================================================================
-- STEP 1: Add lead conversion tracking columns
-- =============================================================================

ALTER TABLE public.marketing_leads 
ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id);

ALTER TABLE public.marketing_leads 
ADD COLUMN IF NOT EXISTS converted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_marketing_leads_org_id ON public.marketing_leads(org_id);

-- =============================================================================
-- STEP 2: Super Admin RLS Policies for orgs
-- =============================================================================

-- Super admins can view all orgs
CREATE POLICY "Super admins can view all orgs"
    ON public.orgs FOR SELECT
    USING (public.is_super_admin());

-- Super admins can create orgs
CREATE POLICY "Super admins can create orgs"
    ON public.orgs FOR INSERT
    WITH CHECK (public.is_super_admin());

-- Super admins can update all orgs
CREATE POLICY "Super admins can update all orgs"
    ON public.orgs FOR UPDATE
    USING (public.is_super_admin());

-- Super admins can delete orgs
CREATE POLICY "Super admins can delete orgs"
    ON public.orgs FOR DELETE
    USING (public.is_super_admin());

-- =============================================================================
-- STEP 3: Super Admin RLS Policies for org_members
-- =============================================================================

CREATE POLICY "Super admins can view all org members"
    ON public.org_members FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can create org members"
    ON public.org_members FOR INSERT
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update org members"
    ON public.org_members FOR UPDATE
    USING (public.is_super_admin());

CREATE POLICY "Super admins can delete org members"
    ON public.org_members FOR DELETE
    USING (public.is_super_admin());

-- =============================================================================
-- STEP 4: Super Admin RLS Policies for subscriptions
-- =============================================================================

CREATE POLICY "Super admins can view all subscriptions"
    ON public.subscriptions FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can create subscriptions"
    ON public.subscriptions FOR INSERT
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update subscriptions"
    ON public.subscriptions FOR UPDATE
    USING (public.is_super_admin());

CREATE POLICY "Super admins can delete subscriptions"
    ON public.subscriptions FOR DELETE
    USING (public.is_super_admin());

-- =============================================================================
-- STEP 5: Super Admin RLS Policies for subscription_accelerators
-- =============================================================================

CREATE POLICY "Super admins can view all subscription accelerators"
    ON public.subscription_accelerators FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can create subscription accelerators"
    ON public.subscription_accelerators FOR INSERT
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update subscription accelerators"
    ON public.subscription_accelerators FOR UPDATE
    USING (public.is_super_admin());

CREATE POLICY "Super admins can delete subscription accelerators"
    ON public.subscription_accelerators FOR DELETE
    USING (public.is_super_admin());

-- =============================================================================
-- STEP 6: Super Admin RLS Policies for marketing_leads
-- =============================================================================

CREATE POLICY "Super admins can view all marketing leads"
    ON public.marketing_leads FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can update marketing leads"
    ON public.marketing_leads FOR UPDATE
    USING (public.is_super_admin());

-- =============================================================================
-- STEP 7: Super Admin RLS Policies for reports
-- =============================================================================

CREATE POLICY "Super admins can view all reports"
    ON public.reports FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can create reports"
    ON public.reports FOR INSERT
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update reports"
    ON public.reports FOR UPDATE
    USING (public.is_super_admin());

CREATE POLICY "Super admins can delete reports"
    ON public.reports FOR DELETE
    USING (public.is_super_admin());

-- =============================================================================
-- STEP 8: Super Admin RLS Policies for client_assets
-- =============================================================================

CREATE POLICY "Super admins can view all client assets"
    ON public.client_assets FOR SELECT
    USING (public.is_super_admin());

CREATE POLICY "Super admins can create client assets"
    ON public.client_assets FOR INSERT
    WITH CHECK (public.is_super_admin());

CREATE POLICY "Super admins can update client assets"
    ON public.client_assets FOR UPDATE
    USING (public.is_super_admin());

CREATE POLICY "Super admins can delete client assets"
    ON public.client_assets FOR DELETE
    USING (public.is_super_admin());

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
