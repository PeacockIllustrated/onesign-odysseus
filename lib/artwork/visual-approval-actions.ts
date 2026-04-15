'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import {
    CreateVisualJobInputSchema,
    type CreateVisualJobInput,
} from './variant-types';

// ---------------------------------------------------------------------------
// createVisualApprovalJob
// ---------------------------------------------------------------------------

/**
 * Create a new artwork_jobs row with job_type='visual_approval'. Standalone
 * by default — org/contact/site/quote are all optional.
 */
export async function createVisualApprovalJob(
    input: CreateVisualJobInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = CreateVisualJobInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const orgId = parsed.orgId ?? null;
    const isOrphan = orgId === null;

    const { data, error } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: parsed.jobName,
            description: parsed.description ?? null,
            status: 'draft',
            job_type: 'visual_approval',
            org_id: orgId,
            contact_id: parsed.contactId ?? null,
            site_id: parsed.siteId ?? null,
            quote_id: parsed.quoteId ?? null,
            is_orphan: isOrphan,
            client_name: null,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error || !data) {
        console.error('createVisualApprovalJob error:', error);
        return { error: error?.message ?? 'Failed to create visual job' };
    }

    revalidatePath('/admin/artwork');
    if (parsed.quoteId) revalidatePath(`/admin/quotes/${parsed.quoteId}`);
    return { id: data.id };
}

// ---------------------------------------------------------------------------
// attachQuoteToVisualJob / detachQuoteFromVisualJob
// ---------------------------------------------------------------------------

export async function attachQuoteToVisualJob(
    artworkJobId: string,
    quoteId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: quote } = await supabase
        .from('quotes')
        .select('id')
        .eq('id', quoteId)
        .maybeSingle();
    if (!quote) return { error: 'quote not found' };

    const { error } = await supabase
        .from('artwork_jobs')
        .update({ quote_id: quoteId })
        .eq('id', artworkJobId)
        .eq('job_type', 'visual_approval');
    if (error) return { error: error.message };

    revalidatePath(`/admin/artwork/${artworkJobId}`);
    revalidatePath(`/admin/quotes/${quoteId}`);
    return { ok: true };
}

export async function detachQuoteFromVisualJob(
    artworkJobId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    // Get the current quote_id so we can revalidate that page too.
    const { data: existing } = await supabase
        .from('artwork_jobs')
        .select('quote_id')
        .eq('id', artworkJobId)
        .maybeSingle();

    const { error } = await supabase
        .from('artwork_jobs')
        .update({ quote_id: null })
        .eq('id', artworkJobId)
        .eq('job_type', 'visual_approval');
    if (error) return { error: error.message };

    revalidatePath(`/admin/artwork/${artworkJobId}`);
    if (existing?.quote_id) revalidatePath(`/admin/quotes/${existing.quote_id}`);
    return { ok: true };
}
