/**
 * RateCard Loader
 * 
 * Server-side data access for pricing sets and rate cards.
 * Uses React cache() for request-level memoisation.
 */

import 'server-only';
import { cache } from 'react';
import { createServerClient } from '@/lib/supabase-server';
import {
    PricingSet,
    PanelPrice,
    PanelFinish,
    ManufacturingRate,
    IlluminationProfile,
    Transformer,
    OpalPrice,
    Consumable,
    LetterUnitPrice,
    LetterFinishRule,
    RateCard,
    RateCardError,
    TransformerSpec,
} from './types';

// =============================================================================
// PRICING SET LOADERS
// =============================================================================

/**
 * Get the currently active pricing set.
 * Throws RateCardError if no active pricing set exists.
 */
export const getActivePricingSet = cache(async (): Promise<PricingSet> => {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('pricing_sets')
        .select('*')
        .eq('status', 'active')
        .single();

    if (error || !data) {
        throw new RateCardError('No active pricing set found. Please activate a pricing set.');
    }

    return data as PricingSet;
});

/**
 * Get a pricing set by ID.
 * Throws RateCardError if not found.
 */
export const getPricingSetById = cache(async (pricingSetId: string): Promise<PricingSet> => {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('pricing_sets')
        .select('*')
        .eq('id', pricingSetId)
        .single();

    if (error || !data) {
        throw new RateCardError(`Pricing set not found: ${pricingSetId}`);
    }

    return data as PricingSet;
});

/**
 * Get the pricing set ID for a quote.
 */
export const getPricingSetIdForQuote = cache(async (quoteId: string): Promise<string> => {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('quotes')
        .select('pricing_set_id')
        .eq('id', quoteId)
        .single();

    if (error || !data) {
        throw new RateCardError(`Quote not found: ${quoteId}`);
    }

    return data.pricing_set_id;
});

// =============================================================================
// RATE CARD DATA LOADERS
// =============================================================================

async function loadPanelPrices(pricingSetId: string): Promise<PanelPrice[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('panel_prices')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load panel prices: ${error.message}`);
    return (data || []) as PanelPrice[];
}

async function loadPanelFinishes(pricingSetId: string): Promise<PanelFinish[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('panel_finishes')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load panel finishes: ${error.message}`);
    return (data || []) as PanelFinish[];
}

async function loadManufacturingRates(pricingSetId: string): Promise<ManufacturingRate[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('manufacturing_rates')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load manufacturing rates: ${error.message}`);
    return (data || []) as ManufacturingRate[];
}

async function loadIlluminationProfiles(pricingSetId: string): Promise<IlluminationProfile[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('illumination_profiles')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load illumination profiles: ${error.message}`);
    return (data || []) as IlluminationProfile[];
}

async function loadTransformers(pricingSetId: string): Promise<Transformer[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('transformers')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load transformers: ${error.message}`);
    return (data || []) as Transformer[];
}

async function loadOpalPrices(pricingSetId: string): Promise<OpalPrice[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('opal_prices')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load opal prices: ${error.message}`);
    return (data || []) as OpalPrice[];
}

async function loadConsumables(pricingSetId: string): Promise<Consumable[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('consumables')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load consumables: ${error.message}`);
    return (data || []) as Consumable[];
}

async function loadLetterPrices(pricingSetId: string): Promise<LetterUnitPrice[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('letter_price_table')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load letter prices: ${error.message}`);
    return (data || []) as LetterUnitPrice[];
}

async function loadLetterFinishRules(pricingSetId: string): Promise<LetterFinishRule[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('letter_finish_rules')
        .select('*')
        .eq('pricing_set_id', pricingSetId);

    if (error) throw new RateCardError(`Failed to load letter finish rules: ${error.message}`);
    return (data || []) as LetterFinishRule[];
}

// =============================================================================
// RATE CARD ASSEMBLY
// =============================================================================

/**
 * Build normalised RateCard from raw data.
 */
