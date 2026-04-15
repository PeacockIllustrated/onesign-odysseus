'use server';

import { createServerClient } from '@/lib/supabase-server';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { calcLineTotal, calcSubtotal, calcVat, canTransitionTo } from './utils';
import { getInvoices, getInvoiceWithItems } from './queries';
import type {
    CreateInvoiceInput,
    UpdateInvoiceInput,
    CreateInvoiceItemInput,
    UpdateInvoiceItemInput,
    InvoiceStatus,
    Invoice,
    InvoiceWithItems,
} from './types';
import {
    CreateInvoiceInputSchema,
    UpdateInvoiceInputSchema,
    CreateInvoiceItemInputSchema,
    UpdateInvoiceItemInputSchema,
} from './types';

// ---------------------------------------------------------------------------
// Thin wrappers for client components
// ---------------------------------------------------------------------------

export async function getInvoiceListAction(filters?: {
    status?: string;
    search?: string;
}): Promise<Invoice[]> {
    return getInvoices(filters);
}

export async function getInvoiceWithItemsAction(
    invoiceId: string
): Promise<InvoiceWithItems | null> {
    return getInvoiceWithItems(invoiceId);
}

// ---------------------------------------------------------------------------
// Private helper — recalculate invoice totals from current items
// ---------------------------------------------------------------------------

async function recalcInvoiceTotals(supabase: any, invoiceId: string): Promise<void> {
    const { data: items } = await supabase
        .from('invoice_items')
        .select('line_total_pence')
        .eq('invoice_id', invoiceId);

    const { data: inv } = await supabase
        .from('invoices')
        .select('vat_rate')
        .eq('id', invoiceId)
        .single();

    const subtotal = calcSubtotal(items || []);
    const vatPence = calcVat(subtotal, inv?.vat_rate ?? 20);

    await supabase
        .from('invoices')
        .update({
            subtotal_pence: subtotal,
            vat_pence: vatPence,
            total_pence: subtotal + vatPence,
        })
        .eq('id', invoiceId);
}

// ---------------------------------------------------------------------------
// Quotes available for invoicing
// ---------------------------------------------------------------------------

export async function getQuotesAvailableForInvoicing(): Promise<
    Array<{
        id: string;
        quote_number: string;
        customer_name: string | null;
        total_pence: number;
        org_id: string | null;
    }>
> {
    const supabase = await createServerClient();

    // Fetch all accepted quotes
    const { data: quotes, error: quotesError } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_name, org_id')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

    if (quotesError || !quotes || quotes.length === 0) return [];

    // Fetch all non-cancelled invoices to exclude quotes that already have one
    const { data: invoices } = await supabase
        .from('invoices')
        .select('quote_id')
        .neq('status', 'cancelled');

    const invoicedQuoteIds = new Set((invoices || []).map((i: any) => i.quote_id));

    const available = quotes.filter((q: any) => !invoicedQuoteIds.has(q.id));

    // For each available quote, compute the total from quote_items
    const result: Array<{
        id: string;
        quote_number: string;
        customer_name: string | null;
        total_pence: number;
        org_id: string | null;
    }> = [];

    for (const q of available) {
        const { data: items } = await supabase
            .from('quote_items')
            .select('line_total_pence')
            .eq('quote_id', q.id);
        const total = (items || []).reduce(
            (sum: number, item: any) => sum + (item.line_total_pence || 0),
            0
        );
        result.push({
            id: q.id,
            quote_number: q.quote_number,
            customer_name: q.customer_name,
            total_pence: total,
            org_id: q.org_id ?? null,
        });
    }

    return result;
}

