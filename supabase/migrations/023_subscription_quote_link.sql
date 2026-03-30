-- Migration: Link quotes to subscriptions (optional)
-- Retainer clients may have quotes linked to their subscription for bundled pricing.
-- Transactional clients will have subscription_id = NULL (standalone quotes).

ALTER TABLE public.quotes
    ADD COLUMN subscription_id UUID REFERENCES public.subscriptions(id);

COMMENT ON COLUMN public.quotes.subscription_id IS
    'Optional link to a retainer subscription. Retainer clients may have quotes linked to their subscription for bundled pricing; transactional clients will have NULL.';

CREATE INDEX idx_quotes_subscription_id ON public.quotes(subscription_id) WHERE subscription_id IS NOT NULL;
