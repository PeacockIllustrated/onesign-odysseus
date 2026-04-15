'use server';

/**
 * Quoter Server Actions
 *
 * Server-side mutations for quotes and quote items.
 * All actions enforce super-admin access via RLS + application-level auth.
 */

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { getRateCardForPricingSet } from './rate-card';
import { calculatePanelLettersV1 } from './engine/panel-letters-v1';
import { PanelLettersV1Input, Quote, QuoteItem, QuoteStatus, PanelLettersV1Output } from './types';
import { GenericQuoteItemInputSchema, GenericQuoteItemInput } from './types';

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Sanitise a search string for use in PostgREST .or() filters.
 * Strips commas and special PostgREST operators to prevent filter injection.
 */
function sanitiseSearch(raw: string): string {
    return raw.replace(/[,()]/g, '').trim();
}

/**
 * Valid status transitions map.
 * Key = current status, Value = array of allowed next statuses.
 */
const VALID_TRANSITIONS: Record<QuoteStatus, QuoteStatus[]> = {
    draft: ['sent'],
    sent: ['accepted', 'rejected', 'expired'],
    accepted: [],
    rejected: ['draft'],
    expired: ['draft'],
};

/**
 * Assert the quote is in draft status. Returns error string if not.
 */
async function assertQuoteDraft(
    supabase: any,
    quoteId: string
): Promise<{ pricing_set_id: string; status: string } | { error: string }> {
    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('pricing_set_id, status')
        .eq('id', quoteId)
        .single();

    if (quoteError || !quote) {
        return { error: 'Quote not found' };
    }

    if (quote.status !== 'draft') {
        return { error: `Cannot modify items on a quote with status: ${quote.status}` };
    }

    return quote;
}

// =============================================================================
// QUOTE ACTIONS
// =============================================================================

export interface CreateQuoteInput {
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    pricing_set_id: string;
    org_id?: string;
    contact_id?: string;
    site_id?: string;
}

export interface UpdateQuoteInput {
    id: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    notes_internal?: string;
    notes_client?: string;
    customer_reference?: string;
    project_name?: string;
    org_id?: string | null;
    contact_id?: string | null;
    site_id?: string | null;
}

export async function createQuoteAction(input: CreateQuoteInput): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'Not authenticated' };
    }

    const supabase = await createServerClient();

    // Calculate valid_until as 30 days from now
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    const { data, error } = await supabase
        .from('quotes')
        .insert({
            customer_name: input.customer_name || null,
            customer_email: input.customer_email || null,
            customer_phone: input.customer_phone || null,
            pricing_set_id: input.pricing_set_id,
            org_id: input.org_id || null,
            contact_id: input.contact_id || null,
            site_id: input.site_id || null,
            status: 'draft',
            created_by: user.id,
            valid_until: validUntil.toISOString().split('T')[0],
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating quote:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/quotes');
    return { id: data.id };
}

export async function updateQuoteAction(input: UpdateQuoteInput): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    // Get original for audit
    const { data: original } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', input.id)
        .single();

    // Build update payload — only include FK fields if explicitly provided
    const updatePayload: Record<string, unknown> = {
        customer_name: input.customer_name,
        customer_email: input.customer_email,
        customer_phone: input.customer_phone,
        notes_internal: input.notes_internal,
        notes_client: input.notes_client,
        customer_reference: input.customer_reference,
        project_name: input.project_name,
        // updated_at handled by DB trigger trg_quotes_updated_at
    };

    if (input.org_id !== undefined) updatePayload.org_id = input.org_id;
    if (input.contact_id !== undefined) updatePayload.contact_id = input.contact_id;
    if (input.site_id !== undefined) updatePayload.site_id = input.site_id;

    const { error } = await supabase
        .from('quotes')
        .update(updatePayload)
        .eq('id', input.id);

    if (error) {
        console.error('Error updating quote:', error);
        return { error: error.message };
    }

    // Log audit
    await logQuoteAudit(supabase, {
        quote_id: input.id,
        user_id: user.id,
        user_email: user.email!,
        action: 'update_quote',
        summary: 'Updated customer details',
        old_data: original,
        new_data: input,
    });

    revalidatePath(`/admin/quotes/${input.id}`);
    revalidatePath('/admin/quotes');
    return { success: true };
}

