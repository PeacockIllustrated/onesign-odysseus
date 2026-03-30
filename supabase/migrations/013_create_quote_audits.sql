-- Migration: Create Quote Audits Table
-- Track changes to quotes and line items for accountability

CREATE TABLE public.quote_audits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    user_email TEXT NOT NULL,
    action TEXT NOT NULL, -- 'update_quote', 'update_item', 'add_item', 'delete_item', 'duplicate_item'
    summary TEXT,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_quote_audits_quote ON public.quote_audits(quote_id);
CREATE INDEX idx_quote_audits_created_at ON public.quote_audits(created_at DESC);

-- Enable RLS
ALTER TABLE public.quote_audits ENABLE ROW LEVEL SECURITY;

-- Super-admin only access (Phase 1 hardening)
CREATE POLICY "Super admins can manage quote_audits"
    ON public.quote_audits FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- Revalidate trigger for quotes if needed (though we handle it in actions)
-- For now, we'll rely on server actions to insert into this table.