// ---------------------------------------------------------------------------
// Core actions
// ---------------------------------------------------------------------------

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export async function createInvoiceFromQuote(
    input: CreateInvoiceInput
): Promise<{ id: string; invoiceNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = CreateInvoiceInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const { quote_id: quoteId, org_id: orgId } = validation.data;

    const supabase = await createServerClient();

    // 1. Fetch quote and verify status
    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select(
            'id, quote_number, status, customer_name, customer_email, customer_phone, customer_reference, project_name, org_id'
        )
        .eq('id', quoteId)
        .single();

    if (quoteError || !quote) return { error: 'Quote not found' };
    if (quote.status !== 'accepted') return { error: 'Quote must be accepted before invoicing' };

    // 2. Check for existing non-cancelled invoice for this quote
    const { data: existing } = await supabase
        .from('invoices')
        .select('id')
        .eq('quote_id', quoteId)
        .neq('status', 'cancelled')
        .maybeSingle();

    if (existing) return { error: 'An invoice already exists for this quote' };

    // 3. Fetch quote items
    const { data: quoteItems, error: itemsError } = await supabase
        .from('quote_items')
        .select('id, item_type, output_json, line_total_pence')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

    if (itemsError || !quoteItems || quoteItems.length === 0) {
        return { error: 'No quote items found' };
    }

    // 4. Lookup production job (optional)
    const { data: jobRow } = await supabase
        .from('production_jobs')
        .select('id')
        .eq('quote_id', quoteId)
        .limit(1)
        .maybeSingle();

    const productionJobId: string | null = jobRow?.id ?? null;

    // 4b. Lookup billing contact and billing site for the org
    let billingContactId: string | null = null;
    let billingSiteId: string | null = null;

    if (quote.org_id) {
        // Look for billing contact, fall back to primary
        const { data: billingContact } = await supabase
            .from('contacts')
            .select('id')
            .eq('org_id', quote.org_id)
            .or('contact_type.eq.billing,is_primary.eq.true')
            .order('contact_type', { ascending: true }) // 'billing' sorts before 'primary'
            .limit(1)
            .maybeSingle();
        billingContactId = billingContact?.id || null;

        // Look for billing site, fall back to primary
        const { data: billingSite } = await supabase
            .from('org_sites')
            .select('id')
            .eq('org_id', quote.org_id)
            .or('is_billing_address.eq.true,is_primary.eq.true')
            .order('is_billing_address', { ascending: false })
            .limit(1)
            .maybeSingle();
        billingSiteId = billingSite?.id || null;
    }

    // 5. Derive invoice items from quote items
    const invoiceItems = quoteItems.map((item: any, index: number) => {
        const label = LETTERS[index] ?? `${index + 1}`;
        const itemType =
            item.item_type === 'panel_letters_v1'
                ? 'Panel + Letters'
                : item.item_type || 'Item';
        return {
            quote_item_id: item.id,
            description: `${label}: ${itemType}`,
            quantity: 1,
            unit_price_pence: item.line_total_pence,
            line_total_pence: item.line_total_pence,
            sort_order: index,
        };
    });

    // 6. Calculate totals
    const subtotal = calcSubtotal(invoiceItems);
    const vatPence = calcVat(subtotal, 20);
    const totalPence = subtotal + vatPence;

    // 7. Compute dates
    const invoiceDate = new Date().toISOString().split('T')[0];
    const dueDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];

    // 8. Insert invoice
    const { data: newInvoice, error: insertError } = await supabase
        .from('invoices')
        .insert({
            org_id: orgId,
            quote_id: quoteId,
            production_job_id: productionJobId,
            billing_contact_id: billingContactId,
            billing_site_id: billingSiteId,
            customer_name: quote.customer_name ?? '',
            customer_email: quote.customer_email ?? null,
            customer_phone: quote.customer_phone ?? null,
            customer_reference: quote.customer_reference ?? null,
            project_name: quote.project_name ?? null,
            status: 'draft',
            invoice_date: invoiceDate,
            due_date: dueDate,
            payment_terms_days: 30,
            subtotal_pence: subtotal,
            vat_rate: 20,
            vat_pence: vatPence,
            total_pence: totalPence,
            created_by: user.id,
        })
        .select('id, invoice_number')
        .single();

    if (insertError || !newInvoice) {
        console.error('Error creating invoice:', insertError);
        return { error: insertError?.message ?? 'Failed to create invoice' };
    }

    // 9. Insert invoice items
    const itemsToInsert = invoiceItems.map((item) => ({
        invoice_id: newInvoice.id,
        ...item,
    }));

    const { error: itemsInsertError } = await supabase
        .from('invoice_items')
        .insert(itemsToInsert);

    if (itemsInsertError) {
        console.error('Error inserting invoice items:', itemsInsertError);
        // Clean up the invoice if items fail
        await supabase.from('invoices').delete().eq('id', newInvoice.id);
        return { error: itemsInsertError.message };
    }

    // 10. Revalidate paths
    revalidatePath('/admin/invoices');
    revalidatePath(`/admin/quotes/${quoteId}`);

    return { id: newInvoice.id, invoiceNumber: newInvoice.invoice_number };
}

