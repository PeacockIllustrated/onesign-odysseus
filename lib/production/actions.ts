// lib/production/actions.ts
'use server';

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type {
    JobDetail,
    JobPriority,
    JobItemWithJob,
    JobItem,
    ProductionStage,
    JobStageLog,
    DepartmentInstruction,
    WorkCentre,
} from './types';
import {
    CreateManualJobInputSchema,
    ItemRoutingSchema,
} from './types';
import { z } from 'zod';
import { getJobDetail, getAcceptedQuotesWithoutJobs, getShopFloorQueue, getProductionStages } from './queries';

// =============================================================================
// JobItemDetailResult type
// =============================================================================

type JobItemDetailResult = JobItemWithJob & {
    stage_log: Array<JobStageLog & {
        to_stage: ProductionStage | null;
        from_stage: ProductionStage | null;
    }>;
    instructions: Array<DepartmentInstruction & {
        stage: ProductionStage | null;
    }>;
    work_centres: WorkCentre[];
};

// =============================================================================
// SERVER ACTIONS EXPOSED TO CLIENT COMPONENTS
// =============================================================================

/** Fetch full job detail — callable from client components */
export async function getJobDetailAction(jobId: string): Promise<JobDetail | null> {
    return getJobDetail(jobId);
}

/** Fetch accepted quotes without jobs — callable from CreateJobModal */
export async function getAcceptedQuotesAction(): Promise<
    Array<{ id: string; quote_number: string; customer_name: string | null }>
> {
    return getAcceptedQuotesWithoutJobs();
}

/** Fetch org list for job creation forms */
export async function getOrgListAction(): Promise<Array<{ id: string; name: string }>> {
    const supabase = await createServerClient();
    const { data } = await supabase
        .from('orgs')
        .select('id, name')
        .order('name', { ascending: true });
    return (data || []) as Array<{ id: string; name: string }>;
}

/** Fetch production stages — callable from client components */
export async function getProductionStagesAction(): Promise<ProductionStage[]> {
    return getProductionStages();
}

// Helper: derive a human-readable description for a quote item
function deriveItemDescription(item: any, index: number): string {
    const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const label = LETTERS[index] ?? `${index + 1}`;
    const itemType = item.item_type === 'panel_letters_v1' ? 'Panel + Letters' : (item.item_type || 'Item');
    const output = item.output_json as any;
    const dims =
        output?.derived?.adjusted_width_mm && output?.derived?.adjusted_height_mm
            ? `${output.derived.adjusted_width_mm}×${output.derived.adjusted_height_mm}mm`
            : null;
    return dims ? `${label}: ${itemType} (${dims})` : `${label}: ${itemType}`;
}

/** Fetch quote items with derived descriptions for routing configuration */
export async function getQuoteItemsForRoutingAction(
    quoteId: string
): Promise<Array<{ id: string; description: string; item_type: string | null }>> {
    const supabase = await createServerClient();
    const { data } = await supabase
        .from('quote_items')
        .select('id, item_type, output_json')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

    return (data || []).map((item: any, index: number) => ({
        id: item.id,
        description: deriveItemDescription(item, index),
        item_type: item.item_type,
    }));
}

/** Fetch items for shop floor queue — callable from ShopFloorClient */
export async function getShopFloorJobsAction(stageSlug: string): Promise<JobItemWithJob[]> {
    return getShopFloorQueue(stageSlug);
}

// =============================================================================
// createJobFromQuote
// =============================================================================

const ITEM_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const CreateJobFromQuoteArgsSchema = z.object({
    quoteId: z.string().uuid(),
    orgId: z.string().uuid(),
    itemRoutings: z.array(ItemRoutingSchema).max(200).optional(),
});

