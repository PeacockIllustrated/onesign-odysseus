'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { geocodeAddress } from '@/lib/mapbox/client';
import { ok, okVoid, err, type Result } from '@/lib/result';
import {
    CreateDriverSchema,
    UpdateDriverSchema,
    type CreateDriverInput,
    type UpdateDriverInput,
    type Driver,
} from './types';

export async function getActiveDrivers(): Promise<Driver[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('drivers')
        .select('*')
        .eq('is_active', true)
        .order('name');
    return (data ?? []) as Driver[];
}

export async function getAllDrivers(): Promise<Driver[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('drivers')
        .select('*')
        .order('name');
    return (data ?? []) as Driver[];
}

async function geocodeDriverHome(
    supabase: ReturnType<typeof createAdminClient>,
    driverId: string,
    postcode: string | null | undefined
): Promise<void> {
    if (!postcode?.trim()) return;
    try {
        const results = await geocodeAddress(postcode.trim());
        if (results.length > 0) {
            await supabase
                .from('drivers')
                .update({ home_lat: results[0].lat, home_lng: results[0].lng })
                .eq('id', driverId);
        }
    } catch {
        // Fire-and-forget
    }
}

export async function createDriver(
    input: CreateDriverInput
): Promise<Result<{ id: string }>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const validation = CreateDriverSchema.safeParse(input);
    if (!validation.success) return err(validation.error.issues[0].message);
    const parsed = validation.data;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('drivers')
        .insert({
            name: parsed.name,
            phone: parsed.phone ?? null,
            home_postcode: parsed.home_postcode ?? null,
            vehicle_type: parsed.vehicle_type ?? 'van',
        })
        .select('id')
        .single();

    if (error || !data) return err(error?.message ?? 'failed to create driver');

    geocodeDriverHome(supabase, data.id, parsed.home_postcode).catch(() => {});

    revalidatePath('/admin/planning');
    return ok({ id: data.id });
}

export async function updateDriver(
    driverId: string,
    patch: UpdateDriverInput
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const validation = UpdateDriverSchema.safeParse(patch);
    if (!validation.success) return err(validation.error.issues[0].message);
    const parsed = validation.data;

    const supabase = createAdminClient();
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(parsed)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase
        .from('drivers')
        .update(updates)
        .eq('id', driverId);
    if (error) return err(error.message);

    if (parsed.home_postcode !== undefined) {
        await supabase.from('drivers').update({ home_lat: null, home_lng: null }).eq('id', driverId);
        geocodeDriverHome(supabase, driverId, parsed.home_postcode).catch(() => {});
    }

    revalidatePath('/admin/planning');
    return okVoid();
}

export async function toggleDriverActive(
    driverId: string
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data: driver } = await supabase
        .from('drivers')
        .select('is_active')
        .eq('id', driverId)
        .single();
    if (!driver) return err('driver not found');

    const { error } = await supabase
        .from('drivers')
        .update({ is_active: !driver.is_active })
        .eq('id', driverId);
    if (error) return err(error.message);

    revalidatePath('/admin/planning');
    return okVoid();
}
