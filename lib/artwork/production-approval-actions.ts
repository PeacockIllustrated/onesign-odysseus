'use server';

/**
 * Internal Production Sign-Off Server Actions
 *
 * Parallel pattern to approval-actions.ts but for INTERNAL production
 * review (Chris / John) rather than client artwork approval. A link is
 * minted from the admin artwork job page, shared out-of-band, and the
 * reviewer opens /production-sign-off/[token] to tick each sub-item off
 * (or request changes with a comment). Once every sub-item on a
 * component is signed, the component's rollup column is stamped.
 */

import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

// =============================================================================
// TYPES
// =============================================================================

export interface ProductionApprovalSubItem {
    id: string;
    label: string;
    sort_order: number;
    name: string | null;
    notes: string | null;
    material: string | null;
    application_method: string | null;
    finish: string | null;
    width_mm: number | null;
    height_mm: number | null;
    returns_mm: number | null;
    quantity: number;
    thumbnail_url: string | null;
    production_signed_off_at: string | null;
    production_changes_requested_at: string | null;
    production_changes_comment: string | null;
}

export interface ProductionApprovalComponent {
    id: string;
    name: string;
    component_type: string;
    sort_order: number;
    production_signed_off_at: string | null;
    thumbnail_url: string | null;
    sub_items: ProductionApprovalSubItem[];
}

export interface ProductionApprovalPack {
    approval: {
        id: string;
        token: string;
        created_at: string;
        completed_at: string | null;
        revoked_at: string | null;
    };
    job: {
        id: string;
        job_name: string;
        job_reference: string;
        client_name: string | null;
    };
    components: ProductionApprovalComponent[];
}

export type ProductionApprovalStatus =
    | 'invalid'
    | 'revoked'
    | 'completed'
    | 'active';

// =============================================================================
// ADMIN ACTIONS
// =============================================================================

/**
 * Mint a new production sign-off link for an artwork job.
 * Revokes any active (not-completed, not-revoked) prior link first so
 * there's never more than one live token per job.
 */
export async function generateProductionApprovalLink(
    jobId: string
): Promise<{ token: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = createAdminClient();

    const { data: job, error: jobError } = await supabase
        .from('artwork_jobs')
        .select('id, job_type')
        .eq('id', jobId)
        .single();

    if (jobError || !job) return { error: 'job not found' };
    if (job.job_type === 'visual_approval') {
        return { error: 'production sign-off does not apply to visual-approval jobs' };
    }

    await supabase
        .from('artwork_production_approvals')
        .update({ revoked_at: new Date().toISOString() })
        .eq('artwork_job_id', jobId)
        .is('completed_at', null)
        .is('revoked_at', null);

    const token = randomBytes(32).toString('hex');

    const { error: insertError } = await supabase
        .from('artwork_production_approvals')
        .insert({
            artwork_job_id: jobId,
            token,
            created_by: user.id,
        });

    if (insertError) {
        console.error('error creating production approval:', insertError);
        return { error: insertError.message };
    }

    revalidatePath(`/admin/artwork/${jobId}`);
    return { token };
}

export async function revokeProductionApproval(
    approvalId: string,
    jobId: string
): Promise<{ success: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = createAdminClient();

    const { error } = await supabase
        .from('artwork_production_approvals')
        .update({ revoked_at: new Date().toISOString() })
        .eq('id', approvalId);

    if (error) return { error: error.message };

    revalidatePath(`/admin/artwork/${jobId}`);
    return { success: true };
}

/**
 * Active (not revoked, not completed) production approval for a job, if any.
 * Used by the admin page to decide whether to show "mint new link" or
 * "here's the live link — copy it."
 */
export async function getActiveProductionApprovalForJob(jobId: string): Promise<
    | {
          id: string;
          token: string;
          created_at: string;
          completed_at: string | null;
          revoked_at: string | null;
      }
    | null
> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('artwork_production_approvals')
        .select('id, token, created_at, completed_at, revoked_at')
        .eq('artwork_job_id', jobId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    return data ?? null;
}

// =============================================================================
// PUBLIC ACTIONS (token-gated, NO AUTH)
// =============================================================================
//
// Same invariant as approval-actions.ts and deliveries/actions.ts:
// internal production reviewers (Chris / John) reach these through the
// /production-sign-off/[token] link. They are still Onesign staff but
// the link is bookmarkable and does not require a Supabase session —
// the 64-char hex token on artwork_production_approvals is the gate.
//
// Every action below MUST use createAdminClient() (service role) so
// writes aren't blocked by the super-admin-only RLS policies on
// artwork_production_approvals / artwork_component_items /
// artwork_components. Do not add getUser() / requireAuth() here, and
// do not introduce a middleware guarding /production-sign-off/*.
// See CLAUDE.md §3 for the wider invariant.