export async function updateQuoteStatusAction(
    quoteId: string,
    status: QuoteStatus
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    // Fetch current status for transition validation
    const { data: current, error: fetchError } = await supabase
        .from('quotes')
        .select('status')
        .eq('id', quoteId)
        .single();

    if (fetchError || !current) {
        return { error: 'Quote not found' };
    }

    const currentStatus = current.status as QuoteStatus;
    const allowed = VALID_TRANSITIONS[currentStatus] || [];

    if (!allowed.includes(status)) {
        return { error: `Cannot transition from "${currentStatus}" to "${status}". Allowed: ${allowed.length > 0 ? allowed.join(', ') : 'none (terminal state)'}` };
    }

    const { error } = await supabase
        .from('quotes')
        .update({ status })
        .eq('id', quoteId);

    if (error) {
        console.error('Error updating quote status:', error);
        return { error: error.message };
    }

    // Log audit
    await logQuoteAudit(supabase, {
        quote_id: quoteId,
        user_id: user.id,
        user_email: user.email!,
        action: 'status_change',
        summary: `Status changed from "${currentStatus}" to "${status}"`,
        old_data: { status: currentStatus },
        new_data: { status },
    });

    revalidatePath(`/admin/quotes/${quoteId}`);
    revalidatePath('/admin/quotes');
    return { success: true };
}

