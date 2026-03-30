'use server';

/**
 * Pricing Server Actions
 * 
 * Server-side mutations for pricing sets and rate cards.
 * All actions enforce super-admin access via RLS.
 */

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { getRateCardForPricingSet, assertRateCardComplete, RateCardError } from './rate-card';

// =============================================================================
// TYPES
// =============================================================================

export interface CompletenessResult {
    ok: boolean;
    missing: string[];
    warnings: string[];
}

type RateCardTable =
    | 'panel_prices'
    | 'panel_finishes'
    | 'manufacturing_rates'
    | 'illumination_profiles'
    | 'transformers'
    | 'opal_prices'
    | 'consumables'
    | 'letter_finish_rules'
    | 'letter_price_table';

// =============================================================================
// COMPLETENESS CHECKING
// =============================================================================

const REQUIRED_HEIGHTS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500, 600, 700, 800, 900, 1000];
const REQUIRED_TRANSFORMER_TYPES = ['20W', '60W', '100W', '150W'];
const REQUIRED_OPAL_TYPES = ['Opal (5mm)', 'Opal (10mm)'];
const REQUIRED_LETTER_TYPES = ['Fabricated', 'Komacel', 'Acrylic'];

export async function checkPricingSetCompletenessAction(
    pricingSetId: string
): Promise<CompletenessResult> {
    const missing: string[] = [];
    const warnings: string[] = [];

    try {
        const rateCard = await getRateCardForPricingSet(pricingSetId);

        // Use existing rate card completeness check
        try {
            assertRateCardComplete(rateCard);
        } catch (err) {
            if (err instanceof RateCardError) {
                missing.push(...err.missingKeys);
            }
        }

        // Check illumination profiles cover all heights
        const missingHeights: number[] = [];
        for (const height of REQUIRED_HEIGHTS) {
            if (!rateCard.ledsPerLetterByHeight.has(height)) {
                missingHeights.push(height);
            }
        }
        if (missingHeights.length > 0) {
            missing.push(`illumination_profiles missing heights: ${missingHeights.join(', ')}mm`);
        }

        // Check opal prices
        for (const opalType of REQUIRED_OPAL_TYPES) {
            let found = false;
            for (const key of rateCard.opalByTypeAndSheetSize.keys()) {
                if (key.startsWith(`${opalType}::`)) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                missing.push(`opal_prices missing: ${opalType}`);
            }
        }

        // Check letter finish rules for each type
        for (const letterType of REQUIRED_LETTER_TYPES) {
            if (!rateCard.finishRulesByType.has(letterType)) {
                missing.push(`letter_finish_rules missing for: ${letterType}`);
            } else {
                const finishes = rateCard.finishRulesByType.get(letterType)!;
                if (finishes.size === 0) {
                    missing.push(`letter_finish_rules has no finishes for: ${letterType}`);
                }
            }
        }

        // Check letter price table coverage
        let letterPriceCount = 0;
        for (const letterType of REQUIRED_LETTER_TYPES) {
            const allowedFinishes = rateCard.finishRulesByType.get(letterType);
            if (allowedFinishes) {
                for (const finish of allowedFinishes) {
                    for (const height of REQUIRED_HEIGHTS) {
                        const key = `${letterType}::${finish}::${height}`;
                        if (rateCard.letterUnitPriceByTypeFinishHeight.has(key)) {
                            letterPriceCount++;
                        }
                    }
                }
            }
        }
        if (letterPriceCount === 0) {
            missing.push('letter_price_table has no entries');
        } else if (letterPriceCount < 10) {
            warnings.push(`letter_price_table has only ${letterPriceCount} entries (may be incomplete)`);
        }

        // Check panel prices
        if (rateCard.panelPriceByMaterialAndSize.size === 0) {
            missing.push('panel_prices has no entries');
        } else {
            // Check for both panel sizes
            const sizes = new Set<string>();
            for (const key of rateCard.panelPriceByMaterialAndSize.keys()) {
                const size = key.split('::')[1];
                sizes.add(size);
            }
            if (!sizes.has('2.4 x 1.2')) {
                warnings.push('panel_prices missing size: 2.4 x 1.2');
            }
            if (!sizes.has('3 x 1.5')) {
                warnings.push('panel_prices missing size: 3 x 1.5');
            }
        }

        // Check panel finishes
        if (rateCard.finishCostPerM2ByFinish.size === 0) {
            missing.push('panel_finishes has no entries');
        }

        return {
            ok: missing.length === 0,
            missing,
            warnings,
        };
    } catch (err) {
        return {
            ok: false,
            missing: [err instanceof Error ? err.message : 'Failed to load rate card'],
            warnings: [],
        };
    }
}

