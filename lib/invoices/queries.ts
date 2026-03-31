import { createServerClient } from '@/lib/supabase-server';
import type { Invoice, InvoiceItem, InvoiceWithItems } from './types';

export async function getInvoices(filters?: {
    status?: string;
    search?: string;
}): Promise<Invoice[]> {
    const supabase = await createServerClient();

    let query = supabase
        .from('invoices')
        .select('*')
        .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters?.search) {
        const safe = filters.search.replace(/[,()]/g, '').trim();
        if (safe) {
            query = query.or(
                `invoice_number.ilike.%${safe}%,customer_name.ilike.%${safe}%,project_name.ilike.%${safe}%`
            );
        }
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching invoices:', error);
        return [];
    }
    return data as Invoice[];
}

export async function getInvoiceWithItems(invoiceId: string): Promise<InvoiceWithItems | null> {
    const supabase = await createServerClient();

    const { data: invoice, error } = await supabase
        .from('invoices')
        .select('*')
        .eq('id', invoiceId)
        .single();

    if (error || !invoice) return null;

    const { data: items } = await supabase
        .from('invoice_items')
        .select('*')
        .eq('invoice_id', invoiceId)
        .order('sort_order', { ascending: true });

    let linked_quote = null;
    if (invoice.quote_id) {
        const { data: quote } = await supabase
            .from('quotes')
            .select('id, quote_number, customer_name')
            .eq('id', invoice.quote_id)
            .single();
        linked_quote = quote ?? null;
    }

    let linked_job = null;
    if (invoice.production_job_id) {
        const { data: job } = await supabase
            .from('production_jobs')
            .select('id, job_number, status')
            .eq('id', invoice.production_job_id)
            .single();
        linked_job = job ?? null;
    }

    return {
        ...(invoice as Invoice),
        items: (items || []) as InvoiceItem[],
        linked_quote,
        linked_job,
    };
}
