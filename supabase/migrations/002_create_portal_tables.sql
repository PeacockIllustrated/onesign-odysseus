-- Migration: Create portal tables for authenticated client application
-- Links to existing profiles table for user references

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE org_role AS ENUM ('owner', 'admin', 'member');
CREATE TYPE deliverable_status AS ENUM ('draft', 'in_progress', 'submitted', 'approved', 'rejected');
CREATE TYPE subscription_status AS ENUM ('active', 'paused', 'cancelled');
CREATE TYPE asset_type AS ENUM ('creative', 'brand', 'document', 'other');

-- =============================================================================
-- TABLES
-- =============================================================================

-- Client organisations
CREATE TABLE public.orgs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ
);

-- Organisation membership (links profiles to orgs with role)
CREATE TABLE public.org_members (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role org_role NOT NULL DEFAULT 'member',
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(org_id, user_id)
);

-- Package subscriptions
CREATE TABLE public.subscriptions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    package_key TEXT NOT NULL, -- 'launch' | 'scale' | 'dominate'
    term_months INTEGER NOT NULL DEFAULT 3,
    ad_spend_included INTEGER, -- in GBP pence
    status subscription_status NOT NULL DEFAULT 'active',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ
);

-- Active accelerators for a subscription
CREATE TABLE public.subscription_accelerators (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    accelerator_key TEXT NOT NULL, -- e.g. 'video_content_boost'
    status subscription_status NOT NULL DEFAULT 'active',
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE(org_id, accelerator_key)
);

-- Monthly deliverables
CREATE TABLE public.deliverables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month for grouping
    title TEXT NOT NULL,
    description TEXT,
    status deliverable_status NOT NULL DEFAULT 'draft',
    due_date DATE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ
);

-- Comments/updates on deliverables
CREATE TABLE public.deliverable_updates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    deliverable_id UUID NOT NULL REFERENCES public.deliverables(id) ON DELETE CASCADE,
    comment TEXT,
    status_change deliverable_status, -- Optional: if this update changed status
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Client assets (uploaded files)
CREATE TABLE public.client_assets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    type asset_type NOT NULL DEFAULT 'other',
    name TEXT NOT NULL,
    storage_path TEXT NOT NULL, -- Path in Supabase Storage
    file_size INTEGER, -- bytes
    mime_type TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    uploaded_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Monthly reports