function assembleRateCard(
    pricingSet: PricingSet,
    panelPrices: PanelPrice[],
    panelFinishes: PanelFinish[],
    manufacturingRates: ManufacturingRate[],
    illuminationProfiles: IlluminationProfile[],
    transformers: Transformer[],
    opalPrices: OpalPrice[],
    consumables: Consumable[],
    letterPrices: LetterUnitPrice[],
    letterFinishRules: LetterFinishRule[]
): RateCard {
    // Panel prices: key = "material::sheet_size"
    const panelPriceByMaterialAndSize = new Map<string, number>();
    for (const p of panelPrices) {
        panelPriceByMaterialAndSize.set(`${p.material}::${p.sheet_size}`, p.unit_cost_pence);
    }

    // Finishes: key = finish name
    const finishCostPerM2ByFinish = new Map<string, number>();
    for (const f of panelFinishes) {
        finishCostPerM2ByFinish.set(f.finish, f.cost_per_m2_pence);
    }

    // Manufacturing rates: key = task name
    const manufacturingRateByTask = new Map<string, number>();
    for (const m of manufacturingRates) {
        manufacturingRateByTask.set(m.task, m.cost_per_hour_pence);
    }

    // Illumination profiles: key = height_mm
    const ledsPerLetterByHeight = new Map<number, number>();
    for (const i of illuminationProfiles) {
        ledsPerLetterByHeight.set(i.height_mm, i.leds_per_letter);
    }

    // Transformers: key = type
    const transformerByType = new Map<string, TransformerSpec>();
    for (const t of transformers) {
        transformerByType.set(t.type, {
            ledCapacity: t.led_capacity,
            unitCostPence: t.unit_cost_pence,
        });
    }

    // Opal prices: key = "opal_type::sheet_size"
    const opalByTypeAndSheetSize = new Map<string, number>();
    for (const o of opalPrices) {
        opalByTypeAndSheetSize.set(`${o.opal_type}::${o.sheet_size}`, o.unit_cost_pence);
    }

    // Consumables: key = key name
    const consumablesByKey = new Map<string, number>();
    for (const c of consumables) {
        consumablesByKey.set(c.key, c.value_pence);
    }

    // Letter prices: key = "type::finish::height_mm"
    const letterUnitPriceByTypeFinishHeight = new Map<string, number>();
    for (const l of letterPrices) {
        letterUnitPriceByTypeFinishHeight.set(
            `${l.letter_type}::${l.finish}::${l.height_mm}`,
            l.unit_price_pence
        );
    }

    // Finish rules: key = letter_type, value = Set of allowed finishes
    const finishRulesByType = new Map<string, Set<string>>();
    for (const r of letterFinishRules) {
        if (!finishRulesByType.has(r.letter_type)) {
            finishRulesByType.set(r.letter_type, new Set<string>());
        }
        finishRulesByType.get(r.letter_type)!.add(r.allowed_finish);
    }

    return {
        pricingSetId: pricingSet.id,
        pricingSetName: pricingSet.name,
        panelPriceByMaterialAndSize,
        finishCostPerM2ByFinish,
        manufacturingRateByTask,
        ledsPerLetterByHeight,
        transformerByType,
        opalByTypeAndSheetSize,
        consumablesByKey,
        letterUnitPriceByTypeFinishHeight,
        finishRulesByType,
    };
}

// =============================================================================
// RATE CARD COMPLETENESS VALIDATION
// =============================================================================

/**
 * Check that rate card has all required keys.
 * Throws RateCardError with list of missing keys.
 */
export function assertRateCardComplete(rateCard: RateCard): void {
    const missingKeys: string[] = [];

    // Required consumables
    if (!rateCard.consumablesByKey.has('led_unit_cost')) {
        missingKeys.push('consumables.led_unit_cost');
    }

    // Required transformer types
    const requiredTransformers = ['20W', '60W', '100W', '150W'];
    for (const t of requiredTransformers) {
        if (!rateCard.transformerByType.has(t)) {
            missingKeys.push(`transformers.${t}`);
        }
    }

    // Required manufacturing tasks
    const requiredTasks = ['router', 'fabrication', 'assembly', 'vinyl', 'print'];
    for (const task of requiredTasks) {
        if (!rateCard.manufacturingRateByTask.has(task)) {
            missingKeys.push(`manufacturing_rates.${task}`);
        }
    }

    if (missingKeys.length > 0) {
        throw new RateCardError(
            `Rate card incomplete. Missing: ${missingKeys.join(', ')}`,
            missingKeys
        );
    }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Load rate card for a specific pricing set.
 * Fetches all rate card tables and assembles normalised lookup maps.
 */
export const getRateCardForPricingSet = cache(async (pricingSetId: string): Promise<RateCard> => {
    const pricingSet = await getPricingSetById(pricingSetId);

    // Parallel fetch all rate card data
    const [
        panelPrices,
        panelFinishes,
        manufacturingRates,
        illuminationProfiles,
        transformers,
        opalPrices,
        consumables,
        letterPrices,
        letterFinishRules,
    ] = await Promise.all([
        loadPanelPrices(pricingSetId),
        loadPanelFinishes(pricingSetId),
        loadManufacturingRates(pricingSetId),
        loadIlluminationProfiles(pricingSetId),
        loadTransformers(pricingSetId),
        loadOpalPrices(pricingSetId),
        loadConsumables(pricingSetId),
        loadLetterPrices(pricingSetId),
        loadLetterFinishRules(pricingSetId),
    ]);

    return assembleRateCard(
        pricingSet,
        panelPrices,
        panelFinishes,
        manufacturingRates,
        illuminationProfiles,
        transformers,
        opalPrices,
        consumables,
        letterPrices,
        letterFinishRules
    );
});

/**
 * Load rate card for the currently active pricing set.
 */
export async function getActiveRateCard(): Promise<RateCard> {
    const activePricingSet = await getActivePricingSet();
    return getRateCardForPricingSet(activePricingSet.id);
}

/**
 * Load rate card locked to a specific quote.
 * Uses the pricing_set_id stored on the quote.
 */
export async function getRateCardForQuote(quoteId: string): Promise<RateCard> {
    const pricingSetId = await getPricingSetIdForQuote(quoteId);
    return getRateCardForPricingSet(pricingSetId);
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

export { RateCardError };