// =============================================================================
// PRICING SET ACTIONS
// =============================================================================

export async function createDraftPricingSetFromActiveAction(
    name: string
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'Not authenticated' };
    }

    const supabase = await createServerClient();

    // Get the active pricing set
    const { data: activeSet } = await supabase
        .from('pricing_sets')
        .select('id')
        .eq('status', 'active')
        .single();

    // Create new draft pricing set
    const { data: newSet, error: createError } = await supabase
        .from('pricing_sets')
        .insert({
            name,
            status: 'draft',
            created_by: user.id,
        })
        .select('id')
        .single();

    if (createError || !newSet) {
        console.error('Error creating pricing set:', createError);
        return { error: createError?.message || 'Failed to create pricing set' };
    }

    // If there's an active set, copy all rate card data
    if (activeSet) {
        const tables: RateCardTable[] = [
            'panel_prices',
            'panel_finishes',
            'manufacturing_rates',
            'illumination_profiles',
            'transformers',
            'opal_prices',
            'consumables',
            'letter_finish_rules',
            'letter_price_table',
        ];

        for (const table of tables) {
            // Fetch existing rows
            const { data: rows } = await supabase
                .from(table)
                .select('*')
                .eq('pricing_set_id', activeSet.id);

            if (rows && rows.length > 0) {
                // Insert copies with new pricing_set_id
                const newRows = rows.map(row => {
                    const { id, pricing_set_id, created_at, ...rest } = row;
                    return { ...rest, pricing_set_id: newSet.id };
                });

                await supabase.from(table).insert(newRows);
            }
        }
    }

    revalidatePath('/app/admin/pricing');
    return { id: newSet.id };
}

export async function updatePricingSetAction(
    pricingSetId: string,
    updates: { name?: string; effective_from?: string | null }
): Promise<{ success: boolean } | { error: string }> {
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('pricing_sets')
        .update(updates)
        .eq('id', pricingSetId);

    if (error) {
        console.error('Error updating pricing set:', error);
        return { error: error.message };
    }

    revalidatePath('/app/admin/pricing');
    revalidatePath(`/app/admin/pricing/${pricingSetId}`);
    return { success: true };
}

export async function deletePricingSetAction(
    pricingSetId: string
): Promise<{ success: boolean } | { error: string }> {
    const supabase = await createServerClient();

    // Only allow deleting draft sets
    const { data: set } = await supabase
        .from('pricing_sets')
        .select('status')
        .eq('id', pricingSetId)
        .single();

    if (!set || set.status !== 'draft') {
        return { error: 'Can only delete draft pricing sets' };
    }

    const { error } = await supabase
        .from('pricing_sets')
        .delete()
        .eq('id', pricingSetId);

    if (error) {
        console.error('Error deleting pricing set:', error);
        return { error: error.message };
    }

    revalidatePath('/app/admin/pricing');
    return { success: true };
}

// =============================================================================
// ACTIVATION
// =============================================================================

export async function activatePricingSetAction(
    pricingSetId: string
): Promise<{ success: boolean } | { error: string }> {
    const supabase = await createServerClient();

    // Check completeness first
    const completeness = await checkPricingSetCompletenessAction(pricingSetId);
    if (!completeness.ok) {
        return { error: `Cannot activate: ${completeness.missing.join(', ')}` };
    }

    // Get current active set (if any)
    const { data: currentActive } = await supabase
        .from('pricing_sets')
        .select('id')
        .eq('status', 'active')
        .single();

    // Archive current active
    if (currentActive) {
        const { error: archiveError } = await supabase
            .from('pricing_sets')
            .update({ status: 'archived' })
            .eq('id', currentActive.id);

        if (archiveError) {
            console.error('Error archiving current active:', archiveError);
            return { error: 'Failed to archive current active pricing set' };
        }
    }

    // Activate new set
    const { error: activateError } = await supabase
        .from('pricing_sets')
        .update({
            status: 'active',
            effective_from: new Date().toISOString(),
        })
        .eq('id', pricingSetId);

    if (activateError) {
        console.error('Error activating pricing set:', activateError);
        // Try to revert archive if activation failed
        if (currentActive) {
            await supabase
                .from('pricing_sets')
                .update({ status: 'active' })
                .eq('id', currentActive.id);
        }
        return { error: 'Failed to activate pricing set' };
    }

    revalidatePath('/app/admin/pricing');
    revalidatePath(`/app/admin/pricing/${pricingSetId}`);
    return { success: true };
}