CREATE TABLE public.reports (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
    month DATE NOT NULL, -- First day of the month
    title TEXT NOT NULL,
    storage_path TEXT, -- PDF path in Storage
    summary JSONB DEFAULT '{}'::jsonb, -- Key metrics
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- =============================================================================
-- INDEXES
-- =============================================================================

CREATE INDEX idx_org_members_user ON public.org_members(user_id);
CREATE INDEX idx_org_members_org ON public.org_members(org_id);
CREATE INDEX idx_subscriptions_org ON public.subscriptions(org_id);
CREATE INDEX idx_deliverables_org_month ON public.deliverables(org_id, month DESC);
CREATE INDEX idx_deliverable_updates_deliverable ON public.deliverable_updates(deliverable_id);
CREATE INDEX idx_client_assets_org ON public.client_assets(org_id);
CREATE INDEX idx_reports_org_month ON public.reports(org_id, month DESC);

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_accelerators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliverable_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

-- Helper function: check if user is member of org
CREATE OR REPLACE FUNCTION public.is_org_member(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.org_members
        WHERE org_id = check_org_id AND user_id = auth.uid()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: check if user is admin/owner of org
CREATE OR REPLACE FUNCTION public.is_org_admin(check_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.org_members
        WHERE org_id = check_org_id 
        AND user_id = auth.uid()
        AND role IN ('owner', 'admin')
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- RLS POLICIES: orgs
-- =============================================================================

-- Users can see orgs they belong to
CREATE POLICY "Users can view their orgs"
    ON public.orgs FOR SELECT
    USING (public.is_org_member(id));

-- Authenticated users can create orgs (for signup flow)
CREATE POLICY "Authenticated users can create orgs"
    ON public.orgs FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

-- Only owners can update org details
CREATE POLICY "Owners can update their org"
    ON public.orgs FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.org_members
        WHERE org_id = orgs.id AND user_id = auth.uid() AND role = 'owner'
    ));

-- =============================================================================
-- RLS POLICIES: org_members
-- =============================================================================

-- Users can see members of their orgs
CREATE POLICY "Users can view org members"
    ON public.org_members FOR SELECT
    USING (public.is_org_member(org_id));

-- Users can add themselves as owner to any org (for signup - creates initial membership)
-- Note: In production, you may want to restrict this further or use a database function
CREATE POLICY "Users can add themselves as owner"
    ON public.org_members FOR INSERT
    WITH CHECK (
        user_id = auth.uid() 
        AND role = 'owner'
        AND NOT EXISTS (
            SELECT 1 FROM public.org_members WHERE org_id = org_members.org_id
        )
    );

-- Admins/owners can add other members
CREATE POLICY "Admins can insert other members"
    ON public.org_members FOR INSERT
    WITH CHECK (
        user_id != auth.uid() 
        AND public.is_org_admin(org_id)
    );

CREATE POLICY "Admins can update members"
    ON public.org_members FOR UPDATE
    USING (public.is_org_admin(org_id));

CREATE POLICY "Admins can delete members"
    ON public.org_members FOR DELETE
    USING (public.is_org_admin(org_id));

-- =============================================================================
-- RLS POLICIES: subscriptions
-- =============================================================================

CREATE POLICY "Users can view org subscriptions"
    ON public.subscriptions FOR SELECT
    USING (public.is_org_member(org_id));

-- =============================================================================
-- RLS POLICIES: subscription_accelerators
-- =============================================================================

CREATE POLICY "Users can view org accelerators"
    ON public.subscription_accelerators FOR SELECT
    USING (public.is_org_member(org_id));

-- =============================================================================
-- RLS POLICIES: deliverables
-- =============================================================================

CREATE POLICY "Users can view org deliverables"
    ON public.deliverables FOR SELECT
    USING (public.is_org_member(org_id));

CREATE POLICY "Admins can manage deliverables"
    ON public.deliverables FOR ALL
    USING (public.is_org_admin(org_id));

-- =============================================================================
-- RLS POLICIES: deliverable_updates
-- =============================================================================

CREATE POLICY "Users can view deliverable updates"
    ON public.deliverable_updates FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM public.deliverables d
            WHERE d.id = deliverable_id AND public.is_org_member(d.org_id)
        )
    );

CREATE POLICY "Members can add updates"
    ON public.deliverable_updates FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.deliverables d
            WHERE d.id = deliverable_id AND public.is_org_member(d.org_id)
        )
    );

-- =============================================================================
-- RLS POLICIES: client_assets
-- =============================================================================

CREATE POLICY "Users can view org assets"
    ON public.client_assets FOR SELECT
    USING (public.is_org_member(org_id));

CREATE POLICY "Members can upload assets"
    ON public.client_assets FOR INSERT
    WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Admins can delete assets"
    ON public.client_assets FOR DELETE
    USING (public.is_org_admin(org_id));

-- =============================================================================
-- RLS POLICIES: reports
-- =============================================================================

CREATE POLICY "Users can view org reports"
    ON public.reports FOR SELECT
    USING (public.is_org_member(org_id));

-- =============================================================================
-- STORAGE BUCKET (run via Supabase dashboard or CLI)
-- =============================================================================
-- INSERT INTO storage.buckets (id, name, public)
-- VALUES ('client-assets', 'client-assets', false);

-- Storage RLS would use path prefix matching:
-- e.g., files stored at: client-assets/{org_id}/{filename}
