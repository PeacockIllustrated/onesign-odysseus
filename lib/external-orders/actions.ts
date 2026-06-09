'use server';

import { createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, okVoid, err, type Result } from '@/lib/result';
import { revalidatePath } from 'next/cache';
import {
    CreateExternalOrderInputSchema,
    type CreateExternalOrderInput,
    type ExternalOrder,
} from './types';
import { fetchPersimmonOrders, persimmonToDisplay, type PersimmonRaw } from './adapters/persimmon';

/**
 * Composite read: own external_orders table (Mapleleaf + manual entries +
 * tracked rows for external sources) merged with live reads from the
 * source-app tables (psp_orders for Persimmon today). Tracked rows win —
 * if a psp row has already been actioned and a row exists in
 * external_orders keyed on (source_app, external_ref), the tracked row
 * replaces the synthetic one so status/acknowledged/etc. are accurate.
 */
export async function listExternalOrders(): Promise<ExternalOrder[]> {
    const supabase = createAdminClient();

    const [ownedResult, persimmonRaw] = await Promise.all([
        supabase
            .from('external_orders')
            .select('*')
            .order('placed_at', { ascending: false })
            .limit(500),
        fetchPersimmonOrders(),
    ]);

    const owned = (ownedResult.data ?? []) as ExternalOrder[];
    // Index tracked external_orders rows by (source_app, external_ref) so
    // adapter results can be deduped against them.
    const trackedKey = (o: { source_app: string; external_ref: string | null }) =>
        `${o.source_app}::${o.external_ref ?? ''}`;
    const trackedIndex = new Set(
        owned.filter((o) => o.external_ref).map((o) => trackedKey(o))
    );

    const merged: ExternalOrder[] = [...owned];
    for (const row of persimmonRaw) {
        const display = persimmonToDisplay(row);
        if (trackedIndex.has(trackedKey(display))) continue;
        merged.push(display);
    }

    merged.sort((a, b) => new Date(b.placed_at).getTime() - new Date(a.placed_at).getTime());
    return merged;
}

/**
 * Resolve an inbox row id to a concrete external_orders.id, creating the
 * tracking row from the source adapter on first touch.
 *
 * UUID → already a tracked external_orders row, returns as-is.
 * "psp:<uuid>" → upsert an external_orders snapshot from psp_orders and
 *   return the new id.
 */
async function resolveToTrackedId(id: string): Promise<Result<string>> {
    if (!id.includes(':')) return ok(id);

    const [prefix, sourceId] = id.split(':', 2);
    if (prefix !== 'psp') return err(`unknown source prefix: ${prefix}`);

    const supabase = createAdminClient();
    const { data: raw } = await supabase
        .from('psp_orders')
        .select(`
            id, order_number, contact_name, email, phone,
            site_name, site_address, notes, total, created_at,
            items:psp_order_items(id, name, code, size, material, quantity, line_total)
        `)
        .eq('id', sourceId)
        .maybeSingle();

    if (!raw) return err('persimmon order not found');

    const display = persimmonToDisplay(raw as PersimmonRaw);

    // Upsert keyed on the unique (source_app, external_ref) index from
    // migration 055. If a parallel request already created the row, the
    // conflict branch returns the existing id.
    const serverClient = await createServerClient();
    const user = await getUser();

    const { data: upserted, error } = await serverClient
        .from('external_orders')
        .upsert({
            source_app: 'persimmon',
            external_ref: display.external_ref,
            status: 'acknowledged',
            client_name: display.client_name,
            client_email: display.client_email,
            client_phone: display.client_phone,
            site_name: display.site_name,
            site_address: display.site_address,
            placed_at: display.placed_at,
            item_count: display.item_count,
            item_summary: display.item_summary,
            total_pence: display.total_pence,
            raw_payload: display.raw_payload as object,
            notes: display.notes,
            created_by: user?.id ?? null,
        }, { onConflict: 'source_app,external_ref' })
        .select('id')
        .single();

    if (error || !upserted) return err(error?.message ?? 'failed to track persimmon order');
    return ok(upserted.id as string);
}

export async function createExternalOrder(
    input: CreateExternalOrderInput
): Promise<Result<{ id: string }>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const parsed = CreateExternalOrderInputSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('external_orders')
        .insert({
            ...parsed.data,
            placed_at: parsed.data.placed_at || new Date().toISOString(),
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return ok({ id: data.id as string });
}

export async function acknowledgeExternalOrder(id: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const resolved = await resolveToTrackedId(id);
    if (!resolved.ok) return err(resolved.error);
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({
            status: 'acknowledged',
            acknowledged_at: new Date().toISOString(),
            acknowledged_by: user.id,
        })
        .eq('id', resolved.data)
        .in('status', ['new', 'acknowledged']);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function markExternalOrderInProgress(id: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const resolved = await resolveToTrackedId(id);
    if (!resolved.ok) return err(resolved.error);
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({ status: 'in_progress' })
        .eq('id', resolved.data)
        .in('status', ['new', 'acknowledged', 'in_progress']);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function completeExternalOrder(id: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const resolved = await resolveToTrackedId(id);
    if (!resolved.ok) return err(resolved.error);
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            completed_by: user.id,
        })
        .eq('id', resolved.data);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function cancelExternalOrder(id: string, reason?: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const resolved = await resolveToTrackedId(id);
    if (!resolved.ok) return err(resolved.error);
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: user.id,
            notes: reason?.trim() || null,
        })
        .eq('id', resolved.data);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function updateExternalOrderNotes(id: string, notes: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const resolved = await resolveToTrackedId(id);
    if (!resolved.ok) return err(resolved.error);
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({ notes: notes.trim() || null })
        .eq('id', resolved.data);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function linkExternalOrderToOrg(
    id: string,
    orgId: string
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const resolved = await resolveToTrackedId(id);
    if (!resolved.ok) return err(resolved.error);
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({ linked_org_id: orgId })
        .eq('id', resolved.data);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function deleteExternalOrder(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    // Deleting only applies to tracked rows in our own table. A synthetic
    // "psp:..." id points at a source-app row we don't own and shouldn't
    // touch from here — refuse with a helpful message.
    if (id.includes(':')) return err('can only delete orders logged here; source-app orders have to be cancelled or resolved upstream');
    const supabase = await createServerClient();
    const { error } = await supabase.from('external_orders').delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}
