'use server';

/**
 * Artwork Compliance Server Actions
 *
 * Server-side mutations for artwork jobs, components, and production verification.
 * All actions enforce super-admin access via RLS.
 */

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
    CreateArtworkJobInput,
    CreateArtworkJobInputSchema,
    UpdateArtworkJobInput,
    UpdateArtworkJobInputSchema,
    CreateComponentInput,
    CreateComponentInputSchema,
    SubmitDesignInput,
    SubmitDesignInputSchema,
    SubmitProductionMeasurementsInput,
    SubmitProductionMeasurementsInputSchema,
    ArtworkJob,
    ArtworkComponent,
    ArtworkJobWithComponents,
    ArtworkComponentWithVersions,
    ArtworkJobWithProductionContext,
    ProductionItemContext,
    ComponentStageDefault,
    ArtworkJobLineage,
    ArtworkDashboardData,
    ArtworkDashboardFilter,
    ArtworkGhostRow,
} from './types';
import { checkDimensionTolerance, computeReleaseGaps } from './utils';
import { advanceItemToNextRoutedStage } from '@/lib/production/actions';

// =============================================================================
// JOB CRUD
// =============================================================================

/**
 * Create a new artwork job.
 *
 * Two paths via discriminated union:
 *  - 'linked': spawned from a production job_item; org_id is inherited from the
 *    parent production_job. The partial unique index on artwork_jobs.job_item_id
 *    prevents duplicate creation per item.
 *  - 'orphan': warranty/rework/speculative. Requires explicit acknowledgement
 *    and an org_id — never left unlinked to both an item AND an org.
 */
export async function createArtworkJob(
    input: CreateArtworkJobInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const validation = CreateArtworkJobInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    let orgId: string | null = null;
    let jobItemId: string | null = null;
    let isOrphan = false;
    let contactId: string | null = null;

    if (parsed.kind === 'linked') {
        jobItemId = parsed.job_item_id;

        // Inherit org_id from the parent production_job.
        const { data: itemRow, error: itemErr } = await supabase
            .from('job_items')
            .select('id, production_jobs!inner(org_id)')
            .eq('id', jobItemId)
            .single();

        if (itemErr || !itemRow) {
            return { error: 'production item not found' };
        }
        const parentOrg = (itemRow as any).production_jobs?.org_id;
        if (!parentOrg) {
            return { error: 'production job has no organisation' };
        }
        orgId = parentOrg;
    } else {
        // orphan
        isOrphan = true;
        orgId = parsed.org_id;
        contactId = parsed.contact_id ?? null;
    }

    const { data, error } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: parsed.job_name,
            description: parsed.description ?? null,
            status: 'draft',
            job_item_id: jobItemId,
            org_id: orgId,
            contact_id: contactId,
            is_orphan: isOrphan,
            client_name: null,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        // 23505 = unique_violation on partial index (artwork_job exists for this job_item)
        if ((error as any).code === '23505') {
            return { error: 'artwork job already exists for this production item' };
        }
        console.error('error creating artwork job:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/artwork');
    return { id: data.id };
}

/**
 * Update an artwork job
 */
