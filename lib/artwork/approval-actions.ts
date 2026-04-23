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
    ArtworkComponentDecision,
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
        job_type: string | null;
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
            /**
             * Client-facing spec rows. One per distinct material/method on this
             * component. Enough detail to remove ambiguity about what the
             * client is approving (e.g. "Frosted Vinyl" vs "White Vinyl") —
             * but intentionally not the production-internal fields (tolerance,
             * sign-off timestamps, target department).
             */
            sub_items: Array<{
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
            }>;
            variants?: Array<{
                id: string;
                component_id: string;
                label: string;
                sort_order: number;
                name: string | null;
                description: string | null;
                thumbnail_url: string | null;
                material: string | null;
                application_method: string | null;
                finish: string | null;
                width_mm: number | null;
                height_mm: number | null;
                returns_mm: number | null;
                is_chosen: boolean;
                chosen_at: string | null;
                notes: string | null;
            }>;
            /** Legacy alias; same rows as sub_items. Kept for backwards-compat. */
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

    // Verify job exists + pull linked contact + site for the snapshot
    const { data: job, error: jobError } = await supabase
        .from('artwork_jobs')
        .select('id, contact_id, site_id')
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

    // Build snapshot: freeze contact + site at link-generation time so the
    // signed approval remains a faithful record even if the org data changes.
    let snapshotContactName: string | null = null;
    let snapshotContactEmail: string | null = null;
    let snapshotSiteName: string | null = null;
    let snapshotSiteAddress: string | null = null;

    if (job.contact_id) {
        const { data: c } = await supabase
            .from('contacts')
            .select('first_name, last_name, email')
            .eq('id', job.contact_id)
            .single();
        if (c) {
            snapshotContactName = [c.first_name, c.last_name].filter(Boolean).join(' ') || null;
            snapshotContactEmail = c.email ?? null;
        }
    }
    if (job.site_id) {
        const { data: s } = await supabase
            .from('org_sites')
            .select('name, address_line_1, address_line_2, city, county, postcode, country')
            .eq('id', job.site_id)
            .single();
        if (s) {
            snapshotSiteName = s.name ?? null;
            snapshotSiteAddress = [
                s.address_line_1,
                s.address_line_2,
                s.city,
                s.county,
                s.postcode,
                s.country,
            ]
                .filter(Boolean)
                .join('\n') || null;
        }
    }

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
            snapshot_contact_name: snapshotContactName,
            snapshot_contact_email: snapshotContactEmail,
            snapshot_site_name: snapshotSiteName,
            snapshot_site_address: snapshotSiteAddress,
        });

    if (insertError) {
        console.error('error creating approval:', insertError);
        return { error: insertError.message };
    }

    revalidatePath(`/admin/artwork/${jobId}`);
    return { token };
}

/**
 * Latest per-sub-item (and per-component fallback) decisions for a job.
 *
 * Returns two maps from the most recent non-pending approval:
 *   * bySubItem    — keyed by sub_item_id, the fine-grained decisions
 *   * byComponent  — keyed by component_id, only populated for components
 *                    that have no sub-items (fallback)
 */