export async function deleteQuoteAction(quoteId: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('quotes')
        .delete()
        .eq('id', quoteId);

    if (error) {
        console.error('Error deleting quote:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/quotes');
    return { success: true };
}

// =============================================================================
// QUOTE ITEM ACTIONS
// =============================================================================

export interface RecalculateResult {
    ok: boolean;
    errors: string[];
    warnings: string[];
    line_total_pence: number;
    output: Record<string, unknown>;
}

/**
 * Recalculate panel letters v1 on the server.
 * Returns the full breakdown without persisting.
 */
export async function recalculatePanelLettersV1Action(
    pricingSetId: string,
    input: PanelLettersV1Input
): Promise<RecalculateResult> {
    try {
        const rateCard = await getRateCardForPricingSet(pricingSetId);
        const output = calculatePanelLettersV1(input, rateCard);

        return {
            ok: output.ok,
            errors: output.errors,
            warnings: output.warnings,
            line_total_pence: output.line_total_pence,
            output: output as unknown as Record<string, unknown>,
        };
    } catch (err) {
        console.error('Error recalculating:', err);
        return {
            ok: false,
            errors: [err instanceof Error ? err.message : 'Unknown error'],
            warnings: [],
            line_total_pence: 0,
            output: {},
        };
    }
}

/**
 * Add a panel letters v1 line item to a quote.
 * Recalculates server-side before persisting.
 * Only allowed on draft quotes.
 */
export async function addQuoteItemAction(
    quoteId: string,
    input: PanelLettersV1Input
): Promise<{ id: string } | { error: string; errors?: string[] }> {
    const user = await getUser();
    if (!user) {
        return { error: 'Not authenticated' };
    }

    const supabase = await createServerClient();

    // Check quote exists and is draft
    const quoteCheck = await assertQuoteDraft(supabase, quoteId);
    if ('error' in quoteCheck) return quoteCheck;

    // Recalculate server-side (never trust client calculation)
    const rateCard = await getRateCardForPricingSet(quoteCheck.pricing_set_id);
    const output = calculatePanelLettersV1(input, rateCard);

    if (!output.ok) {
        return { error: 'Validation failed', errors: output.errors };
    }

    // Insert the line item
    const { data, error } = await supabase
        .from('quote_items')
        .insert({
            quote_id: quoteId,
            item_type: 'panel_letters_v1',
            input_json: input,
            output_json: output,
            line_total_pence: output.line_total_pence,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error adding quote item:', error);
        return { error: error.message };
    }

    // Log audit
    await logQuoteAudit(supabase, {
        quote_id: quoteId,
        user_id: user.id,
        user_email: user.email!,
        action: 'add_item',
        summary: `Added item: Panel + Letters — £${(output.line_total_pence / 100).toFixed(2)}`,
        new_data: { input, output },
    });

    revalidatePath(`/admin/quotes/${quoteId}`);
    return { id: data.id };
}

/**
 * Update a panel letters v1 line item.
 * Only allowed on draft quotes.
 */
export async function updateQuoteItemAction(
    quoteId: string,
    itemId: string,
    input: PanelLettersV1Input
): Promise<{ success: boolean } | { error: string; errors?: string[] }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    // Check quote exists and is draft
    const quoteCheck = await assertQuoteDraft(supabase, quoteId);
    if ('error' in quoteCheck) return quoteCheck;

    // Get original for audit
    const { data: original } = await supabase
        .from('quote_items')
        .select('*')
        .eq('id', itemId)
        .single();

    // Recalculate server-side
    const rateCard = await getRateCardForPricingSet(quoteCheck.pricing_set_id);
    const output = calculatePanelLettersV1(input, rateCard);

    if (!output.ok) {
        return { error: 'Validation failed', errors: output.errors };
    }

    // Update the line item
    const { error } = await supabase
        .from('quote_items')
        .update({
            input_json: input,
            output_json: output,
            line_total_pence: output.line_total_pence,
        })
        .eq('id', itemId)
        .eq('quote_id', quoteId);

    if (error) {
        console.error('Error updating quote item:', error);
        return { error: error.message };
    }

    // Log audit
    await logQuoteAudit(supabase, {
        quote_id: quoteId,
        user_id: user.id,
        user_email: user.email!,
        action: 'update_item',
        summary: `Updated item: Recalculated total £${(output.line_total_pence / 100).toFixed(2)}`,
        old_data: original,
        new_data: { input, output },
    });

    revalidatePath(`/admin/quotes/${quoteId}`);
    return { success: true };
}

/**
 * Delete a quote item.
 * Only allowed on draft quotes.
 */
export async function deleteQuoteItemAction(
    quoteId: string,
    itemId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    // Check quote exists and is draft
    const quoteCheck = await assertQuoteDraft(supabase, quoteId);
    if ('error' in quoteCheck) return quoteCheck;

    // Get original for audit before deleting
    const { data: original } = await supabase
        .from('quote_items')
        .select('*')
        .eq('id', itemId)
        .eq('quote_id', quoteId)
        .single();

    const { error } = await supabase
        .from('quote_items')
        .delete()
        .eq('id', itemId)
        .eq('quote_id', quoteId);

    if (error) {
        console.error('Error deleting quote item:', error);
        return { error: error.message };
    }

    // Log audit
    if (original) {
        await logQuoteAudit(supabase, {
            quote_id: quoteId,
            user_id: user.id,
            user_email: user.email!,
            action: 'delete_item',
            summary: `Deleted item: £${(original.line_total_pence / 100).toFixed(2)}`,
            old_data: original,
        });
    }

    revalidatePath(`/admin/quotes/${quoteId}`);
    return { success: true };
}

// =============================================================================
// DATA FETCHING HELPERS (for use in server components)
// =============================================================================

export async function getQuotes(filters?: {
    status?: string;
    search?: string;
}): Promise<Quote[]> {
    const supabase = await createServerClient();

    let query = supabase
        .from('quotes')
        .select('*')
        .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters?.search) {
        const safe = sanitiseSearch(filters.search);
        if (safe) {
            query = query.or(`quote_number.ilike.%${safe}%,customer_name.ilike.%${safe}%`);
        }
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching quotes:', error);
        return [];
    }

    return data as Quote[];
}