export async function getProductionApprovalByToken(
    token: string
): Promise<ProductionApprovalPack | { error: string; status: ProductionApprovalStatus }> {
    const supabase = createAdminClient();

    const { data: approval, error: approvalError } = await supabase
        .from('artwork_production_approvals')
        .select('id, token, artwork_job_id, created_at, completed_at, revoked_at')
        .eq('token', token)
        .single();

    if (approvalError || !approval) {
        return { error: 'invalid production sign-off link', status: 'invalid' };
    }
    if (approval.revoked_at) {
        return { error: 'this link has been revoked', status: 'revoked' };
    }

    const { data: job, error: jobError } = await supabase
        .from('artwork_jobs')
        .select('id, job_name, job_reference, client_name')
        .eq('id', approval.artwork_job_id)
        .single();

    if (jobError || !job) {
        return { error: 'job not found', status: 'invalid' };
    }

    const signAssetUrl = async (url: string | null): Promise<string | null> => {
        if (!url) return null;
        const parts = url.split('/artwork-assets/');
        if (parts.length <= 1) return null;
        const { data } = await supabase.storage
            .from('artwork-assets')
            .createSignedUrl(parts[1], 3600);
        return data?.signedUrl ?? null;
    };

    const { data: componentsRaw } = await supabase
        .from('artwork_components')
        .select(`id, name, component_type, sort_order, production_signed_off_at,
                 artwork_thumbnail_url,
                 sub_items:artwork_component_items(*)`)
        .eq('job_id', approval.artwork_job_id)
        .order('sort_order', { ascending: true });

    const components: ProductionApprovalComponent[] = await Promise.all(
        (componentsRaw ?? []).map(async (c: any) => {
            const thumbnail_url = await signAssetUrl(c.artwork_thumbnail_url ?? null);
            const subItemsRaw = (c.sub_items ?? [])
                .slice()
                .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
            const sub_items: ProductionApprovalSubItem[] = await Promise.all(
                subItemsRaw.map(async (si: any) => ({
                    id: si.id,
                    label: si.label,
                    sort_order: si.sort_order,
                    name: si.name ?? null,
                    notes: si.notes ?? null,
                    material: si.material ?? null,
                    application_method: si.application_method ?? null,
                    finish: si.finish ?? null,
                    width_mm: si.width_mm ?? null,
                    height_mm: si.height_mm ?? null,
                    returns_mm: si.returns_mm ?? null,
                    quantity: si.quantity ?? 1,
                    thumbnail_url: await signAssetUrl(si.thumbnail_url ?? null),
                    production_signed_off_at: si.production_signed_off_at ?? null,
                    production_changes_requested_at:
                        si.production_changes_requested_at ?? null,
                    production_changes_comment:
                        si.production_changes_comment ?? null,
                }))
            );
            return {
                id: c.id,
                name: c.name,
                component_type: c.component_type,
                sort_order: c.sort_order,
                production_signed_off_at: c.production_signed_off_at ?? null,
                thumbnail_url,
                sub_items,
            };
        })
    );

    return {
        approval: {
            id: approval.id,
            token: approval.token,
            created_at: approval.created_at,
            completed_at: approval.completed_at,
            revoked_at: approval.revoked_at,
        },
        job,
        components,
    };
}

/**
 * Approve a single sub-item from the production sign-off page.
 * If `material` is provided AND the sub-item's material is currently
 * blank, the value is written back to artwork_component_items.material
 * so the designer's admin view picks up what the approver filled in.
 * After the write, rolls up the parent component — if every sub-item
 * under it is now signed, stamps the component's production_signed_off_at.
 * If every component on the job is stamped, completes the approval.
 */
