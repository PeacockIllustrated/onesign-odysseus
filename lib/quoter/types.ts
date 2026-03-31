/**
 * Quoter Types and Zod Schemas
 * 
 * Database types for quoter tables and Zod schemas for engine input validation.
 * Currency values are in pence (INTEGER) matching repo convention.
 */

import { z } from 'zod';

// =============================================================================
// DATABASE TYPES
// =============================================================================

export type PricingSetStatus = 'draft' | 'active' | 'archived';
export type QuoteStatus = 'draft' | 'sent' | 'accepted' | 'rejected' | 'expired';

export interface PricingSet {
    id: string;
    name: string;
    status: PricingSetStatus;
    effective_from: string | null;
    created_at: string;
    created_by: string | null;
}

export interface PanelPrice {
    id: string;
    pricing_set_id: string;
    material: string;
    sheet_size: string;
    unit_cost_pence: number;
    created_at: string;
}

export interface PanelFinish {
    id: string;
    pricing_set_id: string;
    finish: string;
    cost_per_m2_pence: number;
    created_at: string;
}

export interface ManufacturingRate {
    id: string;
    pricing_set_id: string;
    task: string;
    cost_per_hour_pence: number;
    created_at: string;
}

export interface IlluminationProfile {
    id: string;
    pricing_set_id: string;
    height_mm: number;
    leds_per_letter: number;
    created_at: string;
}

export interface Transformer {
    id: string;
    pricing_set_id: string;
    type: string;
    led_capacity: number;
    unit_cost_pence: number;
    created_at: string;
}

export interface OpalPrice {
    id: string;
    pricing_set_id: string;
    opal_type: string;
    sheet_size: string;
    unit_cost_pence: number;
    created_at: string;
}

export interface Consumable {
    id: string;
    pricing_set_id: string;
    key: string;
    value_pence: number;
    created_at: string;
}

export interface LetterUnitPrice {
    id: string;
    pricing_set_id: string;
    letter_type: string;
    finish: string;
    height_mm: number;
    unit_price_pence: number;
    created_at: string;
}

export interface LetterFinishRule {
    id: string;
    pricing_set_id: string;
    letter_type: string;
    allowed_finish: string;
    created_at: string;
}

export interface Quote {
    id: string;
    quote_number: string;
    customer_name: string | null;
    customer_email: string | null;
    customer_phone: string | null;
    status: QuoteStatus;
    pricing_set_id: string;
    notes_internal: string | null;
    notes_client: string | null;
    customer_reference: string | null;
    project_name: string | null;
    valid_until: string | null;
    created_at: string;
    created_by: string | null;
    updated_at: string;
}

export interface QuoteItem {
    id: string;
    quote_id: string;
    item_type: string;
    input_json: Record<string, unknown>;
    output_json: Record<string, unknown>;
    line_total_pence: number;
    created_at: string;
    created_by: string | null;
}

// =============================================================================
// RATE CARD NORMALISED TYPE
// =============================================================================

export interface TransformerSpec {
    ledCapacity: number;
    unitCostPence: number;
}

export interface RateCard {
    pricingSetId: string;
    pricingSetName: string;

    // Lookup maps for fast access
    panelPriceByMaterialAndSize: Map<string, number>;
    finishCostPerM2ByFinish: Map<string, number>;
    manufacturingRateByTask: Map<string, number>;
    ledsPerLetterByHeight: Map<number, number>;
    transformerByType: Map<string, TransformerSpec>;
    opalByTypeAndSheetSize: Map<string, number>;
    consumablesByKey: Map<string, number>;
    letterUnitPriceByTypeFinishHeight: Map<string, number>;
    finishRulesByType: Map<string, Set<string>>;
}

// =============================================================================
// ZOD SCHEMAS FOR ENGINE INPUT
// =============================================================================

// Override reason codes for audit trail
export const OVERRIDE_REASON_CODES = [
    'customer_discount',
    'rework',
    'material_variance',
    'labour_variance',
    'goodwill',
    'other',
] as const;

export type OverrideReasonCode = typeof OVERRIDE_REASON_CODES[number];

export const overrideSchema = z.object({
    reason_code: z.enum(OVERRIDE_REASON_CODES),
    note: z.string().min(1, 'Note is required for overrides'),
});