export async function getQuoteWithItems(quoteId: string): Promise<{
    quote: Quote;
    items: QuoteItem[];
} | null> {
    const supabase = await createServerClient();

    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single();

    if (quoteError || !quote) {
        console.error('Error fetching quote:', quoteError);
        return null;
    }

    const { data: items, error: itemsError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

    if (itemsError) {
        console.error('Error fetching quote items:', itemsError);
        return null;
    }

    return {
        quote: quote as Quote,
        items: (items || []) as QuoteItem[],
    };
}

export async function getPricingSets(): Promise<Array<{ id: string; name: string; status: string }>> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('pricing_sets')
        .select('id, name, status')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching pricing sets:', error);
        return [];
    }

    return data || [];
}

// =============================================================================
// DUPLICATION ACTIONS
// =============================================================================

/**
 * Duplicate a quote (creates new quote header with new quote_number, copies all items).
 * Items are recalculated against the current rate card to ensure fresh pricing.
 */
export async function duplicateQuoteAction(
    quoteId: string
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'Not authenticated' };
    }

    const supabase = await createServerClient();

    // Get original quote
    const { data: original, error: fetchError } = await supabase
        .from('quotes')
        .select('*')
        .eq('id', quoteId)
        .single();

    if (fetchError || !original) {
        return { error: 'Quote not found' };
    }

    // Calculate new valid_until
    const validUntil = new Date();
    validUntil.setDate(validUntil.getDate() + 30);

    // Create new quote (quote_number generated by DB trigger)
    const { data: newQuote, error: createError } = await supabase
        .from('quotes')
        .insert({
            customer_name: original.customer_name,
            customer_email: original.customer_email,
            customer_phone: original.customer_phone,
            pricing_set_id: original.pricing_set_id,
            org_id: original.org_id || null,
            contact_id: original.contact_id || null,
            site_id: original.site_id || null,
            notes_internal: original.notes_internal ? `Copied from ${original.quote_number}: ${original.notes_internal}` : `Copied from ${original.quote_number}`,
            notes_client: original.notes_client,
            customer_reference: original.customer_reference,
            project_name: original.project_name,
            status: 'draft',
            created_by: user.id,
            valid_until: validUntil.toISOString().split('T')[0],
        })
        .select('id')
        .single();

    if (createError || !newQuote) {
        console.error('Error creating duplicate quote:', createError);
        return { error: createError?.message || 'Failed to create quote' };
    }

    // Copy all items — recalculate each against current rate card
    const { data: items } = await supabase
        .from('quote_items')
        .select('*')
        .eq('quote_id', quoteId);

    if (items && items.length > 0) {
        const rateCard = await getRateCardForPricingSet(original.pricing_set_id);

        const newItems = items.map(item => {
            // Recalculate to get fresh pricing
            const input = item.input_json as PanelLettersV1Input;
            const freshOutput = calculatePanelLettersV1(input, rateCard);

            return {
                quote_id: newQuote.id,
                item_type: item.item_type,
                input_json: item.input_json,
                output_json: freshOutput.ok ? freshOutput : item.output_json,
                line_total_pence: freshOutput.ok ? freshOutput.line_total_pence : item.line_total_pence,
                created_by: user.id,
            };
        });

        await supabase.from('quote_items').insert(newItems);
    }

    revalidatePath('/admin/quotes');
    return { id: newQuote.id };
}

/**
 * Duplicate a line item within the same quote.
 */
