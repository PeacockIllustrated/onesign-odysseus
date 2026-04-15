'use server';

/**
 * Sub-item server actions (migration 039).
 *
 * Sub-items are rows of `artwork_component_items` and are the spec-bearing
 * unit of artwork compliance. Each sub-item owns its own material, application
 * method, finish, dimensions, target department, and sign-off state.
 */

import { z } from 'zod';
import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
    CreateSubItemInput,
    CreateSubItemInputSchema,
    UpdateSubItemInput,
    UpdateSubItemInputSchema,
    SubItemMeasurementInput,
    SubItemMeasurementInputSchema,
} from './types';
import { checkDimensionTolerance, nextItemLabel } from './utils';

// =============================================================================
// CRUD
// =============================================================================

/**
 * Create a sub-item on the given component. Label is auto-assigned as the
 * next letter (A, B, C...). `sort_order` is max+1.
 */
export async function createSubItem(
    input: CreateSubItemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = CreateSubItemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: existing, error: existingErr } = await supabase
        .from('artwork_component_items')
        .select('label, sort_order')
        .eq('component_id', parsed.component_id)
        .order('sort_order', { ascending: true });

    if (existingErr) {
        console.error('createSubItem list error:', existingErr);
        return { error: existingErr.message };
    }

    const labels = (existing ?? []).map((r: any) => r.label as string);
    const nextLabel = nextItemLabel(labels);
    const nextSortOrder =
        existing && existing.length > 0
            ? Math.max(...existing.map((r: any) => r.sort_order as number)) + 1
            : 0;

    const { data, error } = await supabase
        .from('artwork_component_items')
        .insert({
            component_id: parsed.component_id,
            label: nextLabel,
            sort_order: nextSortOrder,
            name: parsed.name ?? null,
            material: parsed.material ?? null,
            application_method: parsed.application_method ?? null,
            finish: parsed.finish ?? null,
            quantity: parsed.quantity ?? 1,
            notes: parsed.notes ?? null,
            width_mm: parsed.width_mm ?? null,
            height_mm: parsed.height_mm ?? null,
            returns_mm: parsed.returns_mm ?? null,
            target_stage_id: parsed.target_stage_id ?? null,
        })
        .select('id, component_id')
        .single();

    if (error) {
        console.error('createSubItem insert error:', error);
        return { error: error.message };
    }

    await revalidateComponent(supabase, data.component_id);
    return { id: data.id };
}

/**
 * Update a sub-item with a partial patch. Rejects if design is signed off.
 * Recomputes dimension tolerance if width/height changes and measurements exist.
 */
export async function updateSubItem(
    subItemId: string,
    patch: UpdateSubItemInput
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = UpdateSubItemInputSchema.safeParse(patch);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: existing } = await supabase
        .from('artwork_component_items')
        .select(
            'id, component_id, design_signed_off_at, production_signed_off_at, width_mm, height_mm, measured_width_mm, measured_height_mm'
        )
        .eq('id', subItemId)
        .single();
    if (!existing) return { error: 'sub-item not found' };
    if (existing.design_signed_off_at) {
        return { error: 'sub-item design is signed off; reverse sign-off before editing' };
    }

    const updates: Record<string, any> = {};
    for (const key of Object.keys(parsed) as (keyof UpdateSubItemInput)[]) {
        if (parsed[key] !== undefined) updates[key] = parsed[key];
    }

    const newWidth =
        updates.width_mm !== undefined ? (updates.width_mm as number | null) : existing.width_mm;
    const newHeight =
        updates.height_mm !== undefined ? (updates.height_mm as number | null) : existing.height_mm;
    if (
        (updates.width_mm !== undefined || updates.height_mm !== undefined) &&
        existing.measured_width_mm != null &&
        existing.measured_height_mm != null &&
        newWidth != null &&
        newHeight != null
    ) {
        const tol = checkDimensionTolerance(
            newWidth,
            newHeight,
            existing.measured_width_mm,
            existing.measured_height_mm
        );
        updates.width_deviation_mm = tol.width_deviation_mm;
        updates.height_deviation_mm = tol.height_deviation_mm;
        updates.dimension_flag = tol.flag;
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update(updates)
        .eq('id', subItemId);

    if (error) {
        console.error('updateSubItem error:', error);
        return { error: error.message };
    }
    await revalidateComponent(supabase, existing.component_id);
    return { ok: true };
}

/**
 * Delete a sub-item. Rejects if it is the last sub-item on its component, or
 * if it has any sign-off state.
 */
export async function deleteSubItem(
    subItemId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: row } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, design_signed_off_at, production_signed_off_at')
        .eq('id', subItemId)
        .single();
    if (!row) return { error: 'sub-item not found' };
    if (row.design_signed_off_at || row.production_signed_off_at) {
        return { error: 'sub-item is signed off; cannot delete' };
    }

    const { count } = await supabase
        .from('artwork_component_items')
        .select('id', { count: 'exact', head: true })
        .eq('component_id', row.component_id);
    if ((count ?? 0) <= 1) {
        return {
            error: 'component must have at least one sub-item — delete the component instead',
        };
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .delete()
        .eq('id', subItemId);

    if (error) {
        console.error('deleteSubItem error:', error);
        return { error: error.message };
    }
    await revalidateComponent(supabase, row.component_id);
    return { ok: true };
}

