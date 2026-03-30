/**
 * Panel Letters V1 Pricing Engine
 * 
 * Pure, deterministic pricing calculation for panel + letters signage.
 * No side effects, no IO - takes validated input and rate card, returns breakdown.
 */

import {
    PanelLettersV1Input,
    PanelLettersV1Output,
    LetterSetBreakdown,
    RateCard,
    LetterSetInput,
    panelLettersV1InputSchema,
} from '../types';

// =============================================================================
// VALIDATION
// =============================================================================

export interface ValidationResult {
    ok: boolean;
    errors: string[];
}

/**
 * Parse sheet size string to dimensions in mm.
 * Format: "2.4 x 1.2" -> { width: 2400, height: 1200 }
 */
function parseSheetSize(sheetSize: string): { width: number; height: number } | null {
    const match = sheetSize.match(/^(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)$/);
    if (!match) return null;
    return {
        width: parseFloat(match[1]) * 1000,
        height: parseFloat(match[2]) * 1000,
    };
}

/**
 * Validate input against rate card availability.
 * Returns structured errors instead of throwing.
 */
export function validatePanelLettersV1(
    input: PanelLettersV1Input,
    rateCard: RateCard
): ValidationResult {
    const errors: string[] = [];

    // Validate schema first
    const parseResult = panelLettersV1InputSchema.safeParse(input);
    if (!parseResult.success) {
        for (const issue of parseResult.error.issues) {
            errors.push(`${issue.path.join('.')}: ${issue.message}`);
        }
        return { ok: false, errors };
    }

    // Validate adjusted dimensions
    const adjustedWidth = input.width_mm - 2 * input.allowance_mm;
    const adjustedHeight = input.height_mm - 2 * input.allowance_mm;

    if (adjustedWidth <= 0) {
        errors.push(`Adjusted width is ${adjustedWidth}mm - must be positive after allowance`);
    }
    if (adjustedHeight <= 0) {
        errors.push(`Adjusted height is ${adjustedHeight}mm - must be positive after allowance`);
    }

    // Validate panel material + size exists
    const panelKey = `${input.panel_material}::${input.panel_size}`;
    if (!rateCard.panelPriceByMaterialAndSize.has(panelKey)) {
        errors.push(`Panel price not found for: ${input.panel_material} @ ${input.panel_size}`);
    }

    // Validate panel finish exists
    if (!rateCard.finishCostPerM2ByFinish.has(input.panel_finish)) {
        errors.push(`Panel finish not found: ${input.panel_finish}`);
    }

    // Validate transformer type exists
    if (!rateCard.transformerByType.has(input.transformer_type)) {
        errors.push(`Transformer type not found: ${input.transformer_type}`);
    }

    // Validate LED unit cost exists
    if (!rateCard.consumablesByKey.has('led_unit_cost')) {
        errors.push('Consumable not found: led_unit_cost');
    }

    // Validate aperture opal if present
    if (input.aperture) {
        // Find opal price - need to match opal_type with any sheet size
        let opalFound = false;
        for (const key of rateCard.opalByTypeAndSheetSize.keys()) {
            if (key.startsWith(`${input.aperture.opal_type}::`)) {
                opalFound = true;
                break;
            }
        }
        if (!opalFound) {
            errors.push(`Opal price not found for: ${input.aperture.opal_type}`);
        }
    }

    // Validate letter sets
    for (let i = 0; i < input.letter_sets.length; i++) {
        const set = input.letter_sets[i];

        // Validate finish allowed for type
        const allowedFinishes = rateCard.finishRulesByType.get(set.type);
        if (!allowedFinishes) {
            errors.push(`Letter set ${i + 1}: No finish rules found for type "${set.type}"`);
        } else if (!allowedFinishes.has(set.finish)) {
            errors.push(`Letter set ${i + 1}: Finish "${set.finish}" not allowed for type "${set.type}". Allowed: ${Array.from(allowedFinishes).join(', ')}`);
        }

        // Validate unit price exists
        const priceKey = `${set.type}::${set.finish}::${set.height_mm}`;
        if (!rateCard.letterUnitPriceByTypeFinishHeight.has(priceKey)) {
            errors.push(`Letter set ${i + 1}: Price not found for ${set.type} / ${set.finish} @ ${set.height_mm}mm`);
        }

        // Validate illumination profile if illuminated
        if (set.illuminated && !rateCard.ledsPerLetterByHeight.has(set.height_mm)) {
            errors.push(`Letter set ${i + 1}: Illumination profile not found for height ${set.height_mm}mm`);
        }
    }

    // Validate manufacturing rates
    const requiredTasks = ['router', 'fabrication', 'assembly', 'vinyl', 'print'] as const;
    for (const task of requiredTasks) {
        if (!rateCard.manufacturingRateByTask.has(task)) {
            errors.push(`Manufacturing rate not found: ${task}`);
        }
    }

    return { ok: errors.length === 0, errors };
}