export async function updateInvoiceAction(
    input: UpdateInvoiceInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = UpdateInvoiceInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: current, error: fetchError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', parsed.id)
        .single();

    if (fetchError || !current) return { error: 'Invoice not found' };
    if (current.status !== 'draft') return { error: 'Only draft invoices can be edited' };

    const { id, ...fields } = parsed;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase.from('invoices').update(updates).eq('id', id);

    if (error) {
        console.error('Error updating invoice:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/invoices/${id}`);
    revalidatePath('/admin/invoices');
    return { success: true };
}

export async function updateInvoiceStatusAction(
    invoiceId: string,
    newStatus: InvoiceStatus
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const supabase = await createServerClient();

    const { data: current, error: fetchError } = await supabase
        .from('invoices')
        .select('status, invoice_date, due_date, payment_terms_days')
        .eq('id', invoiceId)
        .single();

    if (fetchError || !current) return { error: 'Invoice not found' };

    if (!canTransitionTo(current.status as InvoiceStatus, newStatus)) {
        return {
            error: `Cannot transition from "${current.status}" to "${newStatus}"`,
        };
    }

    // Auto-set due_date when transitioning to sent if not already set
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === 'sent' && !current.due_date) {
        const baseDate = current.invoice_date
            ? new Date(current.invoice_date)
            : new Date();
        const termsDays = current.payment_terms_days ?? 30;
        const dueDate = new Date(
            baseDate.getTime() + termsDays * 24 * 60 * 60 * 1000
        );
        updates.due_date = dueDate.toISOString().split('T')[0];
    }

    const { error } = await supabase
        .from('invoices')
        .update(updates)
        .eq('id', invoiceId);

    if (error) {
        console.error('Error updating invoice status:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/invoices/${invoiceId}`);
    revalidatePath('/admin/invoices');
    return { success: true };
}

export async function addInvoiceItemAction(
    input: CreateInvoiceItemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = CreateInvoiceItemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', parsed.invoice_id)
        .single();

    if (invError || !inv) return { error: 'Invoice not found' };
    if (inv.status !== 'draft') return { error: 'Only draft invoices can be edited' };

    const lineTotal = calcLineTotal(parsed.quantity, parsed.unit_price_pence);

    const { data, error } = await supabase
        .from('invoice_items')
        .insert({
            invoice_id: parsed.invoice_id,
            description: parsed.description,
            quantity: parsed.quantity,
            unit_price_pence: parsed.unit_price_pence,
            line_total_pence: lineTotal,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error adding invoice item:', error);
        return { error: error.message };
    }

    await recalcInvoiceTotals(supabase, parsed.invoice_id);
    revalidatePath(`/admin/invoices/${parsed.invoice_id}`);
    return { id: data.id };
}

export async function updateInvoiceItemAction(
    input: UpdateInvoiceItemInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = UpdateInvoiceItemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', parsed.invoice_id)
        .single();

    if (invError || !inv) return { error: 'Invoice not found' };
    if (inv.status !== 'draft') return { error: 'Only draft invoices can be edited' };

    const { data: current, error: fetchError } = await supabase
        .from('invoice_items')
        .select('quantity, unit_price_pence')
        .eq('id', parsed.id)
        .single();

    if (fetchError || !current) return { error: 'Item not found' };

    const qty = parsed.quantity ?? current.quantity;
    const unitPrice = parsed.unit_price_pence ?? current.unit_price_pence;
    const lineTotal = calcLineTotal(qty, unitPrice);

    const updates: Record<string, unknown> = {
        quantity: qty,
        unit_price_pence: unitPrice,
        line_total_pence: lineTotal,
    };
    if (parsed.description !== undefined) updates.description = parsed.description;

    const { error } = await supabase
        .from('invoice_items')
        .update(updates)
        .eq('id', parsed.id);

    if (error) {
        console.error('Error updating invoice item:', error);
        return { error: error.message };
    }

    await recalcInvoiceTotals(supabase, parsed.invoice_id);
    revalidatePath(`/admin/invoices/${parsed.invoice_id}`);
    return { success: true };
}

export async function deleteInvoiceItemAction(
    invoiceId: string,
    itemId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const supabase = await createServerClient();

    // Only allow on draft invoices
    const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();

    if (invError || !inv) return { error: 'Invoice not found' };
    if (inv.status !== 'draft') return { error: 'Only draft invoices can be edited' };

    const { error } = await supabase
        .from('invoice_items')
        .delete()
        .eq('id', itemId)
        .eq('invoice_id', invoiceId);

    if (error) {
        console.error('Error deleting invoice item:', error);
        return { error: error.message };
    }

    await recalcInvoiceTotals(supabase, invoiceId);
    revalidatePath(`/admin/invoices/${invoiceId}`);
    return { success: true };
}

export async function deleteInvoiceAction(
    invoiceId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const supabase = await createServerClient();

    // Only allow deleting draft invoices
    const { data: inv, error: invError } = await supabase
        .from('invoices')
        .select('status')
        .eq('id', invoiceId)
        .single();

    if (invError || !inv) return { error: 'Invoice not found' };
    if (inv.status !== 'draft') return { error: 'Only draft invoices can be deleted' };

    const { error } = await supabase
        .from('invoices')
        .delete()
        .eq('id', invoiceId);

    if (error) {
        console.error('Error deleting invoice:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/invoices');
    return { success: true };
}
