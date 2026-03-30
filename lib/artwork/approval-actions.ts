'use server';

/**
 * Artwork Client Approval Server Actions
 *
 * Handles generating shareable approval links, fetching approval data
 * for the public client page, and submitting client e-signatures.
 */

import { randomBytes } from 'crypto';
import { createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
    ArtworkApproval,
    SubmitApprovalInput,
    SubmitApprovalInputSchema,
} from './approval-types';
import { ArtworkComponent, ArtworkComponentItem } from './types';

// =============================================================================
// TYPES
// =============================================================================

export interface ApprovalPackData {
    approval: ArtworkApproval;
    job: {
        id: string;
        job_name: string;
        job_reference: string;
        client_name: string | null;
        description: string | null;
        cover_image_path: string | null;
        panel_size: string | null;
        paint_colour: string | null;
        status: string;
    };
    coverImageUrl: string | null;
    components: Array<
        ArtworkComponent & {
            thumbnailUrl: string | null;
            extra_items: Array<Pick<ArtworkComponentItem, 'id' | 'label' | 'sort_order' | 'width_mm' | 'height_mm' | 'returns_mm'>>;
        }
    >;
}

// =============================================================================
// ADMIN ACTIONS
// =============================================================================

/**
 * Generate a shareable approval link for a job (admin only)
 */
export async function generateApprovalLink(
    jobId: string
): Promise<{ token: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Verify job exists
    const { data: job, error: jobError } = await supabase
        .from('artwork_jobs')
        .select('id')
        .eq('id', jobId)
        .single();

    if (jobError || !job) {
        return { error: 'job not found' };
    }

    // Revoke any existing pending approvals for this job
    await supabase
        .from('artwork_approvals')
        .update({ status: 'revoked' })
        .eq('job_id', jobId)
        .eq('status', 'pending');

    // Generate secure token
    const token = randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const { error: insertError } = await supabase
        .from('artwork_approvals')
        .insert({
            job_id: jobId,
            token,
            status: 'pending',
            expires_at: expiresAt.toISOString(),
            created_by: user.id,
        });

    if (insertError) {
        console.error('error creating approval:', insertError);
        return { error: insertError.message };
    }

    revalidatePath(`/admin/artwork/${jobId}`);
    return { token };
}

/**
 * Get the latest approval for a job (admin only)
 */
export async function getApprovalForJob(
    jobId: string
): Promise<ArtworkApproval | null> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('artwork_approvals')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

    if (error || !data) {
        return null;
    }

    return data as ArtworkApproval;
}

/**
 * Revoke an approval link (admin only)
 */
export async function revokeApproval(
    approvalId: string,
    jobId: string
): Promise<{ success: true } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('artwork_approvals')
        .update({ status: 'revoked' })
        .eq('id', approvalId);

    if (error) {
        return { error: error.message };
    }

    revalidatePath(`/admin/artwork/${jobId}`);
    return { success: true };
}

// =============================================================================
// PUBLIC ACTIONS (token-gated, no auth required)
// =============================================================================

/**
 * Fetch approval pack data by token (public access via admin client)
 */
export async function getApprovalByToken(
    token: string
): Promise<ApprovalPackData | { error: string; status: 'invalid' | 'expired' | 'approved' | 'revoked' }> {
    const supabase = createAdminClient();

    // Fetch approval record
    const { data: approval, error: approvalError } = await supabase
        .from('artwork_approvals')
        .select('*')
        .eq('token', token)
        .single();

    if (approvalError || !approval) {
        return { error: 'invalid approval link', status: 'invalid' };
    }

    // Check status
    if (approval.status === 'revoked') {
        return { error: 'this approval link has been revoked', status: 'revoked' };
    }

    if (approval.status === 'expired' || new Date(approval.expires_at) < new Date()) {
        return { error: 'this approval link has expired', status: 'expired' };
    }

    // Fetch job
    const { data: job, error: jobError } = await supabase
        .from('artwork_jobs')
        .select('id, job_name, job_reference, client_name, description, cover_image_path, panel_size, paint_colour, status')
        .eq('id', approval.job_id)
        .single();

    if (jobError || !job) {
        return { error: 'job not found', status: 'invalid' };
    }

    // Fetch signed-off components
    const { data: components } = await supabase
        .from('artwork_components')
        .select('*')
        .eq('job_id', approval.job_id)
        .not('design_signed_off_at', 'is', null)
        .order('sort_order', { ascending: true });

    const printableComponents = (components || []) as ArtworkComponent[];

    // Generate signed URLs and fetch extra items in parallel
    const enrichedComponents = await Promise.all(
        printableComponents.map(async (component) => {
            // Signed URL for thumbnail
            let thumbnailUrl: string | null = null;
            if (component.artwork_thumbnail_url) {
                const urlParts = component.artwork_thumbnail_url.split('/artwork-assets/');
                if (urlParts.length > 1) {
                    const storagePath = urlParts[1];
                    const { data } = await supabase.storage
                        .from('artwork-assets')
                        .createSignedUrl(storagePath, 3600);
                    thumbnailUrl = data?.signedUrl || null;
                }
            }

            // Fetch extra items
            const { data: items } = await supabase
                .from('artwork_component_items')
                .select('id, label, sort_order, width_mm, height_mm, returns_mm')
                .eq('component_id', component.id)
                .order('sort_order', { ascending: true });

            return {
                ...component,
                thumbnailUrl,
                extra_items: items || [],
            };
        })
    );

    // Generate signed URL for cover image if present
    let coverImageUrl: string | null = null;
    if (job.cover_image_path) {
        const { data: coverData } = await supabase.storage
            .from('artwork-assets')
            .createSignedUrl(job.cover_image_path, 3600);
        coverImageUrl = coverData?.signedUrl || null;
    }

    // If already approved, still return full data (for viewing the approved pack)
    return {
        approval: approval as ArtworkApproval,
        job,
        coverImageUrl,
        components: enrichedComponents,
    };
}

/**
 * Submit client approval with e-signature (public, token-gated)
 */
export async function submitApproval(
    token: string,
    input: SubmitApprovalInput
): Promise<{ success: true } | { error: string }> {
    const validation = SubmitApprovalInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = createAdminClient();

    // Verify token is valid and pending
    const { data: approval, error: fetchError } = await supabase
        .from('artwork_approvals')
        .select('id, status, expires_at, job_id')
        .eq('token', token)
        .single();

    if (fetchError || !approval) {
        return { error: 'invalid approval link' };
    }

    if (approval.status !== 'pending') {
        return { error: 'this approval has already been submitted' };
    }

    if (new Date(approval.expires_at) < new Date()) {
        return { error: 'this approval link has expired' };
    }

    // Submit approval
    const { error: updateError } = await supabase
        .from('artwork_approvals')
        .update({
            status: 'approved',
            client_name: validation.data.client_name,
            client_email: validation.data.client_email,
            client_company: validation.data.client_company || null,
            signature_data: validation.data.signature_data,
            approved_at: new Date().toISOString(),
        })
        .eq('id', approval.id);

    if (updateError) {
        console.error('error submitting approval:', updateError);
        return { error: 'failed to submit approval' };
    }

    revalidatePath(`/admin/artwork/${approval.job_id}`);
    return { success: true };
}
