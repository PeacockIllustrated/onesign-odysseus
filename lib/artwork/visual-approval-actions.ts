'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import {
    CreateVisualJobInputSchema,
    type CreateVisualJobInput,
    CreateVariantInputSchema,
    UpdateVariantInputSchema,
    type CreateVariantInput,
    type UpdateVariantInput,
} from './variant-types';
import { mapVariantToSubItemInput } from './variant-utils';

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

// ---------------------------------------------------------------------------
// Variant CRUD
// ---------------------------------------------------------------------------

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

function nextLabel(existing: string[]): string {
    const used = new Set(existing);
    for (const ch of ALPHABET) if (!used.has(ch)) return ch;
    for (const a of ALPHABET) for (const b of ALPHABET) {
        const two = a + b;
        if (!used.has(two)) return two;
    }
    return 'X';
}

async function assertJobNotApprovedByComponent(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    componentId: string
): Promise<string | null> {
    const { data } = await supabase
        .from('artwork_components')
        .select('job_id, artwork_jobs!inner(status, job_type)')
        .eq('id', componentId)
        .single();
    const job = (data as any)?.artwork_jobs;
    if (!job) return 'parent component not found';
    if (job.job_type !== 'visual_approval') {
        return 'variants can only be added to visual approval jobs';
    }
    if (job.status === 'completed') {
        return 'job is already approved — variants are frozen';
    }
    return null;
}

async function assertVariantEditable(
    supabase: Awaited<ReturnType<typeof createServerClient>>,
    variantId: string
): Promise<{ componentId: string } | { error: string }> {
    const { data: variant } = await supabase
        .from('artwork_variants')
        .select('id, component_id, is_chosen, artwork_components!inner(artwork_jobs!inner(status))')
        .eq('id', variantId)
        .single();
    if (!variant) return { error: 'variant not found' };
    if ((variant as any).is_chosen) {
        return { error: 'variant has been chosen by the client — immutable' };
    }
    const parentStatus = (variant as any).artwork_components?.artwork_jobs?.status;
    if (parentStatus === 'completed') {
        return { error: 'job is already approved — variants are frozen' };
    }
    return { componentId: (variant as any).component_id };
}

export async function addVariantToComponent(
    input: CreateVariantInput
): Promise<{ id: string; label: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = CreateVariantInputSchema.safeParse(input);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = await createServerClient();

    const guard = await assertJobNotApprovedByComponent(supabase, parsed.componentId);
    if (guard) return { error: guard };

    const { data: existing } = await supabase
        .from('artwork_variants')
        .select('label, sort_order')
        .eq('component_id', parsed.componentId);

    const label = nextLabel((existing ?? []).map((r: any) => r.label));
    const sortOrder = (existing?.length ?? 0);

    const { data: variant, error } = await supabase
        .from('artwork_variants')
        .insert({
            component_id: parsed.componentId,
            label,
            sort_order: sortOrder,
            name: parsed.name ?? null,
            description: parsed.description ?? null,
            material: parsed.material ?? null,
            application_method: parsed.applicationMethod ?? null,
            finish: parsed.finish ?? null,
            width_mm: parsed.widthMm ?? null,
            height_mm: parsed.heightMm ?? null,
            returns_mm: parsed.returnsMm ?? null,
            notes: parsed.notes ?? null,
        })
        .select('id, label')
        .single();

    if (error || !variant) return { error: error?.message ?? 'failed to add variant' };

    revalidatePath('/admin/artwork');
    return { id: variant.id, label: variant.label };
}