export async function signOffSubItemProduction(
    token: string,
    subItemId: string,
    input: { material?: string | null }
): Promise<{ success: true } | { error: string }> {
    const supabase = createAdminClient();

    const { data: approval, error: approvalError } = await supabase
        .from('artwork_production_approvals')
        .select('id, artwork_job_id, completed_at, revoked_at')
        .eq('token', token)
        .single();

    if (approvalError || !approval) return { error: 'invalid link' };
    if (approval.revoked_at) return { error: 'this link has been revoked' };
    if (approval.completed_at) return { error: 'this sign-off is already complete' };

    const { data: subItem, error: subError } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, material, production_signed_off_at, component:artwork_components!inner(job_id)')
        .eq('id', subItemId)
        .single();

    if (subError || !subItem) return { error: 'sub-item not found' };
    if ((subItem as any).component.job_id !== approval.artwork_job_id) {
        return { error: 'sub-item does not belong to this job' };
    }

    const updatePayload: Record<string, unknown> = {
        production_signed_off_at: new Date().toISOString(),
        // Clear any prior changes-requested flag — this sub-item is now OK.
        production_changes_requested_at: null,
        production_changes_comment: null,
    };

    const trimmedMaterial = input.material?.trim();
    if (trimmedMaterial && !subItem.material) {
        updatePayload.material = trimmedMaterial;
    }

    const { error: updateError } = await supabase
        .from('artwork_component_items')
        .update(updatePayload)
        .eq('id', subItemId);

    if (updateError) {
        console.error('error signing off sub-item:', updateError);
        return { error: 'failed to record sign-off' };
    }

    await rollUpComponent(supabase, subItem.component_id);
    await rollUpApproval(supabase, approval.id, approval.artwork_job_id);

    revalidatePath(`/production-sign-off/${token}`);
    revalidatePath(`/admin/artwork/${approval.artwork_job_id}`);
    return { success: true };
}

/**
 * Reject a single sub-item with a written reason. Clears any prior
 * production_signed_off_at on that sub-item (the approver changed
 * their mind) and stamps the changes-requested fields. Rolling the
 * component back up un-stamps the component-level flag if the roll-up
 * condition no longer holds.
 */
export async function requestSubItemProductionChanges(
    token: string,
    subItemId: string,
    comment: string
): Promise<{ success: true } | { error: string }> {
    const trimmed = comment?.trim();
    if (!trimmed) return { error: 'please describe what changes are needed' };
    if (trimmed.length > 2000) return { error: 'comment is too long (2000 chars max)' };

    const supabase = createAdminClient();

    const { data: approval, error: approvalError } = await supabase
        .from('artwork_production_approvals')
        .select('id, artwork_job_id, completed_at, revoked_at')
        .eq('token', token)
        .single();

    if (approvalError || !approval) return { error: 'invalid link' };
    if (approval.revoked_at) return { error: 'this link has been revoked' };
    if (approval.completed_at) return { error: 'this sign-off is already complete' };

    const { data: subItem, error: subError } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, component:artwork_components!inner(job_id)')
        .eq('id', subItemId)
        .single();

    if (subError || !subItem) return { error: 'sub-item not found' };
    if ((subItem as any).component.job_id !== approval.artwork_job_id) {
        return { error: 'sub-item does not belong to this job' };
    }

    const { error: updateError } = await supabase
        .from('artwork_component_items')
        .update({
            production_signed_off_at: null,
            production_signed_off_by: null,
            production_changes_requested_at: new Date().toISOString(),
            production_changes_comment: trimmed,
        })
        .eq('id', subItemId);

    if (updateError) {
        console.error('error requesting sub-item changes:', updateError);
        return { error: 'failed to record changes request' };
    }

    // Rolling up now may unset the component-level flag if this sub-item
    // previously had a sign-off that contributed to the rollup.
    await rollUpComponent(supabase, subItem.component_id);

    revalidatePath(`/production-sign-off/${token}`);
    revalidatePath(`/admin/artwork/${approval.artwork_job_id}`);
    return { success: true };
}

// =============================================================================
// ROLLUP HELPERS (internal)
// =============================================================================

async function rollUpComponent(
    supabase: ReturnType<typeof createAdminClient>,
    componentId: string
): Promise<void> {
    const { data: subs } = await supabase
        .from('artwork_component_items')
        .select('id, production_signed_off_at')
        .eq('component_id', componentId);

    if (!subs || subs.length === 0) return;

    const allSigned = subs.every((s) => s.production_signed_off_at);
    await supabase
        .from('artwork_components')
        .update({
            production_signed_off_at: allSigned ? new Date().toISOString() : null,
        })
        .eq('id', componentId);
}

async function rollUpApproval(
    supabase: ReturnType<typeof createAdminClient>,
    approvalId: string,
    jobId: string
): Promise<void> {
    const { data: components } = await supabase
        .from('artwork_components')
        .select('id, production_signed_off_at')
        .eq('job_id', jobId);

    if (!components || components.length === 0) return;

    const allSigned = components.every((c) => c.production_signed_off_at);
    if (allSigned) {
        await supabase
            .from('artwork_production_approvals')
            .update({ completed_at: new Date().toISOString() })
            .eq('id', approvalId)
            .is('completed_at', null);
    }
}