export async function createJobFromQuote(
    quoteId: string,
    orgId: string,
    itemRoutings?: Array<{ quoteItemId: string; stageIds: string[]; description: string }>
): Promise<{ id: string; jobNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = CreateJobFromQuoteArgsSchema.safeParse({ quoteId, orgId, itemRoutings });
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = await createServerClient();

    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_name, status, org_id, contact_id, site_id')
        .eq('id', quoteId)
        .single();

    if (quoteError || !quote) return { error: 'Quote not found' };
    if (quote.status !== 'accepted') return { error: 'Quote must be accepted before creating a job' };

    // Use quote.org_id if set, otherwise fall back to passed orgId
    const effectiveOrgId = (quote as any).org_id || orgId;

    const { data: existingJob } = await supabase
        .from('production_jobs')
        .select('id')
        .eq('quote_id', quoteId)
        .maybeSingle();

    if (existingJob) return { error: 'A production job already exists for this quote' };

    const { data: orderBookStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'order-book')
        .is('org_id', null)
        .single();

    if (!orderBookStage) return { error: 'Order Book stage not found — run migration 028 first' };

    // Minimum safety-net routing. Stage-routing normally gets rebuilt from
    // artwork sub-item target_stage_ids on completeArtworkAndAdvanceItem,
    // but if staff advance an item before that (directly from the Kanban),
    // a missing routing silently short-circuits the item to "completed".
    // Seeding order-book → artwork-approval → goods-out guarantees a
    // sensible forward path until the real routing is written on release.
    const { data: artworkStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'artwork-approval')
        .is('org_id', null)
        .single();
    const { data: goodsOutStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'goods-out')
        .is('org_id', null)
        .single();

    const minimumRouting: string[] = [orderBookStage.id];
    if (artworkStage) minimumRouting.push(artworkStage.id);
    if (goodsOutStage) minimumRouting.push(goodsOutStage.id);

    const { data: quoteItems } = await supabase
        .from('quote_items')
        .select('id, item_type')
        .eq('quote_id', quoteId)
        .order('created_at', { ascending: true });

    const items = quoteItems || [];
    const title = quote.customer_name
        ? `${quote.customer_name} — ${quote.quote_number}`
        : quote.quote_number;

    const { data: newJob, error: jobError } = await supabase
        .from('production_jobs')
        .insert({
            org_id: effectiveOrgId,
            quote_id: quoteId,
            contact_id: (quote as any).contact_id || null,
            site_id: (quote as any).site_id || null,
            title,
            client_name: quote.customer_name || quote.quote_number,
            current_stage_id: orderBookStage.id,
            priority: 'normal',
            status: 'active',
            total_items: items.length || 1,
        })
        .select('id, job_number')
        .single();

    if (jobError || !newJob) {
        console.error('createJobFromQuote error:', jobError);
        return { error: jobError?.message || 'Failed to create job' };
    }

    if (items.length > 0) {
        const { error: itemsError } = await supabase.from('job_items').insert(
            items.map((item: { id: string; item_type: string | null }, index: number) => {
                const itemRouting = itemRoutings?.find(r => r.quoteItemId === item.id);
                const stageRouting = itemRouting
                    ? [orderBookStage.id, ...itemRouting.stageIds.filter(id => id !== orderBookStage.id)]
                    : minimumRouting;
                const description = itemRouting?.description
                    ?? (item.item_type === 'panel_letters_v1' ? 'Panel + Letters' : item.item_type)
                    ?? 'Item';
                return {
                    job_id: newJob.id,
                    quote_item_id: item.id,
                    item_number: ITEM_LETTERS[index] ?? `${index + 1}`,
                    description,
                    quantity: 1,
                    current_stage_id: orderBookStage.id,
                    status: 'pending',
                    stage_routing: stageRouting,
                };
            })
        );
        if (itemsError) {
            console.error('createJobFromQuote items insert error:', itemsError);
            // Job was created — don't rollback, but log the failure
        }
    }

    await supabase.from('job_stage_log').insert({
        job_id: newJob.id,
        from_stage_id: null,
        to_stage_id: orderBookStage.id,
        moved_by: user.id,
        moved_by_name: user.email ?? null,
        notes: `Job created from quote ${quote.quote_number}`,
    });

    revalidatePath('/admin/jobs');
    revalidatePath(`/admin/quotes/${quoteId}`);
    return { id: newJob.id, jobNumber: newJob.job_number };
}

