import { createAdminClient } from '@/lib/supabase-admin';
import type { ExternalOrder } from '../types';

/**
 * Read adapter for Persimmon's psp_orders / psp_order_items tables.
 *
 * We do not own those tables — they belong to the Persimmon ordering app.
 * Each row is normalised into the ExternalOrder display shape so the
 * inbox can merge Persimmon, Mapleleaf (manual), and future Lynx orders
 * into a single list. A row becomes "tracked" — i.e. persisted in our
 * external_orders table — the first time staff take an action on it
 * (acknowledge / complete / cancel). Until then its id is synthetic
 * (`psp:<uuid>`) so the client can still key list items and the action
 * handlers know which source to pull from.
 */

export interface PersimmonRaw {
    id: string;
    order_number: string | null;
    status: string | null;
    contact_name: string | null;
    email: string | null;
    phone: string | null;
    site_name: string | null;
    site_address: string | null;
    po_number: string | null;
    notes: string | null;
    subtotal: number | null;
    vat: number | null;
    total: number | null;
    delivery_fee: number | null;
    purchaser_name: string | null;
    purchaser_email: string | null;
    created_at: string;
    updated_at: string;
    items: Array<{
        id: string;
        name: string | null;
        code: string | null;
        size: string | null;
        material: string | null;
        quantity: number | null;
        line_total: number | null;
    }>;
}

function summariseItems(items: PersimmonRaw['items']): string {
    if (items.length === 0) return '';
    // Keep it terse — "3× Post-Paint Sign (600×400, acrylic) · 2× Standing Base"
    return items
        .slice(0, 4)
        .map((i) => {
            const parts: string[] = [];
            parts.push(`${i.quantity ?? 1}× ${i.name ?? i.code ?? 'item'}`);
            const detail = [i.size, i.material].filter(Boolean).join(', ');
            if (detail) parts.push(`(${detail})`);
            return parts.join(' ');
        })
        .join(' · ') + (items.length > 4 ? ` · +${items.length - 4} more` : '');
}

export async function fetchPersimmonOrders(): Promise<PersimmonRaw[]> {
    const supabase = createAdminClient();
    try {
        const { data, error } = await supabase
            .from('psp_orders')
            .select(`
                id, order_number, status, contact_name, email, phone,
                site_name, site_address, po_number, notes,
                subtotal, vat, total, delivery_fee,
                purchaser_name, purchaser_email,
                created_at, updated_at,
                items:psp_order_items(id, name, code, size, material, quantity, line_total)
            `)
            .order('created_at', { ascending: false })
            .limit(500);
        if (error) {
            console.error('[persimmon adapter] read error:', error.message);
            return [];
        }
        return (data ?? []) as PersimmonRaw[];
    } catch (e) {
        console.error('[persimmon adapter] table missing or unreachable:', e);
        return [];
    }
}

/**
 * Turn a raw Persimmon row into the ExternalOrder shape the UI expects.
 * `synthetic: true` means this row has no tracking override in our
 * external_orders table — status defaults to 'new'.
 */
export function persimmonToDisplay(row: PersimmonRaw): ExternalOrder {
    const totalPence = row.total != null ? Math.round(row.total * 100) : null;
    const itemCount = row.items.reduce((n, i) => n + (i.quantity ?? 1), 0) || row.items.length;
    const detailBits = [
        row.po_number ? `PO ${row.po_number}` : null,
        row.purchaser_name ? `buyer: ${row.purchaser_name}` : null,
    ].filter(Boolean).join(' · ');
    const summary = [summariseItems(row.items), detailBits].filter(Boolean).join(' — ');

    return {
        id: `psp:${row.id}`,
        source_app: 'persimmon',
        external_ref: row.order_number ?? row.id,
        status: 'new',
        client_name: row.contact_name,
        client_email: row.email,
        client_phone: row.phone,
        site_name: row.site_name,
        site_address: row.site_address,
        site_postcode: null,
        placed_at: row.created_at,
        item_count: itemCount || null,
        item_summary: summary || null,
        total_pence: totalPence,
        raw_payload: row,
        linked_org_id: null,
        linked_quote_id: null,
        linked_production_job_id: null,
        notes: row.notes,
        acknowledged_at: null,
        acknowledged_by: null,
        completed_at: null,
        completed_by: null,
        cancelled_at: null,
        cancelled_by: null,
        created_by: null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}
