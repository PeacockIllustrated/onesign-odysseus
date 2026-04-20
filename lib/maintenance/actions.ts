'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, okVoid, err, type Result } from '@/lib/result';
import {
    CreateMaintenanceVisitSchema,
    UpdateMaintenanceVisitSchema,
    type CreateMaintenanceVisitInput,
    type UpdateMaintenanceVisitInput,
    type MaintenanceVisit,
} from './types';

type MaintenanceVisitRow = MaintenanceVisit & {
    orgs?: { name: string | null } | null;
    org_sites?: { name: string | null } | null;
    contacts?: { first_name: string | null; last_name: string | null } | null;
};

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

    return ((data ?? []) as MaintenanceVisitRow[]).map((row) => ({
        ...row,
        org_name: row.orgs?.name ?? null,
        site_name: row.org_sites?.name ?? null,
        contact_name: row.contacts
            ? `${row.contacts.first_name ?? ''} ${row.contacts.last_name ?? ''}`.trim() || null
            : null,
    }));
}

export async function createMaintenanceVisit(
    input: CreateMaintenanceVisitInput
): Promise<Result<{ id: string }>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const validation = CreateMaintenanceVisitSchema.safeParse(input);
    if (!validation.success) return err(validation.error.issues[0].message);
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

    if (error || !data) return err(error?.message ?? 'failed to create visit');

    revalidatePath('/admin/maintenance');
    revalidatePath('/admin/map');
    return ok({ id: data.id });
}

export async function updateMaintenanceVisit(
    visitId: string,
    patch: UpdateMaintenanceVisitInput
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const validation = UpdateMaintenanceVisitSchema.safeParse(patch);
    if (!validation.success) return err(validation.error.issues[0].message);
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

    if (error) return err(error.message);

    revalidatePath('/admin/maintenance');
    revalidatePath('/admin/map');
    return okVoid();
}

export async function completeMaintenanceVisit(
    visitId: string
): Promise<Result<null>> {
    return updateMaintenanceVisit(visitId, {
        status: 'completed',
        completed_date: new Date().toISOString().slice(0, 10),
    });
}

export async function cancelMaintenanceVisit(
    visitId: string
): Promise<Result<null>> {
    return updateMaintenanceVisit(visitId, { status: 'cancelled' });
}
