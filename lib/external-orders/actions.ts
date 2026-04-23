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

export async function listExternalOrders(): Promise<ExternalOrder[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('external_orders')
        .select('*')
        .order('placed_at', { ascending: false })
        .limit(500);
    return (data ?? []) as ExternalOrder[];
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
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({
            status: 'acknowledged',
            acknowledged_at: new Date().toISOString(),
            acknowledged_by: user.id,
        })
        .eq('id', id)
        .eq('status', 'new');

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function markExternalOrderInProgress(id: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({ status: 'in_progress' })
        .eq('id', id)
        .in('status', ['new', 'acknowledged']);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function completeExternalOrder(id: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({
            status: 'completed',
            completed_at: new Date().toISOString(),
            completed_by: user.id,
        })
        .eq('id', id);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function cancelExternalOrder(id: string, reason?: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({
            status: 'cancelled',
            cancelled_at: new Date().toISOString(),
            cancelled_by: user.id,
            notes: reason?.trim() || null,
        })
        .eq('id', id);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function updateExternalOrderNotes(id: string, notes: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({ notes: notes.trim() || null })
        .eq('id', id);

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
    const supabase = await createServerClient();

    const { error } = await supabase
        .from('external_orders')
        .update({ linked_org_id: orgId })
        .eq('id', id);

    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}

export async function deleteExternalOrder(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const supabase = await createServerClient();
    const { error } = await supabase.from('external_orders').delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/external-orders');
    return okVoid();
}