// =============================================================================
// CALCULATION
// =============================================================================

/**
 * Calculate panel + letters quote with full breakdown.
 * Input must be pre-validated - this function assumes valid input.
 */
export function calculatePanelLettersV1(
    input: PanelLettersV1Input,
    rateCard: RateCard
): PanelLettersV1Output {
    // Run validation first
    const validation = validatePanelLettersV1(input, rateCard);
    if (!validation.ok) {
        return {
            ok: false,
            errors: validation.errors,
            warnings: [],
            pricing_set_id: rateCard.pricingSetId,
            derived: {
                adjusted_width_mm: 0,
                adjusted_height_mm: 0,
                panels_x: 0,
                panels_y: 0,
                panels_needed: 0,
                area_m2: 0,
                aperture_leds: 0,
                letters_total_leds: 0,
                total_leds: 0,
                transformers_needed: 0,
            },
            costs: {
                panel_material_cost_pence: 0,
                panel_finish_cost_pence: 0,
                panel_overall_cost_pence: 0,
                opal_cost_pence: 0,
                aperture_led_cost_pence: 0,
                aperture_total_cost_pence: 0,
                transformer_cost_pence: 0,
                letters_total_cost_pence: 0,
                labour_cost_pence: 0,
                materials_base_pence: 0,
                materials_markup_pence: 0,
                materials_total_pence: 0,
            },
            letter_sets_breakdown: [],
            line_total_pence: 0,
        };
    }

    const warnings: string[] = [];

    // -------------------------------------------------------------------------
    // DIMENSIONS AND PANEL COUNT
    // -------------------------------------------------------------------------

    const adjusted_width_mm = input.width_mm - 2 * input.allowance_mm;
    const adjusted_height_mm = input.height_mm - 2 * input.allowance_mm;

    // Parse panel sheet size
    const sheetDims = parseSheetSize(input.panel_size)!;

    const panels_x = Math.ceil(adjusted_width_mm / sheetDims.width);
    const panels_y = Math.ceil(adjusted_height_mm / sheetDims.height);
    const panels_needed = panels_x * panels_y;

    const area_m2 = (adjusted_width_mm / 1000) * (adjusted_height_mm / 1000);

    // -------------------------------------------------------------------------
    // PANEL COSTS
    // -------------------------------------------------------------------------

    const panelKey = `${input.panel_material}::${input.panel_size}`;
    const panel_sheet_unit_cost = rateCard.panelPriceByMaterialAndSize.get(panelKey)!;
    const panel_material_cost_pence = panels_needed * panel_sheet_unit_cost;

    const finish_cost_per_m2 = rateCard.finishCostPerM2ByFinish.get(input.panel_finish)!;
    const panel_finish_cost_pence = Math.round(area_m2 * finish_cost_per_m2);

    const panel_overall_cost_pence = panel_material_cost_pence + panel_finish_cost_pence;

    // -------------------------------------------------------------------------
    // APERTURE COSTS
    // -------------------------------------------------------------------------

    let aperture_leds = 0;
    let opal_cost_pence = 0;
    let aperture_led_cost_pence = 0;
    let aperture_total_cost_pence = 0;

    const led_unit_cost = rateCard.consumablesByKey.get('led_unit_cost')!;

    if (input.aperture) {
        // LED count for aperture: grid of LEDs at 200mm spacing
        aperture_leds = Math.ceil(input.aperture.width_mm / 200) * Math.ceil(input.aperture.height_mm / 200);

        // Find optimal opal sheet size (lowest total cost across available sizes)
        const aperture_area_m2 = (input.aperture.width_mm / 1000) * (input.aperture.height_mm / 1000);

        for (const [key, cost] of rateCard.opalByTypeAndSheetSize) {
            if (key.startsWith(`${input.aperture.opal_type}::`)) {
                const sheetSizeStr = key.split('::')[1];
                const dims = parseSheetSize(sheetSizeStr);
                if (!dims) continue;

                const opal_sheet_area_m2 = (dims.width / 1000) * (dims.height / 1000);
                const sheets_needed = Math.ceil(aperture_area_m2 / opal_sheet_area_m2);
                const total_cost = sheets_needed * cost;

                if (opal_cost_pence === 0 || total_cost < opal_cost_pence) {
                    opal_cost_pence = total_cost;
                }
            }
        }

        aperture_led_cost_pence = aperture_leds * led_unit_cost;
        aperture_total_cost_pence = opal_cost_pence + aperture_led_cost_pence;
    }

    // -------------------------------------------------------------------------
    // LETTER SET COSTS
    // -------------------------------------------------------------------------

    const letter_sets_breakdown: LetterSetBreakdown[] = [];
    let letters_total_cost_pence = 0;
    let letters_total_leds = 0;

    for (const set of input.letter_sets) {
        const priceKey = `${set.type}::${set.finish}::${set.height_mm}`;
        const unit_price_pence = rateCard.letterUnitPriceByTypeFinishHeight.get(priceKey)!;
        const base_cost_pence = set.qty * unit_price_pence;

        let leds_count = 0;
        let led_cost_pence = 0;

        if (set.illuminated) {
            const leds_per_letter = rateCard.ledsPerLetterByHeight.get(set.height_mm) || 0;
            leds_count = set.qty * leds_per_letter;
            led_cost_pence = leds_count * led_unit_cost;
        }

        const total_pence = base_cost_pence + led_cost_pence;

        letter_sets_breakdown.push({
            type: set.type,
            qty: set.qty,
            height_mm: set.height_mm,
            finish: set.finish,
            illuminated: set.illuminated,
            unit_price_pence,
            base_cost_pence,
            leds_count,
            led_cost_pence,
            total_pence,
        });

        letters_total_cost_pence += total_pence;
        letters_total_leds += leds_count;
    }

    // -------------------------------------------------------------------------
    // TRANSFORMER COSTS
    // -------------------------------------------------------------------------

    const total_leds = aperture_leds + letters_total_leds;

    const transformer = rateCard.transformerByType.get(input.transformer_type)!;
    const transformers_needed = total_leds > 0
        ? Math.ceil(total_leds / transformer.ledCapacity)
        : 0;
    const transformer_cost_pence = transformers_needed * transformer.unitCostPence;

    // Warn if transformer might be undersized
    if (total_leds > 0 && transformers_needed > 3) {
        warnings.push(`High transformer count (${transformers_needed}) - consider larger transformer type`);
    }

    // -------------------------------------------------------------------------
    // LABOUR COSTS
    // -------------------------------------------------------------------------

    const labourTasks = ['router', 'fabrication', 'assembly', 'vinyl', 'print'] as const;
    let labour_cost_pence = 0;

    for (const task of labourTasks) {
        // Apply override if present
        let hours = input.labour_hours[task];
        if (input.overrides?.labour_hours?.[task]) {
            hours = input.overrides.labour_hours[task]!.override;
        }

        const rate = rateCard.manufacturingRateByTask.get(task)!;
        labour_cost_pence += Math.round(hours * rate);
    }

    // -------------------------------------------------------------------------
    // MARKUP AND TOTALS
    // -------------------------------------------------------------------------

    // Apply markup override if present
    const effective_markup_percent = input.overrides?.markup_percent
        ? input.overrides.markup_percent.override
        : input.markup_percent;

    // Materials base = panel + aperture + transformers (NOT letters)
    const materials_base_pence = panel_overall_cost_pence + aperture_total_cost_pence + transformer_cost_pence;
    const materials_markup_pence = Math.round(materials_base_pence * (effective_markup_percent / 100));
    const materials_total_pence = materials_base_pence + materials_markup_pence;

    // Final line total
    const line_total_pence = materials_total_pence + letters_total_cost_pence + labour_cost_pence;

    return {
        ok: true,
        errors: [],
        warnings,
        pricing_set_id: rateCard.pricingSetId,
        overrides: input.overrides, // Persist overrides in output for audit
        derived: {
            adjusted_width_mm,
            adjusted_height_mm,
            panels_x,
            panels_y,
            panels_needed,
            area_m2,
            aperture_leds,
            letters_total_leds,
            total_leds,
            transformers_needed,
        },
        costs: {
            panel_material_cost_pence,
            panel_finish_cost_pence,
            panel_overall_cost_pence,
            opal_cost_pence,
            aperture_led_cost_pence,
            aperture_total_cost_pence,
            transformer_cost_pence,
            letters_total_cost_pence,
            labour_cost_pence,
            materials_base_pence,
            materials_markup_pence,
            materials_total_pence,
        },
        letter_sets_breakdown,
        line_total_pence,
    };
}

// =============================================================================
// RE-EXPORTS
// =============================================================================

export type { PanelLettersV1Input, PanelLettersV1Output } from '../types';