export async function duplicateQuoteItemAction(
    quoteId: string,
    itemId: string
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'Not authenticated' };
    }

    const supabase = await createServerClient();

    // Check quote is draft
    const quoteCheck = await assertQuoteDraft(supabase, quoteId);
    if ('error' in quoteCheck) return quoteCheck;

    // Get original item
    const { data: original, error: fetchError } = await supabase
        .from('quote_items')
        .select('*')
        .eq('id', itemId)
        .eq('quote_id', quoteId)
        .single();

    if (fetchError || !original) {
        return { error: 'Item not found' };
    }

    // Create duplicate
    const { data: newItem, error: createError } = await supabase
        .from('quote_items')
        .insert({
            quote_id: quoteId,
            item_type: original.item_type,
            input_json: original.input_json,
            output_json: original.output_json,
            line_total_pence: original.line_total_pence,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (createError || !newItem) {
        console.error('Error duplicating item:', createError);
        return { error: createError?.message || 'Failed to duplicate item' };
    }

    revalidatePath(`/admin/quotes/${quoteId}`);
    return { id: newItem.id };
}

// =============================================================================
// AUDIT HELPERS
// =============================================================================

async function logQuoteAudit(supabase: any, audit: {
    quote_id: string;
    user_id: string;
    user_email: string;
    action: string;
    summary: string;
    old_data?: any;
    new_data?: any;
}) {
    const { error } = await supabase
        .from('quote_audits')
        .insert(audit);

    if (error) {
        console.error('Error logging quote audit:', error);
    }
}

// =============================================================================
// GENERIC QUOTE ITEMS (migration 041)
// =============================================================================

/**
 * Compute line total for a generic item.
 *   base     = unit_price * quantity
 *   afterDisc= base * (1 - discount/100)
 *   total    = afterDisc * (1 + markup/100)
 * Returns integer pence, rounded.
 */
function calcGenericLineTotalPence(
    unitPricePence: number,
    quantity: number,
    discountPercent: number,
    markupPercent: number
): number {
    const base = unitPricePence * quantity;
    const afterDisc = base * (1 - discountPercent / 100);
    const total = afterDisc * (1 + markupPercent / 100);
    return Math.round(total);
}

/**
 * Add a generic (non-engine) quote line item. Manual pricing, free-form
 * description, optional sub-items for skeleton artwork generation.
 */
export async function addGenericQuoteItemAction(
    quoteId: string,
    input: GenericQuoteItemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = GenericQuoteItemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const quoteCheck = await assertQuoteDraft(supabase, quoteId);
    if ('error' in quoteCheck) return { error: quoteCheck.error };

    const qty = parsed.quantity ?? 1;
    const discount = parsed.discount_percent ?? 0;
    const markup = parsed.markup_percent ?? 0;
    const lineTotal = calcGenericLineTotalPence(
        parsed.unit_price_pence,
        qty,
        discount,
        markup
    );

    const itemType = parsed.is_production_work === false ? 'service' : 'generic';

    // Store sub_items + manual flags in input_json so the row reads cleanly
    // as a structured spec on acceptance / skeleton generation.
    const inputJson = {
        sub_items: parsed.sub_items ?? [],
        lighting: parsed.lighting ?? null,
        spec_notes: parsed.spec_notes ?? null,
        // Line-item dimensions — used by generateArtworkFromQuote to seed
        // the first sub-item if no explicit sub-items were provided.
        width_mm: parsed.width_mm ?? null,
        height_mm: parsed.height_mm ?? null,
        returns_mm: parsed.returns_mm ?? null,
    };

    const { data, error } = await supabase
        .from('quote_items')
        .insert({
            quote_id: quoteId,
            item_type: itemType,
            input_json: inputJson,
            output_json: {},
            line_total_pence: lineTotal,
            part_label: parsed.part_label,
            description: parsed.description ?? null,
            component_type: parsed.component_type ?? null,
            is_production_work: parsed.is_production_work ?? true,
            unit_cost_pence: parsed.unit_cost_pence ?? 0,
            quantity: qty,
            markup_percent: markup,
            discount_percent: discount,
            lighting: parsed.lighting ?? null,
            spec_notes: parsed.spec_notes ?? null,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        console.error('addGenericQuoteItemAction error:', error);
        return { error: error.message };
    }

    await logQuoteAudit(supabase, {
        quote_id: quoteId,
        user_id: user.id,
        user_email: user.email ?? '',
        action: 'add_generic_item',
        summary: `Added generic item: ${parsed.part_label}`,
        new_data: { part_label: parsed.part_label, line_total_pence: lineTotal, is_production_work: parsed.is_production_work ?? true },
    });

    revalidatePath(`/admin/quotes/${quoteId}`);
    return { id: data.id };
}