export async function getComponentDecisionsForJob(
    jobId: string
): Promise<{
    bySubItem: Record<string, ArtworkComponentDecision>;
    byComponent: Record<string, ArtworkComponentDecision>;
}> {
    const supabase = await createServerClient();
    const { data: latest } = await supabase
        .from('artwork_approvals')
        .select('id')
        .eq('job_id', jobId)
        .in('status', ['approved', 'changes_requested'])
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    if (!latest) return { bySubItem: {}, byComponent: {} };

    const { data: rows } = await supabase
        .from('artwork_component_decisions')
        .select('*')
        .eq('approval_id', latest.id);

    const bySubItem: Record<string, ArtworkComponentDecision> = {};
    const byComponent: Record<string, ArtworkComponentDecision> = {};
    for (const r of (rows ?? []) as ArtworkComponentDecision[]) {
        if (r.sub_item_id) bySubItem[r.sub_item_id] = r;
        else byComponent[r.component_id] = r;
    }
    return { bySubItem, byComponent };
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
        .select('id, job_name, job_reference, job_type, client_name, description, cover_image_path, panel_size, paint_colour, status')
        .eq('id', approval.job_id)
        .single();

    if (jobError || !job) {
        return { error: 'job not found', status: 'invalid' };
    }

    // Helper: sign a public artwork-assets URL (bucket is private)
    const signAssetUrl = async (url: string | null): Promise<string | null> => {
        if (!url) return null;
        const parts = url.split('/artwork-assets/');
        if (parts.length <= 1) return null;
        const { data } = await supabase.storage
            .from('artwork-assets')
            .createSignedUrl(parts[1], 3600);
        return data?.signedUrl ?? null;
    };

    // Pull every component + its sub-items in one go. A component is
    // "showable" to the client when at least one of its sub-items has a
    // design sign-off — or the legacy component-level field is set, for
    // jobs predating the sub-items refactor.
    const { data: allComponents } = await supabase
        .from('artwork_components')
        .select(`*, sub_items:artwork_component_items(*), variants:artwork_variants(*)`)
        .eq('job_id', approval.job_id)
        .order('sort_order', { ascending: true });

    // Visual approvals: a component is showable as soon as it has ≥ 1
    // variant attached — there is no designer sign-off step, the client
    // is the one approving the concept by picking a variant.
    // Production approvals (default): a component is showable when a
    // sub-item has been signed off (or the legacy component-level flag).
    const printableComponents = (allComponents || []).filter((c: any) => {
        if (job.job_type === 'visual_approval') {
            return (c.variants ?? []).length > 0;
        }
        if (c.design_signed_off_at) return true;
        return (c.sub_items || []).some((si: any) => si.design_signed_off_at);
    });

    const enrichedComponents = await Promise.all(
        printableComponents.map(async (component: any) => {
            const thumbnailUrl = await signAssetUrl(component.artwork_thumbnail_url);

            // Sub-items: project to client-safe fields, sign per-item thumbnails.
            const subItemsRaw = (component.sub_items ?? [])
                .slice()
                .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const sub_items = await Promise.all(
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
                }))
            );

            const variantsRaw = ((component as any).variants ?? [])
                .slice()
                .sort((a: any, b: any) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

            const variants = await Promise.all(
                variantsRaw.map(async (v: any) => ({
                    ...v,
                    thumbnail_url: await signAssetUrl(v.thumbnail_url ?? null),
                }))
            );

            return {
                ...component,
                thumbnailUrl,
                sub_items,
                variants,
                // legacy alias
                extra_items: subItemsRaw.map((si: any) => ({
                    id: si.id,
                    label: si.label,
                    sort_order: si.sort_order,
                    width_mm: si.width_mm,
                    height_mm: si.height_mm,
                    returns_mm: si.returns_mm,
                })),
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

    // For visual_approval jobs: validate selections BEFORE any mutation so a
    // bad payload cannot leave the approval row stuck in 'approved' state
    // with no variants chosen.
    const { data: job } = await supabase
        .from('artwork_jobs')
        .select('id, job_type, status')
        .eq('id', approval.job_id)
        .maybeSingle();

    if (job?.job_type === 'visual_approval') {
        const selections = validation.data.variant_selections ?? [];
        if (selections.length === 0) {
            return { error: 'visual approval requires variant selections' };
        }

        // Validate every component on the job has a selection.
        const { data: components } = await supabase
            .from('artwork_components')
            .select('id')
            .eq('job_id', approval.job_id);
        const componentIds = new Set((components ?? []).map((c: any) => c.id));
        const selectedComponents = new Set(selections.map((s) => s.componentId));
        for (const cid of componentIds) {
            if (!selectedComponents.has(cid)) {
                return { error: `component ${cid} has no chosen variant` };
            }
        }
    }

    // Per-sub-item decisions. A component with sub-items requires one decision
    // per sub-item; a component with no sub-items takes a single component-level
    // decision. If any decision is changes_requested, the whole approval lands
    // in 'changes_requested' and release-to-production stays blocked.
    const decisions = validation.data.component_decisions ?? [];
    let overallStatus: 'approved' | 'changes_requested' = 'approved';
    if (job?.job_type !== 'visual_approval') {
        const { data: jobComponents } = await supabase
            .from('artwork_components')
            .select('id, sub_items:artwork_component_items(id)')
            .eq('job_id', approval.job_id);

        const decidedSubItems = new Set(
            decisions.filter((d) => d.subItemId).map((d) => d.subItemId as string)
        );
        const decidedComponentsOnly = new Set(
            decisions.filter((d) => !d.subItemId).map((d) => d.componentId)
        );

        for (const c of (jobComponents ?? []) as any[]) {
            const subs = (c.sub_items ?? []) as Array<{ id: string }>;
            if (subs.length > 0) {
                for (const si of subs) {
                    if (!decidedSubItems.has(si.id)) {
                        return { error: 'every sub-item must be approved or have changes requested' };
                    }
                }
            } else if (!decidedComponentsOnly.has(c.id)) {
                return { error: 'every component must be approved or have changes requested' };
            }
        }

        if (decisions.some((d) => d.decision === 'changes_requested')) {
            overallStatus = 'changes_requested';
        }
    }

    // Submit approval
    const { error: updateError } = await supabase
        .from('artwork_approvals')
        .update({
            status: overallStatus,
            client_name: validation.data.client_name,
            client_email: validation.data.client_email,
            client_company: validation.data.client_company || null,
            signature_data: validation.data.signature_data,
            client_comments: validation.data.client_comments?.trim() || null,
            approved_at: overallStatus === 'approved' ? new Date().toISOString() : null,
        })
        .eq('id', approval.id);

    if (updateError) {
        console.error('error submitting approval:', updateError);
        return { error: 'failed to submit approval' };
    }

    // Write per-sub-item (or per-component) decisions. The uniqueness
    // constraint on (approval_id, sub_item_id|component_id) is enforced
    // by two partial indexes (migration 053), so we clear-then-insert
    // within this approval rather than trying to express both in a
    // single onConflict target.
    if (decisions.length > 0) {
        await supabase
            .from('artwork_component_decisions')
            .delete()
            .eq('approval_id', approval.id);

        const rows = decisions.map((d) => ({
            approval_id: approval.id,
            component_id: d.componentId,
            sub_item_id: d.subItemId ?? null,
            decision: d.decision,
            comment: d.comment?.trim() || null,
        }));
        const { error: decErr } = await supabase
            .from('artwork_component_decisions')
            .insert(rows);
        if (decErr) {
            console.error('error writing component decisions:', decErr);
            return { error: 'failed to record component decisions' };
        }
    }

    // If this was a visual_approval job, write variant choices and flip job status.
    if (job?.job_type === 'visual_approval') {
        const selections = validation.data.variant_selections ?? [];

        // Write the is_chosen flags.
        for (const sel of selections) {
            await supabase
                .from('artwork_variants')
                .update({
                    is_chosen: true,
                    chosen_at: new Date().toISOString(),
                })
                .eq('id', sel.variantId)
                .eq('component_id', sel.componentId);
        }

        // Flip the job status to completed so the "create production" button lights up.
        await supabase
            .from('artwork_jobs')
            .update({ status: 'completed' })
            .eq('id', approval.job_id);
    }

    revalidatePath(`/admin/artwork/${approval.job_id}`);
    return { success: true };
}

/**
 * Submit a "request changes" response — the client doesn't approve,
 * but leaves feedback so the admin can revise and re-send.
 * No signature required, no variant selection required.
 * Public, token-gated (same as submitApproval).
 */
export async function requestApprovalChanges(
    token: string,
    input: { client_name: string; client_email: string; client_comments: string }
): Promise<{ success: true } | { error: string }> {
    if (!input.client_name?.trim()) return { error: 'your name is required' };
    if (!input.client_email?.trim()) return { error: 'your email is required' };
    if (!input.client_comments?.trim()) return { error: 'please describe what changes you need' };

    const supabase = createAdminClient();

    const { data: approval, error: fetchError } = await supabase
        .from('artwork_approvals')
        .select('id, status, expires_at, job_id')
        .eq('token', token)
        .single();

    if (fetchError || !approval) return { error: 'invalid approval link' };
    if (approval.status !== 'pending') {
        return { error: 'this approval has already been submitted' };
    }
    if (new Date(approval.expires_at) < new Date()) {
        return { error: 'this approval link has expired' };
    }

    const { error: updateError } = await supabase
        .from('artwork_approvals')
        .update({
            status: 'changes_requested',
            client_name: input.client_name.trim(),
            client_email: input.client_email.trim(),
            client_comments: input.client_comments.trim(),
        })
        .eq('id', approval.id);

    if (updateError) {
        console.error('error requesting changes:', updateError);
        return { error: 'failed to submit feedback' };
    }

    revalidatePath(`/admin/artwork/${approval.job_id}`);
    return { success: true };
}
