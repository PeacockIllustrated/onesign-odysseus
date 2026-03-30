-- Migration 018: Artwork client approval system
-- Stores approval tokens, client info, e-signature data for client sign-off

-- =============================================================================
-- TABLE: artwork_approvals
-- =============================================================================

CREATE TABLE public.artwork_approvals (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    job_id UUID NOT NULL REFERENCES public.artwork_jobs(id) ON DELETE CASCADE,

    -- Token for public access (64-char hex, 256-bit entropy)
    token TEXT NOT NULL UNIQUE,

    -- Lifecycle
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'expired', 'revoked')),

    -- Token expiry
    expires_at TIMESTAMPTZ NOT NULL,

    -- Client details (filled on approval submission)
    client_name TEXT,
    client_email TEXT,
    client_company TEXT,

    -- Signature data (base64 data URL from canvas)
    signature_data TEXT,

    -- Approval timestamp
    approved_at TIMESTAMPTZ,

    -- Admin who generated the link
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes
CREATE INDEX idx_artwork_approvals_token ON public.artwork_approvals(token);
CREATE INDEX idx_artwork_approvals_job ON public.artwork_approvals(job_id);
CREATE INDEX idx_artwork_approvals_status ON public.artwork_approvals(status);

-- Updated_at trigger (reusing existing function from migration 012)
CREATE TRIGGER trg_artwork_approvals_updated_at
    BEFORE UPDATE ON public.artwork_approvals
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE public.artwork_approvals ENABLE ROW LEVEL SECURITY;

-- Super admins can manage all approvals
CREATE POLICY "Super admins can manage artwork_approvals"
    ON public.artwork_approvals FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Public SELECT access for token lookup (approval page)
CREATE POLICY "Anyone can view approval by token"
    ON public.artwork_approvals FOR SELECT
    USING (true);

-- Public UPDATE for submitting approval (only pending + not expired)
CREATE POLICY "Anyone can submit approval on pending tokens"
    ON public.artwork_approvals FOR UPDATE
    USING (
        status = 'pending'
        AND expires_at > now()
    )
    WITH CHECK (
        status = 'approved'
    );
