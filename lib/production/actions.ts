// lib/production/actions.ts
'use server';

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import type { JobDetail, JobPriority, ProductionJob } from './types';
import { getJobDetail, getAcceptedQuotesWithoutJobs, getShopFloorQueue } from './queries';

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

/** Fetch jobs for shop floor queue — callable from ShopFloorClient */
export async function getShopFloorJobsAction(stageSlug: string): Promise<ProductionJob[]> {
    return getShopFloorQueue(stageSlug);
}

// =============================================================================
// createJobFromQuote
// =============================================================================

export async function createJobFromQuote(
    quoteId: string,
    orgId: string
): Promise<{ id: string; jobNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: quote, error: quoteError } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_name, status')
        .eq('id', quoteId)
        .single();

    if (quoteError || !quote) return { error: 'Quote not found' };
    if (quote.status !== 'accepted') return { error: 'Quote must be accepted before creating a job' };

    const { data: existingJob } = await supabase
        .from('production_jobs')
        .select('id')
        .eq('quote_id', quoteId)
        .maybeSingle();

    if (existingJob) return { error: 'A production job already exists for this quote' };

    const { data: designStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'design')
        .is('org_id', null)
        .single();

    if (!designStage) return { error: 'Design stage not found — run migration 024 first' };

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
            org_id: orgId,
            quote_id: quoteId,
            title,
            client_name: quote.customer_name || quote.quote_number,
            current_stage_id: designStage.id,
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
            items.map((item: { id: string; item_type: string | null }) => ({
                job_id: newJob.id,
                quote_item_id: item.id,
                description: item.item_type === 'panel_letters_v1' ? 'Panel + Letters' : item.item_type,
                quantity: 1,
                current_stage_id: designStage.id,
                status: 'pending',
            }))
        );
        if (itemsError) {
            console.error('createJobFromQuote items insert error:', itemsError);
            // Job was created — don't rollback, but log the failure
        }
    }

    await supabase.from('job_stage_log').insert({
        job_id: newJob.id,
        from_stage_id: null,
        to_stage_id: designStage.id,
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
}): Promise<{ id: string; jobNumber: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: designStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'design')
        .is('org_id', null)
        .single();

    if (!designStage) return { error: 'Design stage not found — run migration 024 first' };

    const { data: newJob, error } = await supabase
        .from('production_jobs')
        .insert({
            org_id: input.orgId,
            title: input.title,
            client_name: input.clientName,
            description: input.description || null,
            current_stage_id: designStage.id,
            priority: input.priority,
            status: 'active',
            due_date: input.dueDate || null,
            assigned_initials: input.assignedInitials || null,
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
        to_stage_id: designStage.id,
        moved_by: user.id,
        moved_by_name: user.email ?? null,
        notes: 'Job created manually',
    });

    revalidatePath('/admin/jobs');
    return { id: newJob.id, jobNumber: newJob.job_number };
}

// =============================================================================
// moveJobToStage
// =============================================================================

export async function moveJobToStage(
    jobId: string,
    stageId: string,
    notes?: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: job } = await supabase
        .from('production_jobs')
        .select('current_stage_id')
        .eq('id', jobId)
        .single();

    if (!job) return { error: 'Job not found' };

    const { error } = await supabase
        .from('production_jobs')
        .update({ current_stage_id: stageId })
        .eq('id', jobId);

    if (error) return { error: error.message };

    await supabase.from('job_stage_log').insert({
        job_id: jobId,
        from_stage_id: job.current_stage_id,
        to_stage_id: stageId,
        moved_by: user.id,
        moved_by_name: user.email ?? null,
        notes: notes || null,
    });

    revalidatePath('/admin/jobs');
    return { success: true };
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

    revalidatePath('/admin/jobs');
    return { success: true };
}

// =============================================================================
// startJob / pauseJob / completeJob (shop floor actions)
// =============================================================================

export async function startJob(jobId: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ status: 'active' })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    return { success: true };
}

export async function pauseJob(jobId: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ status: 'paused' })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    return { success: true };
}

export async function completeJob(
    jobId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    // Get dispatch stage
    const { data: dispatchStage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'dispatch')
        .is('org_id', null)
        .single();

    const updates: Record<string, unknown> = {
        status: 'completed',
        completed_at: new Date().toISOString(),
    };
    if (dispatchStage) updates.current_stage_id = dispatchStage.id;

    const { error } = await supabase
        .from('production_jobs')
        .update(updates)
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/shop-floor');
    revalidatePath('/admin/jobs');
    return { success: true };
}

// =============================================================================
// advanceJobToNextStage (shop floor "Complete" button)
// =============================================================================

export async function advanceJobToNextStage(
    jobId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();

    const { data: job } = await supabase
        .from('production_jobs')
        .select('current_stage_id')
        .eq('id', jobId)
        .single();

    if (!job?.current_stage_id) return { error: 'Job has no current stage' };

    const { data: currentStage } = await supabase
        .from('production_stages')
        .select('sort_order')
        .eq('id', job.current_stage_id)
        .single();

    if (!currentStage) return { error: 'Stage not found' };

    const { sort_order } = currentStage as { sort_order: number };

    const { data: nextStage } = await supabase
        .from('production_stages')
        .select('id')
        .is('org_id', null)
        .eq('sort_order', sort_order + 1)
        .single();

    if (!nextStage) {
        // Already at last stage — mark complete
        return completeJob(jobId);
    }

    return moveJobToStage(jobId, nextStage.id, 'Advanced from shop floor');
}

// =============================================================================
// updateJobPriority / updateJobAssignment
// =============================================================================

export async function updateJobPriority(
    jobId: string,
    priority: JobPriority
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ priority })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/admin/jobs');
    return { success: true };
}

export async function updateJobAssignment(
    jobId: string,
    initials: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('production_jobs')
        .update({ assigned_initials: initials || null })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/admin/jobs');
    return { success: true };
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