/**
 * Set (or clear) the target production stage for a sub-item.
 */
export async function setSubItemTargetStage(
    subItemId: string,
    stageId: string | null
): Promise<{ ok: true } | { error: string }> {
    return updateSubItem(subItemId, { target_stage_id: stageId });
}

// =============================================================================
// SIGN-OFF
// =============================================================================

/**
 * Mark this sub-item's design as signed off. Requires material, dimensions,
 * and a target department to be set.
 */
export async function signOffSubItemDesign(
    subItemId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();
    const { data: si } = await supabase
        .from('artwork_component_items')
        .select(
            'id, component_id, material, width_mm, height_mm, target_stage_id, design_signed_off_at'
        )
        .eq('id', subItemId)
        .single();
    if (!si) return { error: 'sub-item not found' };
    if (si.design_signed_off_at) return { error: 'design already signed off' };
    if (!si.material) return { error: 'material is required before sign-off' };
    if (si.width_mm == null || si.height_mm == null) {
        return { error: 'dimensions are required before sign-off' };
    }
    if (!si.target_stage_id) {
        return { error: 'target department is required before sign-off' };
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update({
            designed_by: user.id,
            design_signed_off_at: new Date().toISOString(),
            design_signed_off_by: user.id,
        })
        .eq('id', subItemId);

    if (error) return { error: error.message };
    await revalidateComponent(supabase, si.component_id);
    return { ok: true };
}

/**
 * Submit production measurements for a sub-item and optionally sign off.
 * Sign-off requires design to be signed off first.
 */
export async function submitSubItemProduction(
    subItemId: string,
    input: SubItemMeasurementInput,
    signOff: boolean = false
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = SubItemMeasurementInputSchema.safeParse(input);
    if (!validation.success) return { error: validation.error.issues[0].message };
    const parsed = validation.data;

    const supabase = await createServerClient();
    const { data: si } = await supabase
        .from('artwork_component_items')
        .select(
            'id, component_id, width_mm, height_mm, design_signed_off_at, production_signed_off_at'
        )
        .eq('id', subItemId)
        .single();
    if (!si) return { error: 'sub-item not found' };
    if (signOff && !si.design_signed_off_at) {
        return { error: 'design must be signed off before production sign-off' };
    }
    if (signOff && si.production_signed_off_at) {
        return { error: 'production already signed off' };
    }
    if (si.width_mm == null || si.height_mm == null) {
        return { error: 'design dimensions missing — cannot compute tolerance' };
    }

    const tol = checkDimensionTolerance(
        si.width_mm,
        si.height_mm,
        parsed.measured_width_mm,
        parsed.measured_height_mm
    );

    const updates: Record<string, any> = {
        measured_width_mm: parsed.measured_width_mm,
        measured_height_mm: parsed.measured_height_mm,
        material_confirmed: parsed.material_confirmed,
        rip_no_scaling_confirmed: parsed.rip_no_scaling_confirmed,
        width_deviation_mm: tol.width_deviation_mm,
        height_deviation_mm: tol.height_deviation_mm,
        dimension_flag: tol.flag,
    };
    if (signOff) {
        updates.production_checked_by = user.id;
        updates.production_signed_off_at = new Date().toISOString();
        updates.production_signed_off_by = user.id;
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update(updates)
        .eq('id', subItemId);

    if (error) return { error: error.message };
    await revalidateComponent(supabase, si.component_id);
    return { ok: true };
}

/**
 * Reverse a sign-off (design or production). Reversing design also clears
 * production (cascading invalidation).
 */
export async function reverseSubItemSignOff(
    subItemId: string,
    which: 'design' | 'production'
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();
    const { data: si } = await supabase
        .from('artwork_component_items')
        .select('id, component_id')
        .eq('id', subItemId)
        .single();
    if (!si) return { error: 'sub-item not found' };

    const updates: Record<string, any> = {};
    if (which === 'design') {
        updates.designed_by = null;
        updates.design_signed_off_at = null;
        updates.design_signed_off_by = null;
        updates.production_checked_by = null;
        updates.production_signed_off_at = null;
        updates.production_signed_off_by = null;
    } else {
        updates.production_checked_by = null;
        updates.production_signed_off_at = null;
        updates.production_signed_off_by = null;
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update(updates)
        .eq('id', subItemId);

    if (error) return { error: error.message };
    await revalidateComponent(supabase, si.component_id);
    return { ok: true };
}

// =============================================================================
// MANUAL STATUS OVERRIDE
// =============================================================================

/**
 * Manually override a component's status.
 *
 * The system normally derives status from sub-item sign-off state — but
 * real-world edge cases (a component that's physically complete but flagged
 * during QC, or one stuck in design waiting on client feedback) sometimes
 * need the operator to force a particular status. This action records the
 * override; it does NOT change sign-off timestamps on sub-items.
 *
 * Valid statuses mirror the ComponentStatusEnum in types.ts.
 */
const ComponentStatusOverrideSchema = z.enum([
    'pending_design',
    'design_submitted',
    'design_signed_off',
    'in_production',
    'production_complete',
    'flagged',
]);

export async function overrideComponentStatus(
    componentId: string,
    status: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = ComponentStatusOverrideSchema.safeParse(status);
    if (!validation.success) return { error: 'invalid status value' };

    const supabase = await createServerClient();

    const { data: component } = await supabase
        .from('artwork_components')
        .select('id, job_id')
        .eq('id', componentId)
        .single();
    if (!component) return { error: 'component not found' };

    const { error } = await supabase
        .from('artwork_components')
        .update({ status: validation.data })
        .eq('id', componentId);

    if (error) {
        console.error('overrideComponentStatus error:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/artwork/${component.job_id}`);
    revalidatePath(`/admin/artwork/${component.job_id}/${componentId}`);
    revalidatePath('/admin/artwork');
    return { ok: true };
}

// =============================================================================
// THUMBNAIL UPLOAD
// =============================================================================

/**
 * Upload a thumbnail image for a single sub-item. Image is stored under
 * artwork-assets/<jobId>/<componentId>/sub-items/<subItemId>.<ext> with
 * upsert semantics (re-uploading replaces the previous file).
 */
export async function uploadSubItemThumbnail(
    subItemId: string,
    formData: FormData
): Promise<{ url: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const file = formData.get('file') as File | null;
    if (!file) return { error: 'no file provided' };
    if (file.size === 0) return { error: 'file is empty' };
    if (file.size > 10 * 1024 * 1024) return { error: 'file too large (max 10 MB)' };
    if (!file.type.startsWith('image/')) {
        return { error: 'file must be an image' };
    }

    const supabase = await createServerClient();

    const { data: sub } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, artwork_components!inner(job_id)')
        .eq('id', subItemId)
        .single();
    if (!sub) return { error: 'sub-item not found' };

    const jobId = (sub as any).artwork_components?.job_id;
    const componentId = (sub as any).component_id;
    const ext = (file.name.split('.').pop() || 'png').toLowerCase();
    const storagePath = `${jobId}/${componentId}/sub-items/${subItemId}.${ext}`;

    const { error: uploadErr } = await supabase.storage
        .from('artwork-assets')
        .upload(storagePath, file, { upsert: true, contentType: file.type });

    if (uploadErr) {
        console.error('uploadSubItemThumbnail storage error:', uploadErr);
        return { error: uploadErr.message };
    }

    const { data: urlData } = supabase.storage
        .from('artwork-assets')
        .getPublicUrl(storagePath);
    const url = urlData.publicUrl;

    const { error: updateErr } = await supabase
        .from('artwork_component_items')
        .update({ thumbnail_url: url })
        .eq('id', subItemId);

    if (updateErr) {
        console.error('uploadSubItemThumbnail update error:', updateErr);
        return { error: updateErr.message };
    }

    await revalidateComponent(supabase, componentId);
    return { url };
}

/**
 * Remove a sub-item's thumbnail. Clears the DB column and deletes the
 * stored file (best-effort — failures to unlink the blob are logged
 * but do not surface as action errors, since the DB column is what
 * callers actually read).
 */
export async function removeSubItemThumbnail(
    subItemId: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    const { data: sub } = await supabase
        .from('artwork_component_items')
        .select('id, component_id, thumbnail_url')
        .eq('id', subItemId)
        .single();
    if (!sub) return { error: 'sub-item not found' };

    if (sub.thumbnail_url) {
        const parts = sub.thumbnail_url.split('/artwork-assets/');
        if (parts.length > 1) {
            const { error: rmErr } = await supabase.storage
                .from('artwork-assets')
                .remove([parts[1]]);
            if (rmErr) console.error('removeSubItemThumbnail blob rm warn:', rmErr);
        }
    }

    const { error } = await supabase
        .from('artwork_component_items')
        .update({ thumbnail_url: null })
        .eq('id', subItemId);

    if (error) return { error: error.message };
    await revalidateComponent(supabase, sub.component_id);
    return { ok: true };
}

// =============================================================================
// HELPERS
// =============================================================================

async function revalidateComponent(supabase: any, componentId: string) {
    const { data } = await supabase
        .from('artwork_components')
        .select('job_id')
        .eq('id', componentId)
        .single();
    if (data?.job_id) {
        revalidatePath(`/admin/artwork/${data.job_id}`);
        revalidatePath(`/admin/artwork/${data.job_id}/${componentId}`);
    }
}