export async function updateArtworkJob(
    id: string,
    updates: UpdateArtworkJobInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const validation = UpdateArtworkJobInputSchema.safeParse(updates);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = await createServerClient();

    const updateData: Record<string, unknown> = {};
    if (updates.job_name !== undefined) updateData.job_name = updates.job_name;
    if (updates.client_name !== undefined) updateData.client_name = updates.client_name;
    if (updates.description !== undefined) updateData.description = updates.description;
    if (updates.panel_size !== undefined) updateData.panel_size = updates.panel_size;
    if (updates.paint_colour !== undefined) updateData.paint_colour = updates.paint_colour;
    if (updates.status !== undefined) updateData.status = updates.status;

    const { error } = await supabase
        .from('artwork_jobs')
        .update(updateData)
        .eq('id', id);

    if (error) {
        console.error('error updating artwork job:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/artwork');
    revalidatePath(`/admin/artwork/${id}`);
    return { success: true };
}

/**
 * Delete an artwork job
 */
export async function deleteArtworkJob(id: string): Promise<void> {
    const user = await getUser();
    if (!user) {
        redirect('/login');
    }

    const supabase = await createServerClient();

    await supabase.from('artwork_jobs').delete().eq('id', id);

    revalidatePath('/admin/artwork');
    redirect('/admin/artwork');
}

// =============================================================================
// COMPONENT CRUD
// =============================================================================

/**
 * Add a component to a job
 */
export async function addComponent(
    jobId: string,
    input: CreateComponentInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const validation = CreateComponentInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = await createServerClient();

    // Get max sort_order for this job
    const { data: existing } = await supabase
        .from('artwork_components')
        .select('sort_order')
        .eq('job_id', jobId)
        .order('sort_order', { ascending: false })
        .limit(1);

    const nextOrder = existing && existing.length > 0 ? existing[0].sort_order + 1 : 0;

    const { data, error } = await supabase
        .from('artwork_components')
        .insert({
            job_id: jobId,
            name: validation.data.name,
            component_type: validation.data.component_type,
            sort_order: nextOrder,
        })
        .select('id')
        .single();

    if (error) {
        console.error('error adding component:', error);
        return { error: error.message };
    }

    // Auto-set target_stage_id from defaults if available
    const { data: defaultStage } = await supabase
        .from('component_stage_defaults')
        .select('stage_id')
        .eq('component_type', validation.data.component_type)
        .maybeSingle();

    if (defaultStage && data) {
        await supabase
            .from('artwork_components')
            .update({ target_stage_id: defaultStage.stage_id })
            .eq('id', data.id);
    }

    // Update job status to in_progress if currently draft
    await supabase
        .from('artwork_jobs')
        .update({ status: 'in_progress' })
        .eq('id', jobId)
        .eq('status', 'draft');

    revalidatePath(`/admin/artwork/${jobId}`);
    return { id: data.id };
}

/**
 * Update a component's basic info
 */
export async function updateComponent(
    componentId: string,
    updates: { name?: string; component_type?: string; sort_order?: number }
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get the job_id for revalidation
    const { data: component } = await supabase
        .from('artwork_components')
        .select('job_id')
        .eq('id', componentId)
        .single();

    if (!component) {
        return { error: 'component not found' };
    }

    const updateData: Record<string, unknown> = {};
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.component_type !== undefined) updateData.component_type = updates.component_type;
    if (updates.sort_order !== undefined) updateData.sort_order = updates.sort_order;

    const { error } = await supabase
        .from('artwork_components')
        .update(updateData)
        .eq('id', componentId);

    if (error) {
        console.error('error updating component:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/artwork/${component.job_id}`);
    revalidatePath(`/admin/artwork/${component.job_id}/${componentId}`);
    return { success: true };
}

/**
 * Delete a component
 */
export async function deleteComponent(
    jobId: string,
    componentId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    const { error } = await supabase
        .from('artwork_components')
        .delete()
        .eq('id', componentId)
        .eq('job_id', jobId);

    if (error) {
        console.error('error deleting component:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/artwork/${jobId}`);
    return { success: true };
}

// =============================================================================
// DESIGN WORKFLOW
// =============================================================================

/**
 * Submit design for a component.
 * Snapshots current data to version history before updating.
 */
export async function submitDesign(
    componentId: string,
    input: SubmitDesignInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const validation = SubmitDesignInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = await createServerClient();

    // Fetch current component data for version snapshot
    const { data: current } = await supabase
        .from('artwork_components')
        .select('*, job_id')
        .eq('id', componentId)
        .single();

    if (!current) {
        return { error: 'component not found' };
    }

    // If there is existing design data, snapshot it as a version
    if (current.width_mm !== null) {
        // Get next version number
        const { data: versions } = await supabase
            .from('artwork_component_versions')
            .select('version_number')
            .eq('component_id', componentId)
            .order('version_number', { ascending: false })
            .limit(1);

        const nextVersion = versions && versions.length > 0 ? versions[0].version_number + 1 : 1;

        // Fetch existing extra items for version snapshot
        const { data: existingItems } = await supabase
            .from('artwork_component_items')
            .select('label, sort_order, width_mm, height_mm, returns_mm')
            .eq('component_id', componentId)
            .order('sort_order', { ascending: true });

        await supabase.from('artwork_component_versions').insert({
            component_id: componentId,
            version_number: nextVersion,
            width_mm: current.width_mm,
            height_mm: current.height_mm,
            returns_mm: current.returns_mm,
            material: current.material,
            scale_confirmed: current.scale_confirmed,
            bleed_included: current.bleed_included,
            file_path: current.file_path,
            artwork_thumbnail_url: current.artwork_thumbnail_url,
            notes: current.notes,
            lighting: current.lighting,
            extra_items_json: existingItems || [],
            created_by: user.id,
        });
    }

    // Update component with new design data
    const { error } = await supabase
        .from('artwork_components')
        .update({
            width_mm: validation.data.width_mm,
            height_mm: validation.data.height_mm,
            returns_mm: validation.data.returns_mm,
            material: validation.data.material,
            lighting: validation.data.lighting || null,
            scale_confirmed: validation.data.scale_confirmed,
            bleed_included: validation.data.bleed_included,
            file_path: validation.data.file_path,
            notes: validation.data.notes || null,
            designed_by: user.id,
            status: 'design_submitted',
            // Clear any previous production data on resubmission
            measured_width_mm: null,
            measured_height_mm: null,
            material_confirmed: false,
            rip_no_scaling_confirmed: false,
            dimension_flag: null,
            width_deviation_mm: null,
            height_deviation_mm: null,
            production_notes: null,
            production_checked_by: null,
            production_signed_off_at: null,
            production_signed_off_by: null,
            // Clear design sign-off (requires re-sign-off after edit)
            design_signed_off_at: null,
            design_signed_off_by: null,
        })
        .eq('id', componentId);

    if (error) {
        console.error('error submitting design:', error);
        return { error: error.message };
    }

    // Handle extra dimension items: delete old, insert new
    await supabase
        .from('artwork_component_items')
        .delete()
        .eq('component_id', componentId);

    if (validation.data.extra_items && validation.data.extra_items.length > 0) {
        const itemRows = validation.data.extra_items.map((item, index) => ({
            component_id: componentId,
            label: String.fromCharCode(66 + index), // 'B', 'C', 'D'...
            sort_order: index + 1,
            width_mm: item.width_mm,
            height_mm: item.height_mm,
            returns_mm: item.returns_mm,
        }));
        await supabase.from('artwork_component_items').insert(itemRows);
    }

    revalidatePath(`/admin/artwork/${current.job_id}`);
    revalidatePath(`/admin/artwork/${current.job_id}/${componentId}`);
    return { success: true };
}

/**
 * Sign off design for a component
 */
export async function signOffDesign(
    componentId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Verify component exists and has design data
    const { data: component } = await supabase
        .from('artwork_components')
        .select('job_id, status, width_mm')
        .eq('id', componentId)
        .single();

    if (!component) {
        return { error: 'component not found' };
    }

    if (component.width_mm === null) {
        return { error: 'design must be submitted before sign-off' };
    }

    const { error } = await supabase
        .from('artwork_components')
        .update({
            design_signed_off_at: new Date().toISOString(),
            design_signed_off_by: user.id,
            status: 'design_signed_off',
        })
        .eq('id', componentId);

    if (error) {
        console.error('error signing off design:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/artwork/${component.job_id}`);
    revalidatePath(`/admin/artwork/${component.job_id}/${componentId}`);
    return { success: true };
}

// =============================================================================
// PRODUCTION WORKFLOW
// =============================================================================

/**
 * Submit production measurements for a component.
 * Enforces design sign-off gate.
 */
export async function submitProductionMeasurements(
    componentId: string,
    input: SubmitProductionMeasurementsInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const validation = SubmitProductionMeasurementsInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = await createServerClient();

    // Fetch component with design data
    const { data: component } = await supabase
        .from('artwork_components')
        .select('*')
        .eq('id', componentId)
        .single();

    if (!component) {
        return { error: 'component not found' };
    }

    // Gate check: design must be signed off
    if (!component.design_signed_off_at) {
        return { error: 'design sign-off required before production can proceed' };
    }

    // Compute dimension tolerance
    const toleranceResult = checkDimensionTolerance(
        Number(component.width_mm),
        Number(component.height_mm),
        validation.data.measured_width_mm,
        validation.data.measured_height_mm
    );

    // Update component with production data
    const { error } = await supabase
        .from('artwork_components')
        .update({
            measured_width_mm: validation.data.measured_width_mm,
            measured_height_mm: validation.data.measured_height_mm,
            material_confirmed: validation.data.material_confirmed,
            rip_no_scaling_confirmed: validation.data.rip_no_scaling_confirmed,
            production_notes: validation.data.production_notes || null,
            dimension_flag: toleranceResult.flag,
            width_deviation_mm: toleranceResult.width_deviation_mm,
            height_deviation_mm: toleranceResult.height_deviation_mm,
            production_checked_by: user.id,
            status: 'in_production',
        })
        .eq('id', componentId);

    if (error) {
        console.error('error submitting production measurements:', error);
        return { error: error.message };
    }

    // Log production checks
    const checks = [
        {
            component_id: componentId,
            check_type: 'dimension_measurement',
            passed: toleranceResult.overall_pass,
            value_json: {
                measured_width_mm: validation.data.measured_width_mm,
                measured_height_mm: validation.data.measured_height_mm,
                width_deviation_mm: toleranceResult.width_deviation_mm,
                height_deviation_mm: toleranceResult.height_deviation_mm,
            },
            checked_by: user.id,
        },
        {
            component_id: componentId,
            check_type: 'material_confirmation',
            passed: validation.data.material_confirmed,
            value_json: {},
            checked_by: user.id,
        },
        {
            component_id: componentId,
            check_type: 'rip_scaling_check',
            passed: validation.data.rip_no_scaling_confirmed,
            value_json: {},
            checked_by: user.id,
        },
    ];

    await supabase.from('artwork_production_checks').insert(checks);

    // Process extra item measurements
    if (validation.data.item_measurements && validation.data.item_measurements.length > 0) {
        for (const meas of validation.data.item_measurements) {
            // Fetch the item's spec dimensions
            const { data: item } = await supabase
                .from('artwork_component_items')
                .select('width_mm, height_mm, label')
                .eq('id', meas.item_id)
                .eq('component_id', componentId)
                .single();

            if (!item || !item.width_mm || !item.height_mm) continue;

            const itemTolerance = checkDimensionTolerance(
                Number(item.width_mm),
                Number(item.height_mm),
                meas.measured_width_mm,
                meas.measured_height_mm
            );

            await supabase
                .from('artwork_component_items')
                .update({
                    measured_width_mm: meas.measured_width_mm,
                    measured_height_mm: meas.measured_height_mm,
                    dimension_flag: itemTolerance.flag,
                    width_deviation_mm: itemTolerance.width_deviation_mm,
                    height_deviation_mm: itemTolerance.height_deviation_mm,
                })
                .eq('id', meas.item_id);

            // Log each item's dimension check
            await supabase.from('artwork_production_checks').insert({
                component_id: componentId,
                check_type: 'dimension_measurement',
                passed: itemTolerance.overall_pass,
                value_json: {
                    item_id: meas.item_id,
                    item_label: item.label,
                    measured_width_mm: meas.measured_width_mm,
                    measured_height_mm: meas.measured_height_mm,
                    width_deviation_mm: itemTolerance.width_deviation_mm,
                    height_deviation_mm: itemTolerance.height_deviation_mm,
                },
                checked_by: user.id,
            });
        }
    }

    // Update job status to in_production
    await supabase
        .from('artwork_jobs')
        .update({ status: 'in_production' })
        .eq('id', component.job_id)
        .in('status', ['draft', 'in_progress', 'design_complete']);

    revalidatePath(`/admin/artwork/${component.job_id}`);
    revalidatePath(`/admin/artwork/${component.job_id}/${componentId}`);
    return { success: true };
}

/**
 * Sign off production for a component.
 * Validates all checks are complete.
 * Auto-transitions job to completed if all components are done.
 */
export async function signOffProduction(
    componentId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    const { data: component } = await supabase
        .from('artwork_components')
        .select('*')
        .eq('id', componentId)
        .single();

    if (!component) {
        return { error: 'component not found' };
    }

    // Validate all requirements
    const checks = [
        { condition: !!component.design_signed_off_at, message: 'design must be signed off' },
        { condition: !!component.measured_width_mm, message: 'measured width is required' },
        { condition: !!component.measured_height_mm, message: 'measured height is required' },
        { condition: component.material_confirmed, message: 'material must be confirmed' },
        { condition: component.rip_no_scaling_confirmed, message: 'RIP scaling must be confirmed' },
    ];

    const failures = checks.filter((c) => !c.condition);
    if (failures.length > 0) {
        return { error: failures.map((f) => f.message).join(', ') };
    }

    // Validate all extra items have measurements
    const { data: extraItems } = await supabase
        .from('artwork_component_items')
        .select('*')
        .eq('component_id', componentId);

    if (extraItems && extraItems.length > 0) {
        const unmeasuredItems = extraItems.filter(
            (item) => item.width_mm && !item.measured_width_mm
        );
        if (unmeasuredItems.length > 0) {
            return { error: 'all extra items must have measured dimensions before sign-off' };
        }
    }

    // Log final signoff check
    await supabase.from('artwork_production_checks').insert({
        component_id: componentId,
        check_type: 'final_signoff',
        passed: true,
        value_json: {
            dimension_flag: component.dimension_flag,
            width_deviation_mm: component.width_deviation_mm,
            height_deviation_mm: component.height_deviation_mm,
        },
        checked_by: user.id,
    });

    const { error } = await supabase
        .from('artwork_components')
        .update({
            production_signed_off_at: new Date().toISOString(),
            production_signed_off_by: user.id,
            status: 'production_complete',
        })
        .eq('id', componentId);

    if (error) {
        console.error('error signing off production:', error);
        return { error: error.message };
    }

    // Check if all components for this job are complete
    const { data: allComponents } = await supabase
        .from('artwork_components')
        .select('status')
        .eq('job_id', component.job_id);

    const allComplete = allComponents?.every((c) => c.status === 'production_complete');
    if (allComplete) {
        await supabase
            .from('artwork_jobs')
            .update({ status: 'completed' })
            .eq('id', component.job_id);
    }

    revalidatePath(`/admin/artwork/${component.job_id}`);
    revalidatePath(`/admin/artwork/${component.job_id}/${componentId}`);
    revalidatePath('/admin/artwork');
    return { success: true };
}

// =============================================================================
// FILE UPLOAD
// =============================================================================

/**
 * Upload artwork thumbnail for a component
 */
export async function uploadArtworkThumbnail(
    componentId: string,
    formData: FormData
): Promise<{ url: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const file = formData.get('file') as File;
    if (!file) {
        return { error: 'no file provided' };
    }

    const supabase = await createServerClient();

    // Get component's job_id
    const { data: component } = await supabase
        .from('artwork_components')
        .select('job_id')
        .eq('id', componentId)
        .single();

    if (!component) {
        return { error: 'component not found' };
    }

    const ext = file.name.split('.').pop() || 'png';
    const storagePath = `${component.job_id}/${componentId}/thumbnail.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('artwork-assets')
        .upload(storagePath, file, { upsert: true });

    if (uploadError) {
        console.error('error uploading artwork thumbnail:', uploadError);
        return { error: uploadError.message };
    }

    const { data: urlData } = supabase.storage
        .from('artwork-assets')
        .getPublicUrl(storagePath);

    const url = urlData.publicUrl;

    // Update component with thumbnail URL
    await supabase
        .from('artwork_components')
        .update({ artwork_thumbnail_url: url })
        .eq('id', componentId);

    revalidatePath(`/admin/artwork/${component.job_id}`);
    revalidatePath(`/admin/artwork/${component.job_id}/${componentId}`);
    return { url };
}

// =============================================================================
// COVER IMAGE
// =============================================================================

/**
 * Upload a cover image for an artwork job
 */
export async function uploadCoverImage(
    jobId: string,
    formData: FormData
): Promise<{ path: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const file = formData.get('file') as File;
    if (!file) {
        return { error: 'no file provided' };
    }

    const supabase = await createServerClient();

    const ext = file.name.split('.').pop() || 'png';
    const storagePath = `${jobId}/cover-image.${ext}`;

    const { error: uploadError } = await supabase.storage
        .from('artwork-assets')
        .upload(storagePath, file, { upsert: true });

    if (uploadError) {
        console.error('error uploading cover image:', uploadError);
        return { error: uploadError.message };
    }

    // Update job with cover image path
    const { error: updateError } = await supabase
        .from('artwork_jobs')
        .update({ cover_image_path: storagePath })
        .eq('id', jobId);

    if (updateError) {
        console.error('error updating cover image path:', updateError);
        return { error: updateError.message };
    }

    revalidatePath(`/admin/artwork/${jobId}`);
    return { path: storagePath };
}

/**
 * Remove cover image from an artwork job
 */
export async function removeCoverImage(
    jobId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get current cover image path
    const { data: job } = await supabase
        .from('artwork_jobs')
        .select('cover_image_path')
        .eq('id', jobId)
        .single();

    if (job?.cover_image_path) {
        await supabase.storage
            .from('artwork-assets')
            .remove([job.cover_image_path]);
    }

    const { error } = await supabase
        .from('artwork_jobs')
        .update({ cover_image_path: null })
        .eq('id', jobId);

    if (error) {
        console.error('error removing cover image:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/artwork/${jobId}`);
    return { success: true };
}

// =============================================================================
// PRODUCTION INTEGRATION
// =============================================================================

/**
 * Create an artwork job linked to a production job item (idempotent).
 * Used when a job item enters an approval stage, or triggered manually.
 */
export async function createArtworkJobForItem(
    jobItemId: string
): Promise<{ id: string; jobReference: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Fetch the job_item with parent production_job context (incl. org_id for inheritance).
    const { data: itemContext } = await supabase
        .from('job_items')
        .select(
            'description, job_id, production_jobs!inner(client_name, job_number, org_id)'
        )
        .eq('id', jobItemId)
        .single();

    if (!itemContext) {
        return { error: 'job item not found' };
    }

    // Idempotent: check no artwork_job already exists for this job_item_id
    const { data: existing } = await supabase
        .from('artwork_jobs')
        .select('id, job_reference')
        .eq('job_item_id', jobItemId)
        .maybeSingle();

    if (existing) {
        return { id: existing.id, jobReference: existing.job_reference };
    }

    const pj = (itemContext as any).production_jobs;
    if (!pj?.org_id) {
        return { error: 'production job has no organisation' };
    }

    const { data, error } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: (itemContext as any).description || `Artwork for ${pj.job_number}`,
            client_name: null,
            org_id: pj.org_id,
            job_item_id: jobItemId,
            is_orphan: false,
            status: 'draft',
            created_by: user.id,
        })
        .select('id, job_reference')
        .single();

    if (error) {
        // 23505 = unique_violation race (another admin started artwork simultaneously)
        if ((error as any).code === '23505') {
            const { data: raced } = await supabase
                .from('artwork_jobs')
                .select('id, job_reference')
                .eq('job_item_id', jobItemId)
                .maybeSingle();
            if (raced) return { id: raced.id, jobReference: raced.job_reference };
        }
        console.error('error creating artwork job for item:', error);
        return { error: error.message };
    }

    revalidatePath('/admin/artwork');
    revalidatePath('/admin/jobs');
    return { id: data.id, jobReference: data.job_reference };
}

/**
 * Set (or clear) the target production stage for an artwork component.
 * This controls which department the component routes to after artwork approval.
 */
export async function setComponentTargetStage(
    componentId: string,
    targetStageId: string | null
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get the job_id for revalidation
    const { data: component } = await supabase
        .from('artwork_components')
        .select('job_id')
        .eq('id', componentId)
        .single();

    if (!component) {
        return { error: 'component not found' };
    }

    const { error } = await supabase
        .from('artwork_components')
        .update({ target_stage_id: targetStageId })
        .eq('id', componentId);

    if (error) {
        console.error('error setting component target stage:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/artwork/${component.job_id}`);
    revalidatePath(`/admin/artwork/${component.job_id}/${componentId}`);
    return { success: true };
}

/**
 * Update component type → stage default mappings.
 * Replaces all existing rows with the provided mappings.
 */
export async function updateComponentStageDefaults(
    mappings: Array<{ componentType: string; stageId: string | null }>
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Delete all existing defaults
    const { error: deleteError } = await supabase
        .from('component_stage_defaults')
        .delete()
        .neq('component_type', '');

    if (deleteError) {
        console.error('error deleting component stage defaults:', deleteError);
        return { error: deleteError.message };
    }

    // Insert only mappings where stageId is not null
    const toInsert = mappings
        .filter((m) => m.stageId)
        .map((m) => ({
            component_type: m.componentType,
            stage_id: m.stageId,
        }));

    if (toInsert.length > 0) {
        const { error: insertError } = await supabase
            .from('component_stage_defaults')
            .insert(toInsert);

        if (insertError) {
            console.error('error inserting component stage defaults:', insertError);
            return { error: insertError.message };
        }
    }

    revalidatePath('/admin/artwork/settings');
    return { success: true };
}

/**
 * Fetch all component type → stage default mappings.
 */
export async function getComponentStageDefaults(): Promise<ComponentStageDefault[]> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('component_stage_defaults')
        .select('component_type, stage_id');

    if (error) {
        console.error('error fetching component stage defaults:', error);
        return [];
    }

    return (data || []) as ComponentStageDefault[];
}

/**
 * Complete an artwork job and advance the linked production item.
 *
 * When artwork is linked to a production job_item (via artwork_jobs.job_item_id):
 *   1. Validates all components have design signed off and a target department assigned
 *   2. Rebuilds the item's stage_routing based on component target stages
 *   3. Advances the item to the next routed stage (out of artwork-approval)
 *   4. Marks the artwork job as completed
 *
 * For standalone artwork jobs (no job_item_id), simply marks the job completed.
 */
/**
 * Complete the artwork stage for an artwork_job and advance its linked
 * production job_item to the next routed stage.
 *
 * Sub-item driven (post-migration 039): iterates every sub-item across every
 * component; builds stage_routing from the UNION of their target_stage_ids
 * (ordered by production_stages.sort_order); blocks release if any sub-item
 * lacks design sign-off, production sign-off, or a target department.
 *
 * Orphan artwork jobs (no linked job_item) short-circuit: just marked
 * completed, no production advance.
 */
export async function completeArtworkAndAdvanceItem(
    artworkJobId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'Not authenticated' };
    }

    const supabase = await createServerClient();

    const { data: artworkJob, error: jobError } = await supabase
        .from('artwork_jobs')
        .select('id, job_item_id')
        .eq('id', artworkJobId)
        .single();

    if (jobError || !artworkJob) {
        return { error: 'Artwork job not found' };
    }

    // Orphan / standalone — just mark completed.
    if (!artworkJob.job_item_id) {
        await supabase
            .from('artwork_jobs')
            .update({ status: 'completed' })
            .eq('id', artworkJobId);
        revalidatePath('/admin/artwork');
        return { success: true };
    }

    // Fetch every sub-item across every component for this artwork job.
    const { data: components, error: compError } = await supabase
        .from('artwork_components')
        .select(
            `id, name,
             sub_items:artwork_component_items(
                label, name,
                design_signed_off_at, production_signed_off_at, target_stage_id
             )`
        )
        .eq('job_id', artworkJobId);

    if (compError) {
        return { error: 'Failed to fetch artwork components' };
    }
    if (!components || components.length === 0) {
        return { error: 'Artwork job has no components' };
    }

    // Shape into the pure-function input and compute gaps.
    const normalised = (components as any[]).map((c) => ({
        name: c.name,
        sub_items: (c.sub_items ?? []) as Array<{
            label: string;
            name: string | null;
            design_signed_off_at: string | null;
            production_signed_off_at: string | null;
            target_stage_id: string | null;
        }>,
    }));
    const { gaps, targetStageIds } = computeReleaseGaps(normalised);
    if (gaps.length > 0) {
        return { error: 'Cannot release: ' + gaps.join('; ') };
    }

    // Order departments by production_stages.sort_order; prepend order-book +
    // artwork-approval; append goods-out.
    const { data: allStages } = await supabase
        .from('production_stages')
        .select('id, slug, sort_order, org_id')
        .is('org_id', null)
        .order('sort_order', { ascending: true });

    if (!allStages) {
        return { error: 'Could not load production stages' };
    }

    const orderBook = allStages.find((s: any) => s.slug === 'order-book');
    const artworkStage = allStages.find((s: any) => s.slug === 'artwork-approval');
    const goodsOut = allStages.find((s: any) => s.slug === 'goods-out');

    const departmentIds = allStages
        .filter((s: any) => targetStageIds.includes(s.id))
        .filter(
            (s: any) =>
                s.slug !== 'order-book' &&
                s.slug !== 'artwork-approval' &&
                s.slug !== 'goods-out'
        )
        .map((s: any) => s.id);

    const newRouting: string[] = [];
    if (orderBook) newRouting.push(orderBook.id);
    if (artworkStage) newRouting.push(artworkStage.id);
    for (const id of departmentIds) {
        if (!newRouting.includes(id)) newRouting.push(id);
    }
    if (goodsOut && !newRouting.includes(goodsOut.id)) newRouting.push(goodsOut.id);

    const { error: routingError } = await supabase
        .from('job_items')
        .update({ stage_routing: newRouting })
        .eq('id', artworkJob.job_item_id);

    if (routingError) {
        return { error: `Failed to update item routing: ${routingError.message}` };
    }

    const advanceResult = await advanceItemToNextRoutedStage(artworkJob.job_item_id);
    if ('error' in advanceResult) {
        return { error: `Routing updated but failed to advance item: ${advanceResult.error}` };
    }

    await supabase
        .from('artwork_jobs')
        .update({ status: 'completed' })
        .eq('id', artworkJobId);

    revalidatePath('/admin/artwork');
    revalidatePath(`/admin/artwork/${artworkJobId}`);
    revalidatePath('/admin/jobs');
    revalidatePath('/shop-floor');
    return { success: true };
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * List artwork jobs with optional filters.
 *
 * Phase 1: filter taxonomy replaces the previous loose `status` string with a
 * controlled `ArtworkDashboardFilter` enum. `awaiting_approval` and `flagged`
 * are computed client-side from embedded relationships because PostgREST
 * can't filter on aggregates cheaply.
 */
export async function getArtworkJobs(
    filters?: { filter?: ArtworkDashboardFilter; search?: string }
): Promise<(ArtworkJob & { client_approved: boolean; flagged_count: number })[]> {
    const supabase = await createServerClient();
    const filter = filters?.filter ?? 'all';

    let query = supabase
        .from('artwork_jobs')
        .select(`
            *,
            artwork_approvals(status),
            artwork_components(dimension_flag)
        `)
        .order('created_at', { ascending: false });

    switch (filter) {
        case 'in_progress':
            query = query.in('status', ['draft', 'in_progress', 'design_complete', 'in_production']);
            break;
        case 'completed':
            query = query.eq('status', 'completed');
            break;
        case 'orphans':
            query = query.eq('is_orphan', true);
            break;
        // awaiting_approval, flagged, awaiting_start, all → filtered below
    }

    if (filters?.search) {
        const s = filters.search.replace(/[%,]/g, '');
        query = query.or(
            `job_name.ilike.%${s}%,job_reference.ilike.%${s}%,client_name_snapshot.ilike.%${s}%`
        );
    }

    const { data, error } = await query;
    if (error) {
        console.error('error fetching artwork jobs:', error);
        return [];
    }

    const rows = (data ?? []).map((row: any) => {
        const approvals = row.artwork_approvals ?? [];
        const components = row.artwork_components ?? [];
        const client_approved = approvals.some((a: any) => a.status === 'approved');
        const pending_approval = approvals.some((a: any) => a.status === 'pending');
        const flagged_count = components.filter(
            (c: any) => c.dimension_flag === 'out_of_tolerance'
        ).length;
        const { artwork_approvals, artwork_components, ...job } = row;
        return {
            ...job,
            client_approved,
            pending_approval,
            flagged_count,
        };
    });

    const stripPending = (r: any) => {
        const { pending_approval, ...rest } = r;
        return rest as ArtworkJob & { client_approved: boolean; flagged_count: number };
    };

    if (filter === 'awaiting_approval') {
        return rows.filter((r) => r.pending_approval).map(stripPending);
    }
    if (filter === 'flagged') {
        return rows.filter((r) => r.flagged_count > 0).map(stripPending);
    }
    return rows.map(stripPending);
}

/**
 * Single query for the unified dashboard: returns jobs + ghost rows (production
 * items at the artwork stage with no linked artwork_job) + per-filter counts
 * for the chip badges.
 */
export async function getArtworkDashboardData(
    filters?: { filter?: ArtworkDashboardFilter; search?: string }
): Promise<ArtworkDashboardData> {
    const supabase = await createServerClient();
    const filter = filters?.filter ?? 'all';

    const jobs = await getArtworkJobs(filters);

    // Ghost rows: production items at the artwork stage with no linked artwork_job yet.
    let ghostRows: ArtworkGhostRow[] = [];
    if (filter === 'all' || filter === 'awaiting_start') {
        const { data: stage } = await supabase
            .from('production_stages')
            .select('id')
            .eq('slug', 'artwork-approval')
            .is('org_id', null)
            .single();

        if (stage) {
            const { data: items } = await supabase
                .from('job_items')
                .select(`
                    id, description, item_number,
                    production_jobs!inner(
                        job_number, client_name, org_id, due_date, priority, status
                    )
                `)
                .eq('current_stage_id', stage.id)
                .order('created_at', { ascending: true });

            const activeItems = (items ?? []).filter(
                (i: any) =>
                    i.production_jobs?.status === 'active' ||
                    i.production_jobs?.status === 'paused'
            );

            if (activeItems.length > 0) {
                const { data: existing } = await supabase
                    .from('artwork_jobs')
                    .select('job_item_id')
                    .in('job_item_id', activeItems.map((i: any) => i.id));

                const started = new Set((existing ?? []).map((r: any) => r.job_item_id));

                ghostRows = activeItems
                    .filter((i: any) => !started.has(i.id))
                    .map((i: any) => ({
                        jobItemId: i.id,
                        jobItemDescription: i.description || '',
                        itemNumber: i.item_number || null,
                        productionJobNumber: i.production_jobs.job_number,
                        clientName: i.production_jobs.client_name,
                        orgId: i.production_jobs.org_id ?? null,
                        dueDate: i.production_jobs.due_date ?? null,
                        priority: i.production_jobs.priority ?? 'normal',
                    }));
            }
        }
    }

    // Lightweight summary for chip badges.
    const counts: ArtworkDashboardData['counts'] = {
        all: 0,
        awaiting_start: ghostRows.length,
        in_progress: 0,
        awaiting_approval: 0,
        flagged: 0,
        completed: 0,
        orphans: 0,
    };

    const { data: allJobsForCounts } = await supabase
        .from('artwork_jobs')
        .select(
            'id, status, is_orphan, artwork_approvals(status), artwork_components(dimension_flag)'
        );

    (allJobsForCounts ?? []).forEach((row: any) => {
        counts.all += 1;
        if (row.is_orphan) counts.orphans += 1;
        if (row.status === 'completed') counts.completed += 1;
        else counts.in_progress += 1;
        const hasPending = (row.artwork_approvals ?? []).some(
            (a: any) => a.status === 'pending'
        );
        if (hasPending) counts.awaiting_approval += 1;
        const flagged = (row.artwork_components ?? []).some(
            (c: any) => c.dimension_flag === 'out_of_tolerance'
        );
        if (flagged) counts.flagged += 1;
    });
    counts.all += ghostRows.length;

    return { jobs, ghostRows, counts };
}

/**
 * Get a single artwork job with its components
 */
export async function getArtworkJob(id: string): Promise<ArtworkJobWithProductionContext | null> {
    const supabase = await createServerClient();

    const { data: job, error } = await supabase
        .from('artwork_jobs')
        .select('*')
        .eq('id', id)
        .single();

    if (error || !job) {
        return null;
    }

    const { data: components } = await supabase
        .from('artwork_components')
        .select('*')
        .eq('job_id', id)
        .order('sort_order', { ascending: true });

    const result = {
        ...job,
        components: (components || []) as ArtworkComponent[],
    } as ArtworkJobWithComponents;

    // Fetch production context when linked to a production job item
    let production_item: ProductionItemContext | null = null;
    if (job.job_item_id) {
        const { data: itemData } = await supabase
            .from('job_items')
            .select('id, job_id, description, item_number, production_jobs!inner(job_number, client_name, due_date, priority)')
            .eq('id', job.job_item_id)
            .single();
        if (itemData) {
            const pj = (itemData as any).production_jobs;
            production_item = {
                id: itemData.id,
                job_id: (itemData as any).job_id,
                description: (itemData as any).description,
                item_number: (itemData as any).item_number,
                job_number: pj.job_number,
                client_name: pj.client_name,
                due_date: pj.due_date,
                priority: pj.priority,
            };
        }
    }

    return { ...result, production_item };
}

/**
 * Get a single component with version history and production checks
 */
export async function getComponentDetail(
    componentId: string
): Promise<ArtworkComponentWithVersions | null> {
    const supabase = await createServerClient();

    const { data: component, error } = await supabase
        .from('artwork_components')
        .select('*')
        .eq('id', componentId)
        .single();

    if (error || !component) {
        return null;
    }

    const [versionsResult, checksResult, itemsResult] = await Promise.all([
        supabase
            .from('artwork_component_versions')
            .select('*')
            .eq('component_id', componentId)
            .order('version_number', { ascending: false }),
        supabase
            .from('artwork_production_checks')
            .select('*')
            .eq('component_id', componentId)
            .order('created_at', { ascending: false }),
        supabase
            .from('artwork_component_items')
            .select('*')
            .eq('component_id', componentId)
            .order('sort_order', { ascending: true }),
    ]);

    return {
        ...component,
        versions: (versionsResult.data || []),
        production_checks: (checksResult.data || []),
        extra_items: (itemsResult.data || []),
    } as ArtworkComponentWithVersions;
}

// =============================================================================
// PRODUCTION ARTWORK QUEUE
// =============================================================================

/**
 * Fetch production job items that are currently at the artwork-approval stage,
 * along with any linked artwork_jobs so the UI can show a "Start Artwork Pack"
 * button or a link to the existing artwork job.
 */
export async function getProductionItemsAtArtworkStage(): Promise<
    Array<{
        jobItem: { id: string; description: string; item_number: string | null };
        productionJob: { job_number: string; client_name: string; due_date: string | null; priority: string };
        artworkJob: { id: string; job_reference: string; status: string } | null;
    }>
> {
    const supabase = await createServerClient();

    // 1. Find the default artwork-approval stage
    const { data: stage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', 'artwork-approval')
        .is('org_id', null)
        .single();

    if (!stage) return [];

    // 2. Fetch job_items at that stage with parent job context
    const { data: items, error } = await supabase
        .from('job_items')
        .select(`
            id, description, item_number, current_stage_id,
            production_jobs!inner(
                job_number, client_name, due_date, priority, status
            )
        `)
        .eq('current_stage_id', stage.id)
        .order('created_at', { ascending: true });

    if (error || !items || items.length === 0) return [];

    // Filter to active/paused parent jobs (PostgREST ignores .in() on embedded columns)
    const filtered = items.filter(
        (i: any) => i.production_jobs?.status === 'active' || i.production_jobs?.status === 'paused'
    );

    if (filtered.length === 0) return [];

    // 3. Batch-fetch any linked artwork_jobs for these item IDs
    const itemIds = filtered.map((i: any) => i.id);
    const { data: artworkJobs } = await supabase
        .from('artwork_jobs')
        .select('id, job_reference, status, job_item_id')
        .in('job_item_id', itemIds);

    const artworkMap = new Map<string, { id: string; job_reference: string; status: string }>();
    (artworkJobs || []).forEach((aj: any) => {
        if (aj.job_item_id) {
            artworkMap.set(aj.job_item_id, {
                id: aj.id,
                job_reference: aj.job_reference,
                status: aj.status,
            });
        }
    });

    // 4. Assemble result
    return filtered.map((i: any) => ({
        jobItem: {
            id: i.id,
            description: i.description || '',
            item_number: i.item_number || null,
        },
        productionJob: {
            job_number: (i.production_jobs as any).job_number,
            client_name: (i.production_jobs as any).client_name,
            due_date: (i.production_jobs as any).due_date || null,
            priority: (i.production_jobs as any).priority || 'normal',
        },
        artworkJob: artworkMap.get(i.id) || null,
    }));
}

// =============================================================================
// PHASE 1 — LINEAGE
// =============================================================================

/**
 * Return the quote → production → artwork lineage for a given artwork job.
 * Backed by the `artwork_job_lineage` SQL view (migration 037).
 * Returns null when the job has no production_item link (pure orphan).
 */
export async function getArtworkJobLineage(
    artworkJobId: string
): Promise<ArtworkJobLineage | null> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('artwork_job_lineage')
        .select(
            'quote_id, quote_number, production_job_id, production_job_number, job_item_id'
        )
        .eq('artwork_job_id', artworkJobId)
        .maybeSingle();

    if (error) {
        console.error('error fetching artwork lineage:', error);
        return null;
    }
    if (!data) return null;

    return {
        quoteId: data.quote_id ?? null,
        quoteNumber: data.quote_number ?? null,
        productionJobId: data.production_job_id ?? null,
        productionJobNumber: data.production_job_number ?? null,
        jobItemId: data.job_item_id ?? null,
    };
}
