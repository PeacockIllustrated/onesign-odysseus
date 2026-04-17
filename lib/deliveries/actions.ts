'use server';

import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { canTransitionTo } from './utils';
import { getDeliveries, getDeliveryWithItems, getDeliveryForJob } from './queries';
import {
    SubmitPodInputSchema,
    CreateDeliveryInputSchema,
    UpdateDeliveryInputSchema,
    type Delivery,
    type DeliveryWithItems,
    type DeliveryStatus,
    type CreateDeliveryInput,
    type UpdateDeliveryInput,
    type PodPageData,
} from './types';

// ---------------------------------------------------------------------------
// Thin wrappers for client components
// ---------------------------------------------------------------------------

export async function getDeliveryListAction(filters?: {
    status?: string;
    search?: string;
}): Promise<Delivery[]> {
    return getDeliveries(filters);
}

export async function getDeliveryWithItemsAction(
    deliveryId: string
): Promise<DeliveryWithItems | null> {
    return getDeliveryWithItems(deliveryId);
}

export async function getDeliveryForJobAction(
    jobId: string
): Promise<Delivery | null> {
    return getDeliveryForJob(jobId);
}

// ---------------------------------------------------------------------------
// Jobs available for delivery
// ---------------------------------------------------------------------------

export async function getJobsAvailableForDelivery(): Promise<
    Array<{
        id: string;
        job_number: string;
        client_name: string;
        title: string;
        org_id: string;
        site_id: string | null;
        contact_id: string | null;
    }>
> {
    const supabase = createAdminClient();

    // Fetch all active/completed jobs
    const { data: jobs, error: jobsError } = await supabase
        .from('production_jobs')
        .select('id, job_number, client_name, title, org_id, site_id, contact_id')
        .in('status', ['active', 'completed'])
        .order('created_at', { ascending: false });

    if (jobsError || !jobs || jobs.length === 0) return [];

    // Fetch all non-failed delivery job IDs
    const { data: deliveries } = await supabase
        .from('deliveries')
        .select('production_job_id')
        .neq('status', 'failed');

    const deliveredJobIds = new Set(
        (deliveries || []).map((d: any) => d.production_job_id)
    );

    return jobs.filter((j: any) => !deliveredJobIds.has(j.id));
}

// ---------------------------------------------------------------------------
// Core admin actions
// ---------------------------------------------------------------------------

export async function createDeliveryFromJob(
    input: CreateDeliveryInput
): Promise<{ id: string; deliveryNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = CreateDeliveryInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = createAdminClient();

    const { data: job, error: jobError } = await supabase
        .from('production_jobs')
        .select('id, org_id, site_id, contact_id, client_name, job_number')
        .eq('id', parsed.production_job_id)
        .single();

    if (jobError || !job) return { error: 'Job not found' };

    const { data: existing } = await supabase
        .from('deliveries')
        .select('id')
        .eq('production_job_id', parsed.production_job_id)
        .neq('status', 'failed')
        .maybeSingle();

    if (existing) return { error: 'A delivery already exists for this job' };

    const { data: newDelivery, error: insertError } = await supabase
        .from('deliveries')
        .insert({
            org_id: job.org_id,
            production_job_id: parsed.production_job_id,
            site_id: parsed.site_id ?? job.site_id ?? null,
            contact_id: parsed.contact_id ?? job.contact_id ?? null,
            status: 'scheduled',
            driver_name: parsed.driver_name ?? null,
            driver_phone: parsed.driver_phone ?? null,
            scheduled_date: parsed.scheduled_date,
            notes_internal: parsed.notes_internal ?? null,
            notes_driver: parsed.notes_driver ?? null,
            created_by: user.id,
        })
        .select('id, delivery_number')
        .single();

    if (insertError || !newDelivery) {
        console.error('Error creating delivery:', insertError);
        return { error: insertError?.message ?? 'Failed to create delivery' };
    }

    // 4. Fetch job items
    const { data: jobItems } = await supabase
        .from('job_items')
        .select('id, description, quantity')
        .eq('job_id', job.id)
        .order('created_at', { ascending: true });

    // 5. Insert delivery items from job items
    if (jobItems && jobItems.length > 0) {
        const deliveryItems = jobItems.map((item: any, index: number) => ({
            delivery_id: newDelivery.id,
            job_item_id: item.id,
            description: item.description,
            quantity: item.quantity,
            sort_order: index,
        }));

        const { error: itemsError } = await supabase
            .from('delivery_items')
            .insert(deliveryItems);

        if (itemsError) {
            console.error('Error inserting delivery items:', itemsError);
            // Clean up delivery if items fail
            await supabase.from('deliveries').delete().eq('id', newDelivery.id);
            return { error: itemsError.message };
        }
    }

    // 6. Revalidate paths
    revalidatePath('/admin/deliveries');
    revalidatePath('/admin/jobs');

    return { id: newDelivery.id, deliveryNumber: newDelivery.delivery_number };
}

