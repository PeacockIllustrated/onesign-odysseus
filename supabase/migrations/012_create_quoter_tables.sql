-- Migration: Create Internal Quoter Tables
-- Phase 1: Super-admin only access for all quoter tables
-- Currency: INTEGER in pence (matching repo convention)

-- =============================================================================
-- ENUMS
-- =============================================================================

CREATE TYPE pricing_set_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE quote_status AS ENUM ('draft', 'sent', 'accepted', 'rejected', 'expired');

-- =============================================================================
-- SEQUENCES
-- =============================================================================

-- Quote number sequence (monotonic, never resets)
CREATE SEQUENCE quote_number_seq START 1;

-- =============================================================================
-- TABLES: Pricing Sets
-- =============================================================================

CREATE TABLE public.pricing_sets (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    status pricing_set_status NOT NULL DEFAULT 'draft',
    effective_from TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

-- Enforce single active pricing set
CREATE UNIQUE INDEX idx_pricing_sets_single_active 
    ON public.pricing_sets (status) 
    WHERE status = 'active';

CREATE INDEX idx_pricing_sets_status ON public.pricing_sets(status);

-- =============================================================================
-- TABLES: Rate Cards (all scoped by pricing_set_id)
-- =============================================================================

-- Panel prices by material and sheet size
CREATE TABLE public.panel_prices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    material TEXT NOT NULL,
    sheet_size TEXT NOT NULL, -- e.g. '2.4 x 1.2' or '3 x 1.5'
    unit_cost_pence INTEGER NOT NULL CHECK (unit_cost_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, material, sheet_size)
);

CREATE INDEX idx_panel_prices_set ON public.panel_prices(pricing_set_id);

-- Panel finishes with cost per square metre
CREATE TABLE public.panel_finishes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    finish TEXT NOT NULL,
    cost_per_m2_pence INTEGER NOT NULL CHECK (cost_per_m2_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, finish)
);

CREATE INDEX idx_panel_finishes_set ON public.panel_finishes(pricing_set_id);

-- Manufacturing labour rates by task
CREATE TABLE public.manufacturing_rates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    task TEXT NOT NULL, -- router, fabrication, assembly, vinyl, print
    cost_per_hour_pence INTEGER NOT NULL CHECK (cost_per_hour_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, task)
);

CREATE INDEX idx_manufacturing_rates_set ON public.manufacturing_rates(pricing_set_id);

-- LED counts per letter by height
CREATE TABLE public.illumination_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    height_mm INTEGER NOT NULL CHECK (height_mm > 0),
    leds_per_letter INTEGER NOT NULL CHECK (leds_per_letter > 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, height_mm)
);

CREATE INDEX idx_illumination_profiles_set ON public.illumination_profiles(pricing_set_id);

-- Transformer specifications
CREATE TABLE public.transformers (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    type TEXT NOT NULL, -- '20W', '60W', '100W', '150W'
    led_capacity INTEGER NOT NULL CHECK (led_capacity > 0),
    unit_cost_pence INTEGER NOT NULL CHECK (unit_cost_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, type)
);

CREATE INDEX idx_transformers_set ON public.transformers(pricing_set_id);

-- Opal sheet prices
CREATE TABLE public.opal_prices (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    opal_type TEXT NOT NULL, -- 'Opal (5mm)', 'Opal (10mm)'
    sheet_size TEXT NOT NULL, -- e.g. '2.4 x 1.2'
    unit_cost_pence INTEGER NOT NULL CHECK (unit_cost_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, opal_type, sheet_size)
);

CREATE INDEX idx_opal_prices_set ON public.opal_prices(pricing_set_id);

-- Generic consumables (key-value store)
CREATE TABLE public.consumables (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    key TEXT NOT NULL, -- e.g. 'led_unit_cost'
    value_pence INTEGER NOT NULL CHECK (value_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, key)
);

CREATE INDEX idx_consumables_set ON public.consumables(pricing_set_id);

-- Letter pricing by type, finish, and height
CREATE TABLE public.letter_price_table (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    letter_type TEXT NOT NULL, -- 'Fabricated', 'Komacel', 'Acrylic'
    finish TEXT NOT NULL,
    height_mm INTEGER NOT NULL CHECK (height_mm > 0),
    unit_price_pence INTEGER NOT NULL CHECK (unit_price_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, letter_type, finish, height_mm)
);