// =============================================================================
// createManualJob
// =============================================================================

export async function createManualJob(input: {
    orgId: string;
    title: string;
    clientName: string;
    description?: string;
    priority: JobPriority;
    dueDate?: string;
    assignedInitials?: string;
    contactId?: string;
    siteId?: string;
}): Promise<{ id: string; jobNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = CreateManualJobInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: orderBookStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'order-book')
        .is('org_id', null)
        .single();

    if (!orderBookStage) return { error: 'Order Book stage not found — run migration 028 first' };

    const { data: newJob, error } = await supabase
        .from('production_jobs')
        .insert({
            org_id: parsed.orgId,
            title: parsed.title,
            client_name: parsed.clientName,
            description: parsed.description || null,
            contact_id: parsed.contactId || null,
            site_id: parsed.siteId || null,
            current_stage_id: orderBookStage.id,
            priority: parsed.priority,
            status: 'active',
            due_date: parsed.dueDate || null,
            assigned_initials: parsed.assignedInitials || null,
            total_items: 1,
        })
        .select('id, job_number')
        .single();

    if (error || !newJob) {
        console.error('createManualJob error:', error);
        return { error: error?.message || 'Failed to create job' };
    }

    await supabase.from('job_stage_log').insert({
        job_id: newJob.id,
        from_stage_id: null,
        to_stage_id: orderBookStage.id,
        moved_by: user.id,
        moved_by_name: user.email ?? null,
        notes: 'Job created manually',
    });

    revalidatePath('/admin/jobs');
    return { id: newJob.id, jobNumber: newJob.job_number };
}

// =============================================================================
// moveJobItemToStage
// =============================================================================

export async function moveJobItemToStage(
    jobItemId: string,
    stageId: string,
    notes?: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: item } = await supabase
        .from('job_items')
        .select('job_id, current_stage_id')
        .eq('id', jobItemId)
        .single();

    if (!item) return { error: 'Item not found' };

    const { error } = await supabase
        .from('job_items')
        .update({ current_stage_id: stageId, status: 'in_progress' })
        .eq('id', jobItemId);

    if (error) return { error: error.message };

    const { job_id, current_stage_id: fromStageId } = item as { job_id: string; current_stage_id: string | null };

    await supabase.from('job_stage_log').insert({
        job_id,
        job_item_id: jobItemId,
        from_stage_id: fromStageId,
        to_stage_id: stageId,
        moved_by: user.id,
        moved_by_name: user.email ?? null,
        notes: notes || null,
    });

    // Auto-create artwork job if moving to an approval stage
    const { data: targetStage } = await supabase
        .from('production_stages')
        .select('is_approval_stage')
        .eq('id', stageId)
        .single();

    if (targetStage?.is_approval_stage) {
        // Check if artwork job already exists for this item
        const { data: existingArtwork } = await supabase
            .from('artwork_jobs')
            .select('id')
            .eq('job_item_id', jobItemId)
            .maybeSingle();

        if (!existingArtwork) {
            // Fetch item + parent job context for naming
            const { data: itemContext } = await supabase
                .from('job_items')
                .select('description, job_id, production_jobs!inner(client_name, job_number, org_id)')
                .eq('id', jobItemId)
                .single();

            if (itemContext) {
                const pj = (itemContext as any).production_jobs;
                await supabase.from('artwork_jobs').insert({
                    job_name: (itemContext as any).description || `Artwork for ${pj.job_number}`,
                    client_name: pj.client_name,
                    job_item_id: jobItemId,
                    org_id: pj.org_id || null,
                    status: 'draft',
                    created_by: user.id,
                });
                revalidatePath('/admin/artwork');
            }
        }
    }

    revalidatePath('/admin/jobs');
    return { success: true };
}

// =============================================================================
// startItem / pauseItem / advanceItemToNextRoutedStage (item-centric shop floor actions)
// =============================================================================