export const labourOverrideSchema = z.object({
    original: z.number().min(0),
    override: z.number().min(0),
    reason_code: z.enum(OVERRIDE_REASON_CODES),
    note: z.string().min(1),
});

export const overridesSchema = z.object({
    markup_percent: z.object({
        original: z.number().min(0).max(100),
        override: z.number().min(0).max(100),
        reason_code: z.enum(OVERRIDE_REASON_CODES),
        note: z.string().min(1),
    }).optional(),
    labour_hours: z.object({
        router: labourOverrideSchema.optional(),
        fabrication: labourOverrideSchema.optional(),
        assembly: labourOverrideSchema.optional(),
        vinyl: labourOverrideSchema.optional(),
        print: labourOverrideSchema.optional(),
    }).optional(),
});

export const letterSetInputSchema = z.object({
    type: z.enum(['Fabricated', 'Komacel', 'Acrylic']),
    qty: z.number().int().min(1),
    height_mm: z.number().int().min(50).max(1000),
    finish: z.string().min(1),
    illuminated: z.boolean(),
});

export const labourHoursSchema = z.object({
    router: z.number().min(0),
    fabrication: z.number().min(0),
    assembly: z.number().min(0),
    vinyl: z.number().min(0),
    print: z.number().min(0),
});

export const apertureInputSchema = z.object({
    width_mm: z.number().positive(),
    height_mm: z.number().positive(),
    opal_type: z.enum(['Opal (5mm)', 'Opal (10mm)']),
});

export const panelLettersV1InputSchema = z.object({
    width_mm: z.number().positive(),
    height_mm: z.number().positive(),
    allowance_mm: z.number(), // Can be negative for returns
    panel_size: z.enum(['2.4 x 1.2', '3 x 1.5']),
    panel_material: z.string().min(1),
    panel_finish: z.string().min(1),
    aperture: apertureInputSchema.optional(),
    letter_sets: z.array(letterSetInputSchema).min(1).max(3),
    labour_hours: labourHoursSchema,
    transformer_type: z.enum(['20W', '60W', '100W', '150W']),
    markup_percent: z.number().min(0).max(100),
    overrides: overridesSchema.optional(),
});

export type Override = z.infer<typeof overrideSchema>;
export type LabourOverride = z.infer<typeof labourOverrideSchema>;
export type Overrides = z.infer<typeof overridesSchema>;
export type LetterSetInput = z.infer<typeof letterSetInputSchema>;
export type LabourHours = z.infer<typeof labourHoursSchema>;
export type ApertureInput = z.infer<typeof apertureInputSchema>;
export type PanelLettersV1Input = z.infer<typeof panelLettersV1InputSchema>;

// =============================================================================
// ENGINE OUTPUT TYPE
// =============================================================================

export interface LetterSetBreakdown {
    type: string;
    qty: number;
    height_mm: number;
    finish: string;
    illuminated: boolean;
    unit_price_pence: number;
    base_cost_pence: number;
    leds_count: number;
    led_cost_pence: number;
    total_pence: number;
}

export interface PanelLettersV1Output {
    ok: boolean;
    errors: string[];
    warnings: string[];
    pricing_set_id: string;

    derived: {
        adjusted_width_mm: number;
        adjusted_height_mm: number;
        panels_x: number;
        panels_y: number;
        panels_needed: number;
        area_m2: number;
        aperture_leds: number;
        letters_total_leds: number;
        total_leds: number;
        transformers_needed: number;
    };

    costs: {
        panel_material_cost_pence: number;
        panel_finish_cost_pence: number;
        panel_overall_cost_pence: number;
        opal_cost_pence: number;
        aperture_led_cost_pence: number;
        aperture_total_cost_pence: number;
        transformer_cost_pence: number;
        letters_total_cost_pence: number;
        labour_cost_pence: number;
        materials_base_pence: number;
        materials_markup_pence: number;
        materials_total_pence: number;
    };

    letter_sets_breakdown: LetterSetBreakdown[];
    line_total_pence: number;
    overrides?: Overrides;
}

// =============================================================================
// ERROR TYPE
// =============================================================================

export class RateCardError extends Error {
    public readonly missingKeys: string[];

    constructor(message: string, missingKeys: string[] = []) {
        super(message);
        this.name = 'RateCardError';
        this.missingKeys = missingKeys;
    }
}