export async function updateVariant(
    variantId: string,
    patch: UpdateVariantInput
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = UpdateVariantInputSchema.safeParse(patch);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = await createServerClient();

    const guard = await assertVariantEditable(supabase, variantId);
    if ('error' in guard) return guard;

    // Translate camelCase input keys to snake_case DB columns.
    const updates: Record<string, unknown> = {};
    if (parsed.name !== undefined) updates.name = parsed.name;
    if (parsed.description !== undefined) updates.description = parsed.description;
    if (parsed.material !== undefined) updates.material = parsed.material;
    if (parsed.applicationMethod !== undefined) updates.application_method = parsed.applicationMethod;
    if (parsed.finish !== undefined) updates.finish = parsed.finish;
    if (parsed.widthMm !== undefined) updates.width_mm = parsed.widthMm;
    if (parsed.heightMm !== undefined) updates.height_mm = parsed.heightMm;
    if (parsed.returnsMm !== undefined) updates.returns_mm = parsed.returnsMm;
    if (parsed.notes !== undefined) updates.notes = parsed.notes;

    const { error } = await supabase
        .from('artwork_variants')
        .update(updates)
        .eq('id', variantId);
    if (error) return { error: error.message };

    revalidatePath('/admin/artwork');
    return { ok: true };
}

export async function deleteVariant(
    variantId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const guard = await assertVariantEditable(supabase, variantId);
    if ('error' in guard) return guard;

    const { error } = await supabase
        .from('artwork_variants')
        .delete()
        .eq('id', variantId);
    if (error) return { error: error.message };

    revalidatePath('/admin/artwork');
    return { ok: true };
}

// ---------------------------------------------------------------------------
// Thumbnail upload / remove (mirrors uploadSubItemThumbnail pattern)
// ---------------------------------------------------------------------------