/**
 * Idempotently auto-create a scheduled delivery for a job that has just
 * completed all production. Called from advanceItemToNextRoutedStage when
 * the final job_item flips to completed. Safe to call multiple times —
 * skips if a non-failed delivery already exists for this job.
 *
 * No super-admin gate because this is an internal trigger, not user-initiated.
 * The advance action that calls this is itself already authenticated.
 */
export async function autoCreateDeliveryForCompletedJob(
    jobId: string
): Promise<{ id: string; deliveryNumber: string } | { skipped: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = createAdminClient();

    const { data: job, error: jobError } = await supabase
        .from('production_jobs')
        .select('id, org_id, site_id, contact_id, client_name, job_number')
        .eq('id', jobId)
        .single();

    if (jobError || !job) return { error: 'Job not found' };

    // Idempotency: skip if a non-failed delivery already exists.
    const { data: existing } = await supabase
        .from('deliveries')
        .select('id')
        .eq('production_job_id', jobId)
        .neq('status', 'failed')
        .maybeSingle();

    if (existing) return { skipped: true };

    // Default schedule = today (admin can edit). Driver + notes intentionally
    // blank — staff fill those in on the delivery detail page.
    const today = new Date().toISOString().slice(0, 10);

    const { data: newDelivery, error: insertError } = await supabase
        .from('deliveries')
        .insert({
            org_id: job.org_id,
            production_job_id: jobId,
            site_id: job.site_id ?? null,
            contact_id: job.contact_id ?? null,
            status: 'scheduled',
            scheduled_date: today,
            notes_internal: `Auto-created when ${job.job_number} reached goods-out.`,
            created_by: user.id,
        })
        .select('id, delivery_number')
        .single();

    if (insertError || !newDelivery) {
        console.error('autoCreateDeliveryForCompletedJob insert error:', insertError);
        return { error: insertError?.message ?? 'Failed to auto-create delivery' };
    }

    // Populate delivery_items from job_items — same shape as the manual action.
    const { data: jobItems } = await supabase
        .from('job_items')
        .select('id, description, quantity')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

    if (jobItems && jobItems.length > 0) {
        const rows = jobItems.map((item: any, index: number) => ({
            delivery_id: newDelivery.id,
            job_item_id: item.id,
            description: item.description,
            quantity: item.quantity,
            sort_order: index,
        }));
        const { error: itemsError } = await supabase
            .from('delivery_items')
            .insert(rows);
        if (itemsError) {
            console.error('autoCreateDeliveryForCompletedJob items error:', itemsError);
            // Roll back the empty delivery so admin isn't left with an orphan.
            await supabase.from('deliveries').delete().eq('id', newDelivery.id);
            return { error: itemsError.message };
        }
    }

    revalidatePath('/admin/deliveries');
    revalidatePath('/admin/jobs');
    revalidatePath(`/admin/jobs/${jobId}`);

    return { id: newDelivery.id, deliveryNumber: newDelivery.delivery_number };
}