CREATE INDEX idx_letter_price_table_set ON public.letter_price_table(pricing_set_id);
CREATE INDEX idx_letter_price_table_lookup 
    ON public.letter_price_table(pricing_set_id, letter_type, finish, height_mm);

-- Allowed finishes per letter type
CREATE TABLE public.letter_finish_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id) ON DELETE CASCADE,
    letter_type TEXT NOT NULL,
    allowed_finish TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    UNIQUE (pricing_set_id, letter_type, allowed_finish)
);

CREATE INDEX idx_letter_finish_rules_set ON public.letter_finish_rules(pricing_set_id);

-- =============================================================================
-- TABLES: Quotes
-- =============================================================================

CREATE TABLE public.quotes (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_number TEXT NOT NULL UNIQUE,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    status quote_status NOT NULL DEFAULT 'draft',
    pricing_set_id UUID NOT NULL REFERENCES public.pricing_sets(id),
    notes_internal TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id),
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX idx_quotes_status ON public.quotes(status);
CREATE INDEX idx_quotes_pricing_set ON public.quotes(pricing_set_id);
CREATE INDEX idx_quotes_created_at ON public.quotes(created_at DESC);

-- Quote line items with input/output snapshots
CREATE TABLE public.quote_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    item_type TEXT NOT NULL, -- e.g. 'panel_letters_v1'
    input_json JSONB NOT NULL,
    output_json JSONB NOT NULL,
    line_total_pence INTEGER NOT NULL CHECK (line_total_pence >= 0),
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX idx_quote_items_quote ON public.quote_items(quote_id);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Generate quote number: OSD-YYYY-000001
CREATE OR REPLACE FUNCTION generate_quote_number()
RETURNS TRIGGER AS $$
DECLARE
    seq_val BIGINT;
    year_str TEXT;
BEGIN
    seq_val := nextval('quote_number_seq');
    year_str := to_char(now() AT TIME ZONE 'UTC', 'YYYY');
    NEW.quote_number := 'OSD-' || year_str || '-' || lpad(seq_val::text, 6, '0');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quotes_generate_number
    BEFORE INSERT ON public.quotes
    FOR EACH ROW
    WHEN (NEW.quote_number IS NULL)
    EXECUTE FUNCTION generate_quote_number();

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_quotes_updated_at
    BEFORE UPDATE ON public.quotes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

-- Enable RLS on all quoter tables
ALTER TABLE public.pricing_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.panel_finishes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.illumination_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transformers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opal_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consumables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.letter_price_table ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.letter_finish_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- RLS POLICIES: Super-Admin Only (Phase 1 hardening)
-- =============================================================================

-- pricing_sets
CREATE POLICY "Super admins can manage pricing_sets"
    ON public.pricing_sets FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- panel_prices
CREATE POLICY "Super admins can manage panel_prices"
    ON public.panel_prices FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- panel_finishes
CREATE POLICY "Super admins can manage panel_finishes"
    ON public.panel_finishes FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- manufacturing_rates
CREATE POLICY "Super admins can manage manufacturing_rates"
    ON public.manufacturing_rates FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- illumination_profiles
CREATE POLICY "Super admins can manage illumination_profiles"
    ON public.illumination_profiles FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- transformers
CREATE POLICY "Super admins can manage transformers"
    ON public.transformers FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- opal_prices
CREATE POLICY "Super admins can manage opal_prices"
    ON public.opal_prices FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- consumables
CREATE POLICY "Super admins can manage consumables"
    ON public.consumables FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- letter_price_table
CREATE POLICY "Super admins can manage letter_price_table"
    ON public.letter_price_table FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- letter_finish_rules
CREATE POLICY "Super admins can manage letter_finish_rules"
    ON public.letter_finish_rules FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- quotes
CREATE POLICY "Super admins can manage quotes"
    ON public.quotes FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- quote_items
CREATE POLICY "Super admins can manage quote_items"
    ON public.quote_items FOR ALL
    USING (public.is_super_admin())
    WITH CHECK (public.is_super_admin());

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
