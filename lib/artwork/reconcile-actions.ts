'use server';

/**
 * Artwork Reconciliation — server actions.
 *
 * Surfaces artwork jobs that were created before Phase 1 and have no org_id
 * link, and provides actions to either link them to an org or mark them as
 * explicit orphans. Used by /admin/artwork/reconcile.
 */

import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { revalidatePath } from 'next/cache';

export interface UnmatchedJobRow {
    id: string;
    job_reference: string;
    client_name_snapshot: string | null;
    created_at: string;
}

export async function listUnmatchedJobs(): Promise<UnmatchedJobRow[]> {
    await requireAdmin();
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('artwork_jobs')
        .select('id, job_reference, client_name_snapshot, created_at')
        .is('org_id', null)
        .eq('is_orphan', false)
        .order('created_at', { ascending: true });

    if (error) {
        console.error('listUnmatchedJobs failed:', error);
        return [];
    }
    return (data ?? []) as UnmatchedJobRow[];
}

const UuidSchema = z.string().uuid();

export async function linkJobToOrg(
    jobId: string,
    orgId: string
): Promise<{ ok: true } | { error: string }> {
    await requireAdmin();
    if (!UuidSchema.safeParse(jobId).success) return { error: 'invalid job id' };
    if (!UuidSchema.safeParse(orgId).success) return { error: 'invalid org id' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('artwork_jobs')
        .update({ org_id: orgId, is_orphan: false })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/admin/artwork/reconcile');
    revalidatePath('/admin/artwork');
    return { ok: true };
}

export async function markJobAsOrphan(
    jobId: string,
    orgId: string
): Promise<{ ok: true } | { error: string }> {
    await requireAdmin();
    if (!UuidSchema.safeParse(jobId).success) return { error: 'invalid job id' };
    if (!UuidSchema.safeParse(orgId).success) {
        return { error: 'org must be selected even for orphan jobs' };
    }

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('artwork_jobs')
        .update({ org_id: orgId, is_orphan: true })
        .eq('id', jobId);

    if (error) return { error: error.message };
    revalidatePath('/admin/artwork/reconcile');
    revalidatePath('/admin/artwork');
    return { ok: true };
}