export async function updateDeliveryAction(
    input: UpdateDeliveryInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const validation = UpdateDeliveryInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = createAdminClient();

    const { data: current, error: fetchError } = await supabase
        .from('deliveries')
        .select('status')
        .eq('id', parsed.id)
        .single();

    if (fetchError || !current) return { error: 'Delivery not found' };
    if (current.status !== 'scheduled') {
        return { error: 'Only scheduled deliveries can be edited' };
    }

    const { id, ...fields } = parsed;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase.from('deliveries').update(updates).eq('id', id);

    if (error) {
        console.error('Error updating delivery:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/deliveries/${id}`);
    revalidatePath('/admin/deliveries');
    return { success: true };
}

export async function updateDeliveryStatusAction(
    deliveryId: string,
    newStatus: DeliveryStatus
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const supabase = createAdminClient();

    const { data: current, error: fetchError } = await supabase
        .from('deliveries')
        .select('status')
        .eq('id', deliveryId)
        .single();

    if (fetchError || !current) return { error: 'Delivery not found' };

    if (!canTransitionTo(current.status as DeliveryStatus, newStatus)) {
        return {
            error: `Cannot transition from "${current.status}" to "${newStatus}"`,
        };
    }

    const updates: Record<string, unknown> = { status: newStatus };

    // Auto-set delivered_at when transitioning to delivered
    if (newStatus === 'delivered') {
        updates.delivered_at = new Date().toISOString();
    }

    const { error } = await supabase
        .from('deliveries')
        .update(updates)
        .eq('id', deliveryId);

    if (error) {
        console.error('Error updating delivery status:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/deliveries/${deliveryId}`);
    revalidatePath('/admin/deliveries');
    return { success: true };
}

export async function deleteDeliveryAction(
    deliveryId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const supabase = createAdminClient();

    // Only allow deleting scheduled deliveries
    const { data: current, error: fetchError } = await supabase
        .from('deliveries')
        .select('status')
        .eq('id', deliveryId)
        .single();

    if (fetchError || !current) return { error: 'Delivery not found' };
    if (current.status !== 'scheduled') {
        return { error: 'Only scheduled deliveries can be deleted' };
    }

    const { error } = await supabase
        .from('deliveries')
        .delete()
        .eq('id', deliveryId);

    if (error) {
        console.error('Error deleting delivery:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/deliveries');
    return { success: true };
}

export async function generatePodLink(
    deliveryId: string
): Promise<{ token: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return { error: gate.error };

    const supabase = createAdminClient();

    // Fetch delivery — if pod_token already exists, return it
    const { data: delivery, error: fetchError } = await supabase
        .from('deliveries')
        .select('pod_token, pod_status')
        .eq('id', deliveryId)
        .single();

    if (fetchError || !delivery) return { error: 'Delivery not found' };

    if (delivery.pod_token) {
        return { token: delivery.pod_token };
    }

    // Generate secure token (same pattern as artwork approval)
    const token = randomBytes(32).toString('hex');

    const { error } = await supabase
        .from('deliveries')
        .update({ pod_token: token, pod_status: 'pending' })
        .eq('id', deliveryId);

    if (error) {
        console.error('Error generating POD link:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/deliveries/${deliveryId}`);
    return { token };
}

// ---------------------------------------------------------------------------
// Public actions (token-gated, no auth required)
// ---------------------------------------------------------------------------

export async function getPodByToken(
    token: string
): Promise<
    | { data: PodPageData; status: 'pending' }
    | { error: string; status: 'invalid' | 'signed' | 'refused'; data?: { pod_signed_by: string | null; pod_signed_at: string | null } }
> {
    const supabase = createAdminClient();

    // Fetch delivery by pod_token
    const { data: delivery, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('pod_token', token)
        .single();

    if (error || !delivery) {
        return { error: 'Invalid link', status: 'invalid' };
    }

    if (delivery.pod_status === 'signed') {
        return {
            error: 'Already signed',
            status: 'signed',
            data: {
                pod_signed_by: delivery.pod_signed_by,
                pod_signed_at: delivery.pod_signed_at,
            },
        };
    }

    if (delivery.pod_status === 'refused') {
        return { error: 'Delivery refused', status: 'refused' };
    }

    // Fetch items, linked job, site in parallel
    const [itemsRes, jobRes, siteRes] = await Promise.all([
        supabase
            .from('delivery_items')
            .select('description, quantity')
            .eq('delivery_id', delivery.id)
            .order('sort_order', { ascending: true }),
        supabase
            .from('production_jobs')
            .select('client_name, job_number')
            .eq('id', delivery.production_job_id)
            .single(),
        delivery.site_id
            ? supabase
                  .from('org_sites')
                  .select(
                      'name, address_line_1, address_line_2, city, county, postcode'
                  )
                  .eq('id', delivery.site_id)
                  .single()
            : Promise.resolve({ data: null }),
    ]);

    return {
        status: 'pending',
        data: {
            delivery_number: delivery.delivery_number,
            scheduled_date: delivery.scheduled_date,
            client_name: jobRes.data?.client_name ?? '',
            job_number: jobRes.data?.job_number ?? '',
            driver_name: delivery.driver_name,
            notes_driver: delivery.notes_driver,
            pod_status: delivery.pod_status,
            pod_signed_by: delivery.pod_signed_by,
            pod_signed_at: delivery.pod_signed_at,
            items: (itemsRes.data || []) as Array<{
                description: string;
                quantity: number;
            }>,
            site: siteRes.data ?? null,
        },
    };
}

export async function submitPod(
    token: string,
    input: unknown
): Promise<{ success: true } | { error: string }> {
    const validation = SubmitPodInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = createAdminClient();

    // Fetch delivery by pod_token
    const { data: delivery, error: fetchError } = await supabase
        .from('deliveries')
        .select('id, pod_status')
        .eq('pod_token', token)
        .single();

    if (fetchError || !delivery) {
        return { error: 'Invalid link' };
    }

    if (delivery.pod_status !== 'pending') {
        return { error: 'This delivery has already been processed' };
    }

    const { error } = await supabase
        .from('deliveries')
        .update({
            pod_status: 'signed',
            pod_signed_by: validation.data.signed_by,
            pod_signature_data: validation.data.signature_data,
            pod_notes: validation.data.notes ?? null,
            pod_signed_at: new Date().toISOString(),
            status: 'delivered',
            delivered_at: new Date().toISOString(),
        })
        .eq('id', delivery.id);

    if (error) {
        console.error('Error submitting POD:', error);
        return { error: 'Failed to submit proof of delivery' };
    }

    revalidatePath('/admin/deliveries');
    return { success: true };
}

export async function refusePod(
    token: string,
    notes?: string
): Promise<{ success: true } | { error: string }> {
    const supabase = createAdminClient();

    // Fetch delivery by pod_token
    const { data: delivery, error: fetchError } = await supabase
        .from('deliveries')
        .select('id, pod_status')
        .eq('pod_token', token)
        .single();

    if (fetchError || !delivery) {
        return { error: 'Invalid link' };
    }

    if (delivery.pod_status !== 'pending') {
        return { error: 'This delivery has already been processed' };
    }

    const { error } = await supabase
        .from('deliveries')
        .update({
            pod_status: 'refused',
            pod_notes: notes ?? null,
            status: 'failed',
        })
        .eq('id', delivery.id);

    if (error) {
        console.error('Error refusing POD:', error);
        return { error: 'Failed to refuse delivery' };
    }

    revalidatePath('/admin/deliveries');
    return { success: true };
}

// ---------------------------------------------------------------------------
// Planning quick-update actions
// ---------------------------------------------------------------------------

export async function assignDriverToDelivery(
    deliveryId: string,
    driverId: string | null
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = createAdminClient();

    let driverName: string | null = null;
    if (driverId) {
        const { data: driver } = await supabase
            .from('drivers')
            .select('name')
            .eq('id', driverId)
            .single();
        driverName = driver?.name ?? null;
    }

    const { error } = await supabase
        .from('deliveries')
        .update({
            driver_id: driverId,
            driver_name: driverName,
        })
        .eq('id', deliveryId);
    if (error) return { error: error.message };

    revalidatePath('/admin/planning');
    revalidatePath('/admin/deliveries');
    return { ok: true };
}

export async function rescheduleDelivery(
    deliveryId: string,
    newDate: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = createAdminClient();
    const { error } = await supabase
        .from('deliveries')
        .update({ scheduled_date: newDate })
        .eq('id', deliveryId);
    if (error) return { error: error.message };

    revalidatePath('/admin/planning');
    revalidatePath('/admin/deliveries');
    return { ok: true };
}
