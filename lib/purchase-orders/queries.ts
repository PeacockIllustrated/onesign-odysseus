import { createServerClient } from '@/lib/supabase-server';
import type { PurchaseOrder, PoItem, PoWithItems } from './types';

export async function getPurchaseOrders(filters?: {
    status?: string;
    search?: string;
}): Promise<PurchaseOrder[]> {
    const supabase = await createServerClient();

    let query = supabase
        .from('purchase_orders')
        .select('*')
        .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters?.search) {
        const safe = filters.search.replace(/[,()]/g, '').trim();
        if (safe) {
            query = query.or(
                `po_number.ilike.%${safe}%,supplier_name.ilike.%${safe}%,description.ilike.%${safe}%`
            );
        }
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching purchase orders:', error);
        return [];
    }
    return data as PurchaseOrder[];
}

export async function getPoWithItems(poId: string): Promise<PoWithItems | null> {
    const supabase = await createServerClient();

    const { data: po, error: poError } = await supabase
        .from('purchase_orders')
        .select('*')
        .eq('id', poId)
        .single();

    if (poError || !po) return null;

    const { data: items } = await supabase
        .from('po_items')
        .select('*')
        .eq('po_id', poId)
        .order('created_at', { ascending: true });

    let linked_job = null;
    if (po.production_job_id) {
        const { data: job } = await supabase
            .from('production_jobs')
            .select('id, job_number, title')
            .eq('id', po.production_job_id)
            .single();
        linked_job = job ?? null;
    }

    let linked_quote = null;
    if (po.quote_id) {
        const { data: quote } = await supabase
            .from('quotes')
            .select('id, quote_number, customer_name')
            .eq('id', po.quote_id)
            .single();
        linked_quote = quote ?? null;
    }

    return {
        ...(po as PurchaseOrder),
        items: (items || []) as PoItem[],
        linked_job,
        linked_quote,
    };
}
