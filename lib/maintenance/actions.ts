'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import {
    CreateMaintenanceVisitSchema,
    UpdateMaintenanceVisitSchema,
    type CreateMaintenanceVisitInput,
    type UpdateMaintenanceVisitInput,
    type MaintenanceVisit,
} from './types';

export async function getMaintenanceVisits(filters?: {
    status?: string;
}): Promise<MaintenanceVisit[]> {
    const supabase = createAdminClient();

    let query = supabase
        .from('maintenance_visits')
        .select(`
            *,
            orgs!inner(name),
            org_sites(name),
            contacts(first_name, last_name)
        `)
        .order('scheduled_date', { ascending: true })
        .limit(200);

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    const { data } = await query;

    return (data ?? []).map((row: any) => ({
        ...row,
        org_name: row.orgs?.name ?? null,
        site_name: row.org_sites?.name ?? null,
        contact_name: row.contacts
            ? `${row.contacts.first_name} ${row.contacts.last_name}`
            : null,
    }));
}

export async function createMaintenanceVisit(
    input: CreateMaintenanceVisitInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = CreateMaintenanceVisitSchema.safeParse(input);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = createAdminClient();

    const { data, error } = await supabase
        .from('maintenance_visits')
        .insert({
            org_id: parsed.org_id,
            site_id: parsed.site_id ?? null,
            contact_id: parsed.contact_id ?? null,
            visit_type: parsed.visit_type,
            scheduled_date: parsed.scheduled_date,
            notes: parsed.notes ?? null,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error || !data) return { error: error?.message ?? 'failed to create visit' };

    revalidatePath('/admin/maintenance');
    revalidatePath('/admin/map');
    return { id: data.id };
}

export async function updateMaintenanceVisit(
    visitId: string,
    patch: UpdateMaintenanceVisitInput
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = UpdateMaintenanceVisitSchema.safeParse(patch);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = createAdminClient();

    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase
        .from('maintenance_visits')
        .update(updates)
        .eq('id', visitId);

    if (error) return { error: error.message };

    revalidatePath('/admin/maintenance');
    revalidatePath('/admin/map');
    return { ok: true };
}

export async function completeMaintenanceVisit(
    visitId: string
): Promise<{ ok: true } | { error: string }> {
    return updateMaintenanceVisit(visitId, {
        status: 'completed',
        completed_date: new Date().toISOString().slice(0, 10),
    });
}

export async function cancelMaintenanceVisit(
    visitId: string
): Promise<{ ok: true } | { error: string }> {
    return updateMaintenanceVisit(visitId, { status: 'cancelled' });
}