// =============================================================================
// RATE CARD ROW ACTIONS
// =============================================================================

interface RateCardRowData {
    [key: string]: string | number | boolean | null;
}

export async function addRateCardRowAction(
    table: RateCardTable,
    pricingSetId: string,
    data: RateCardRowData
): Promise<{ id: string } | { error: string }> {
    const supabase = await createServerClient();

    const { data: row, error } = await supabase
        .from(table)
        .insert({ ...data, pricing_set_id: pricingSetId })
        .select('id')
        .single();

    if (error) {
        console.error(`Error adding ${table} row:`, error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/pricing/${pricingSetId}`);
    return { id: row.id };
}

export async function updateRateCardRowAction(
    table: RateCardTable,
    rowId: string,
    pricingSetId: string,
    data: RateCardRowData
): Promise<{ success: boolean } | { error: string }> {
    const supabase = await createServerClient();

    const { error } = await supabase
        .from(table)
        .update(data)
        .eq('id', rowId)
        .eq('pricing_set_id', pricingSetId);

    if (error) {
        console.error(`Error updating ${table} row:`, error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/pricing/${pricingSetId}`);
    return { success: true };
}

export async function deleteRateCardRowAction(
    table: RateCardTable,
    rowId: string,
    pricingSetId: string
): Promise<{ success: boolean } | { error: string }> {
    const supabase = await createServerClient();

    const { error } = await supabase
        .from(table)
        .delete()
        .eq('id', rowId)
        .eq('pricing_set_id', pricingSetId);

    if (error) {
        console.error(`Error deleting ${table} row:`, error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/pricing/${pricingSetId}`);
    return { success: true };
}

// =============================================================================
// DATA FETCHING
// =============================================================================

export async function getPricingSets(): Promise<Array<{
    id: string;
    name: string;
    status: string;
    effective_from: string | null;
    created_at: string;
}>> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('pricing_sets')
        .select('id, name, status, effective_from, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching pricing sets:', error);
        return [];
    }

    return data || [];
}

export async function getPricingSetWithRateCards(pricingSetId: string) {
    const supabase = await createServerClient();

    const { data: pricingSet, error: psError } = await supabase
        .from('pricing_sets')
        .select('*')
        .eq('id', pricingSetId)
        .single();

    if (psError || !pricingSet) {
        return null;
    }

    // Fetch all rate card tables
    const [
        panelPrices,
        panelFinishes,
        manufacturingRates,
        illuminationProfiles,
        transformers,
        opalPrices,
        consumables,
        letterFinishRules,
        letterPriceTable,
    ] = await Promise.all([
        supabase.from('panel_prices').select('*').eq('pricing_set_id', pricingSetId).order('material'),
        supabase.from('panel_finishes').select('*').eq('pricing_set_id', pricingSetId).order('finish'),
        supabase.from('manufacturing_rates').select('*').eq('pricing_set_id', pricingSetId).order('task'),
        supabase.from('illumination_profiles').select('*').eq('pricing_set_id', pricingSetId).order('height_mm'),
        supabase.from('transformers').select('*').eq('pricing_set_id', pricingSetId).order('type'),
        supabase.from('opal_prices').select('*').eq('pricing_set_id', pricingSetId).order('opal_type'),
        supabase.from('consumables').select('*').eq('pricing_set_id', pricingSetId).order('key'),
        supabase.from('letter_finish_rules').select('*').eq('pricing_set_id', pricingSetId).order('letter_type'),
        supabase.from('letter_price_table').select('*').eq('pricing_set_id', pricingSetId).order('letter_type').order('height_mm'),
    ]);

    return {
        pricingSet,
        rateCards: {
            panelPrices: panelPrices.data || [],
            panelFinishes: panelFinishes.data || [],
            manufacturingRates: manufacturingRates.data || [],
            illuminationProfiles: illuminationProfiles.data || [],
            transformers: transformers.data || [],
            opalPrices: opalPrices.data || [],
            consumables: consumables.data || [],
            letterFinishRules: letterFinishRules.data || [],
            letterPriceTable: letterPriceTable.data || [],
        },
    };
}