export async function startItem(itemId: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('job_items')
        .update({ status: 'in_progress' })
        .eq('id', itemId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    return { success: true };
}

export async function pauseItem(itemId: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('job_items')
        .update({ status: 'pending' })
        .eq('id', itemId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    return { success: true };
}

export async function advanceItemToNextRoutedStage(
    itemId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: item } = await supabase
        .from('job_items')
        .select('id, job_id, current_stage_id, stage_routing, status')
        .eq('id', itemId)
        .single();

    if (!item) return { error: 'Item not found' };

    const routing = (item.stage_routing as string[] | null) ?? [];
    const currentIdx = routing.indexOf(item.current_stage_id ?? '');

    if (currentIdx >= 0 && currentIdx < routing.length - 1) {
        // Advance to next stage in routing
        const nextStageId = routing[currentIdx + 1];
        const moveResult = await moveJobItemToStage(itemId, nextStageId, 'Advanced from shop floor');
        if ('error' in moveResult) return moveResult;

        // Reset status to pending for the next department
        await supabase
            .from('job_items')
            .update({ status: 'pending' })
            .eq('id', itemId);

        revalidatePath('/shop-floor');
        return { success: true };
    } else {
        // At last stage in routing, or no routing / stage not found in routing — complete item.
        // Log a warning if routing is empty/missing — this usually means the item
        // was advanced before Release to Production rebuilt the routing (finding #18).
        if (routing.length === 0 || currentIdx < 0) {
            console.warn(
                `advanceItemToNextRoutedStage: item ${itemId} has empty or mismatched routing ` +
                `(routing length=${routing.length}, currentIdx=${currentIdx}). Completing item as fallback.`
            );
        }
        await supabase
            .from('job_items')
            .update({ status: 'completed' })
            .eq('id', itemId);

        // No stage_log entry here — the item's entry into this stage was already
        // recorded by moveJobItemToStage. Completion is captured by status = 'completed'
        // on job_items. A from_stage_id === to_stage_id log entry would be misleading.

        // Check if all items in the job are now completed
        const { count } = await supabase
            .from('job_items')
            .select('*', { count: 'exact', head: true })
            .eq('job_id', item.job_id)
            .neq('status', 'completed');

        if (count === 0) {
            await supabase
                .from('production_jobs')
                .update({ status: 'completed', completed_at: new Date().toISOString() })
                .eq('id', item.job_id);

            await supabase.from('job_stage_log').insert({
                job_id: item.job_id,
                job_item_id: null,
                from_stage_id: null,
                to_stage_id: item.current_stage_id,
                moved_by: user.id,
                moved_by_name: user.email ?? null,
                notes: 'All items completed — job marked complete',
            });

            // Auto-create a scheduled delivery so the completed job doesn't
            // just sit there waiting for admin to remember the next step.
            // Idempotent — safe if admin already created one manually.
            // Dynamic import to avoid a circular dep between production +
            // deliveries action modules.
            try {
                const { autoCreateDeliveryForCompletedJob } = await import('@/lib/deliveries/actions');
                const result = await autoCreateDeliveryForCompletedJob(item.job_id);
                if ('error' in result) {
                    console.error('Auto-create delivery failed for job', item.job_id, result.error);
                }
            } catch (err) {
                console.error('Auto-create delivery threw for job', item.job_id, err);
            }

            revalidatePath('/admin/jobs');
            revalidatePath('/admin/deliveries');
        }

        revalidatePath('/shop-floor');
        return { success: true };
    }
}

// =============================================================================
// addDepartmentInstruction
// =============================================================================

export async function addDepartmentInstruction(
    jobId: string,
    stageId: string,
    instruction: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('department_instructions')
        .insert({ job_id: jobId, stage_id: stageId, instruction, created_by: user.id });

    if (error) return { error: error.message };
    revalidatePath('/admin/jobs');
    return { success: true };
}

// =============================================================================
// getJobItemDetailAction
// =============================================================================

export async function getJobItemDetailAction(itemId: string): Promise<JobItemDetailResult | null> {
    const user = await getUser();
    if (!user) return null;

    const supabase = await createServerClient();

    // Step 1: Fetch the item with parent job context
    const { data: rawItem, error: itemError } = await supabase
        .from('job_items')
        .select(`
            *,
            production_jobs!inner(
                id, job_number, client_name, title, priority, due_date, org_id
            )
        `)
        .eq('id', itemId)
        .single();

    if (itemError || !rawItem) return null;

    const item = rawItem as any;
    const jobId: string = item.job_id;

    // Step 2: Parallel fetches now that we have the job_id
    const [
        { data: stageLog },
        { data: instructions },
        { data: workCentres },
        { data: currentStageData },
    ] = await Promise.all([
        supabase
            .from('job_stage_log')
            .select('*')
            .or(`job_item_id.eq.${itemId},and(job_id.eq.${jobId},job_item_id.is.null)`)
            .order('moved_at', { ascending: false }),
        supabase
            .from('department_instructions')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true }),
        item.current_stage_id
            ? supabase
                .from('work_centres')
                .select('*')
                .eq('stage_id', item.current_stage_id)
                .order('sort_order', { ascending: true })
            : Promise.resolve({ data: [] }),
        item.current_stage_id
            ? supabase.from('production_stages').select('*').eq('id', item.current_stage_id).single()
            : Promise.resolve({ data: null }),
    ]);

    // Look up linked artwork job (if any)
    const { data: linkedArtwork } = await supabase
        .from('artwork_jobs')
        .select('id')
        .eq('job_item_id', itemId)
        .maybeSingle();

    const currentWorkCentre = item.work_centre_id
        ? ((workCentres || []) as WorkCentre[]).find(wc => wc.id === item.work_centre_id) ?? null
        : null;

    // Resolve stage IDs referenced in log entries and instructions
    const allStageIds = new Set<string>();
    (stageLog || []).forEach((l: any) => {
        if (l.to_stage_id) allStageIds.add(l.to_stage_id);
        if (l.from_stage_id) allStageIds.add(l.from_stage_id);
    });
    (instructions || []).forEach((i: any) => {
        if (i.stage_id) allStageIds.add(i.stage_id);
    });

    let stagesById = new Map<string, ProductionStage>();
    if (allStageIds.size > 0) {
        const { data: stagesData } = await supabase
            .from('production_stages')
            .select('*')
            .in('id', Array.from(allStageIds));
        (stagesData || []).forEach((s: any) => stagesById.set(s.id, s as ProductionStage));
    }

    const jobItemBase: JobItem = {
        id: item.id,
        job_id: item.job_id,
        quote_item_id: item.quote_item_id,
        description: item.description,
        quantity: item.quantity,
        current_stage_id: item.current_stage_id,
        status: item.status,
        notes: item.notes,
        created_at: item.created_at,
        item_number: item.item_number,
        stage_routing: item.stage_routing || [],
        work_centre_id: item.work_centre_id,
    };

    return {
        ...jobItemBase,
        artwork_job_id: linkedArtwork?.id ?? null,
        stage: currentStageData as ProductionStage | null,
        work_centre: currentWorkCentre,
        job: {
            id: item.production_jobs.id,
            job_number: item.production_jobs.job_number,
            client_name: item.production_jobs.client_name,
            title: item.production_jobs.title,
            priority: item.production_jobs.priority,
            due_date: item.production_jobs.due_date,
            org_id: item.production_jobs.org_id,
        },
        stage_log: (stageLog || []).map((l: any) => ({
            ...(l as JobStageLog),
            to_stage: stagesById.get(l.to_stage_id) ?? null,
            from_stage: l.from_stage_id ? stagesById.get(l.from_stage_id) ?? null : null,
        })),
        instructions: (instructions || []).map((i: any) => ({
            ...(i as DepartmentInstruction),
            stage: stagesById.get(i.stage_id) ?? null,
        })),
        work_centres: (workCentres || []) as WorkCentre[],
    };
}

// =============================================================================
// setItemWorkCentre
// =============================================================================

export async function setItemWorkCentre(
    itemId: string,
    workCentreId: string | null
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('job_items')
        .update({ work_centre_id: workCentreId })
        .eq('id', itemId);

    if (error) return { error: error.message };
    revalidatePath('/admin/jobs');
    return { success: true };
}