export async function uploadVariantThumbnail(
    variantId: string,
    formData: FormData
): Promise<{ url: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const file = formData.get('file') as File | null;
    if (!file) return { error: 'no file provided' };
    if (file.size === 0) return { error: 'file is empty' };
    if (file.size > 10 * 1024 * 1024) return { error: 'file too large (max 10 MB)' };
    if (!file.type.startsWith('image/')) return { error: 'file must be an image' };

    const supabase = await createServerClient();

    const { data: variant } = await supabase
        .from('artwork_variants')
        .select('id, component_id, artwork_components!inner(job_id)')
        .eq('id', variantId)
        .single();
    if (!variant) return { error: 'variant not found' };

    const jobId = (variant as any).artwork_components?.job_id;
    const componentId = (variant as any).component_id;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const storagePath = `${jobId}/${componentId}/variants/${variantId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
        .from('artwork-assets')
        .upload(storagePath, file, { upsert: true, contentType: file.type });
    if (uploadErr) return { error: uploadErr.message };

    const { data: urlData } = supabase.storage
        .from('artwork-assets')
        .getPublicUrl(storagePath);
    const url = urlData.publicUrl;

    const { error: updateErr } = await supabase
        .from('artwork_variants')
        .update({ thumbnail_url: url })
        .eq('id', variantId);
    if (updateErr) return { error: updateErr.message };

    revalidatePath('/admin/artwork');
    return { url };
}

export async function removeVariantThumbnail(
    variantId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: variant } = await supabase
        .from('artwork_variants')
        .select('id, component_id, thumbnail_url, artwork_components!inner(job_id)')
        .eq('id', variantId)
        .single();
    if (!variant) return { error: 'variant not found' };

    const { error: updErr } = await supabase
        .from('artwork_variants')
        .update({ thumbnail_url: null })
        .eq('id', variantId);
    if (updErr) return { error: updErr.message };

    // Best-effort blob delete; not surfaced as an action error.
    if ((variant as any).thumbnail_url) {
        const jobId = (variant as any).artwork_components?.job_id;
        const componentId = (variant as any).component_id;
        const url: string = (variant as any).thumbnail_url;
        const ext = url.split('.').pop() || 'png';
        await supabase.storage
            .from('artwork-assets')
            .remove([`${jobId}/${componentId}/variants/${variantId}.${ext}`])
            .catch((e) => console.warn('removeVariantThumbnail blob unlink failed:', e));
    }

    revalidatePath('/admin/artwork');
    return { ok: true };
}

// ---------------------------------------------------------------------------
// createProductionFromVisual — the manual handoff
// ---------------------------------------------------------------------------

/**
 * Spawn a production artwork_job from an approved visual. Copies
 * components + seeds one sub-item per component from the client-chosen
 * variant. Idempotent: refuses if a production job already exists with
 * parent_visual_job_id pointing to this visual.
 */
export async function createProductionFromVisual(
    visualJobId: string
): Promise<{ productionJobId: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    // 1. Load the visual + its components + their variants.
    const { data: visual } = await supabase
        .from('artwork_jobs')
        .select(
            `id, job_name, description, status, job_type, org_id, contact_id,
             site_id, quote_id, job_item_id, is_orphan, client_name`
        )
        .eq('id', visualJobId)
        .single();
    if (!visual) return { error: 'visual job not found' };
    if (visual.job_type !== 'visual_approval') {
        return { error: 'not a visual approval job' };
    }
    if (visual.status !== 'completed') {
        return { error: 'visual is not yet client-approved' };
    }

    // 2. Idempotency guard.
    const { data: existing } = await supabase
        .from('artwork_jobs')
        .select('id')
        .eq('parent_visual_job_id', visualJobId)
        .eq('job_type', 'production')
        .maybeSingle();
    if (existing) {
        return { error: `production job already exists (${existing.id})` };
    }

    // 3. Load components + chosen variants.
    const { data: components } = await supabase
        .from('artwork_components')
        .select(
            `id, name, component_type, sort_order, lighting, notes,
             variants:artwork_variants(*)`
        )
        .eq('job_id', visualJobId)
        .order('sort_order', { ascending: true });

    if (!components || components.length === 0) {
        return { error: 'visual has no components' };
    }

    for (const c of components) {
        const chosen = ((c as any).variants ?? []).find((v: any) => v.is_chosen);
        if (!chosen) {
            return {
                error: `component "${(c as any).name}" has no chosen variant — approval incomplete`,
            };
        }
    }

    // 4. Create the production artwork_job.
    const { data: prod, error: prodErr } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: visual.job_name,
            description: visual.description,
            status: 'draft',
            job_type: 'production',
            parent_visual_job_id: visualJobId,
            org_id: visual.org_id,
            contact_id: visual.contact_id,
            site_id: visual.site_id,
            quote_id: visual.quote_id,
            job_item_id: visual.job_item_id,
            is_orphan: visual.is_orphan,
            client_name: visual.client_name,
            created_by: user.id,
        })
        .select('id')
        .single();
    if (prodErr || !prod) {
        console.error('createProductionFromVisual insert job error:', prodErr);
        const msg = prodErr?.message ?? '';
        if ((prodErr as any)?.code === '23505' || msg.includes('idx_artwork_jobs_one_prod_per_visual')) {
            return { error: 'a production job already exists for this visual' };
        }
        return { error: msg || 'failed to create production job' };
    }

    // 5. Create each component + seed one sub-item from the chosen variant.
    for (const c of components) {
        const raw = c as any;
        const chosen = (raw.variants ?? []).find((v: any) => v.is_chosen);

        const { data: newComp, error: compErr } = await supabase
            .from('artwork_components')
            .insert({
                job_id: prod.id,
                name: raw.name,
                component_type: raw.component_type ?? 'other',
                sort_order: raw.sort_order ?? 0,
                status: 'pending_design',
                lighting: raw.lighting ?? null,
                notes: raw.notes ?? null,
                scale_confirmed: false,
                bleed_included: false,
                material_confirmed: false,
                rip_no_scaling_confirmed: false,
            })
            .select('id')
            .single();
        if (compErr || !newComp) {
            console.error('createProductionFromVisual component error:', compErr);
            continue;
        }

        const subItem = mapVariantToSubItemInput(chosen);
        await supabase.from('artwork_component_items').insert({
            component_id: newComp.id,
            label: subItem.label,
            sort_order: subItem.sort_order,
            name: subItem.name,
            material: subItem.material,
            application_method: subItem.application_method,
            finish: subItem.finish,
            width_mm: subItem.width_mm,
            height_mm: subItem.height_mm,
            returns_mm: subItem.returns_mm,
            quantity: subItem.quantity,
            notes: subItem.notes,
        });
    }

    revalidatePath(`/admin/artwork/${visualJobId}`);
    revalidatePath(`/admin/artwork/${prod.id}`);
    revalidatePath('/admin/artwork');
    return { productionJobId: prod.id };
}
