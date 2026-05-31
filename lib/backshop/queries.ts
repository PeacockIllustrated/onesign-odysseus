import 'server-only';
import { createAdminClient } from '@/lib/supabase-admin';
import {
    normaliseChecks,
    type BackshopItemRow,
    type BackshopItemWithPdf,
} from './types';

const TABLE = 'backshop_items';
const BUCKET = 'backshop';
const SIGNED_URL_TTL = 60 * 60; // 1 hour

function hydrate(row: Record<string, unknown>): BackshopItemRow {
    return {
        ...(row as unknown as BackshopItemRow),
        checks: normaliseChecks(row.checks as Record<string, boolean> | null),
    };
}

/**
 * Active board items (not archived), newest first. Service-role read — the
 * page that calls this is auth-gated by the backshop layout.
 */
export async function getBackshopItems(): Promise<BackshopItemRow[]> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('archived', false)
        .order('created_at', { ascending: false })
        .limit(100);
    if (error || !data) return [];
    return data.map(hydrate);
}

/**
 * A single board item plus a short-lived signed URL for its reference PDF
 * (null when no PDF was stored or signing fails).
 */
export async function getBackshopItem(
    id: string,
): Promise<BackshopItemWithPdf | null> {
    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (error || !data) return null;

    const row = hydrate(data);
    let pdfUrl: string | null = null;
    if (row.pdf_path) {
        const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(row.pdf_path, SIGNED_URL_TTL);
        pdfUrl = signed?.signedUrl ?? null;
    }
    return { ...row, pdfUrl };
}
