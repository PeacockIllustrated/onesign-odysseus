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
} from './types';
import { checkDimensionTolerance } from './utils';
import { advanceItemToNextRoutedStage } from '@/lib/production/actions';

// =============================================================================
// JOB CRUD
// =============================================================================

/**
 * Create a new artwork job
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

    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: validation.data.job_name,
            client_name: validation.data.client_name || null,
            description: validation.data.description || null,
            status: 'draft',
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
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

    // Fetch the job_item with parent production_job context
    const { data: itemContext } = await supabase
        .from('job_items')
        .select('description, job_id, production_jobs!inner(client_name, job_number)')
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

    const { data, error } = await supabase
        .from('artwork_jobs')
        .insert({
            job_name: (itemContext as any).description || `Artwork for ${pj.job_number}`,
            client_name: pj.client_name,
            job_item_id: jobItemId,
            status: 'draft',
            created_by: user.id,
        })
        .select('id, job_reference')
        .single();

    if (error) {
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
export async function completeArtworkAndAdvanceItem(
    artworkJobId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'Not authenticated' };
    }

    const supabase = await createServerClient();

    // Fetch the artwork job
    const { data: artworkJob, error: jobError } = await supabase
        .from('artwork_jobs')
        .select('*')
        .eq('id', artworkJobId)
        .single();

    if (jobError || !artworkJob) {
        return { error: 'Artwork job not found' };
    }

    // Standalone check: no linked production item — just mark completed
    if (!artworkJob.job_item_id) {
        await supabase
            .from('artwork_jobs')
            .update({ status: 'completed' })
            .eq('id', artworkJobId);

        revalidatePath('/admin/artwork');
        return { success: true };
    }

    // Fetch all components for this artwork job
    const { data: components, error: compError } = await supabase
        .from('artwork_components')
        .select('id, design_signed_off_at, target_stage_id')
        .eq('job_id', artworkJobId);

    if (compError) {
        return { error: 'Failed to fetch artwork components' };
    }

    // Validate: all components must have design signed off and a department assigned
    const allValid = (components || []).every(
        (c) => c.design_signed_off_at !== null && c.target_stage_id !== null
    );
    if (!allValid) {
        return { error: 'All components must have design signed off and a department assigned' };
    }

    // Collect unique target stage IDs from components
    const targetStageIds = [
        ...new Set(
            (components || [])
                .map((c) => c.target_stage_id)
                .filter((id): id is string => id !== null)
        ),
    ];

    // Fetch target stages ordered by sort_order
    const { data: targetStages } = await supabase
        .from('production_stages')
        .select('id, sort_order, slug')
        .in('id', targetStageIds)
        .order('sort_order', { ascending: true });

    // Fetch special stages: order-book, artwork-approval, goods-out
    const [
        { data: orderBookStage },
        { data: artworkStage },
        { data: goodsOutStage },
    ] = await Promise.all([
        supabase
            .from('production_stages')
            .select('id')
            .eq('slug', 'order-book')
            .is('org_id', null)
            .single(),
        supabase
            .from('production_stages')
            .select('id')
            .eq('slug', 'artwork-approval')
            .is('org_id', null)
            .single(),
        supabase
            .from('production_stages')
            .select('id')
            .eq('slug', 'goods-out')
            .is('org_id', null)
            .single(),
    ]);

    // Build new routing array
    const newRouting: string[] = [];

    // Start with Order Book + Artwork Approval (already visited)
    if (orderBookStage) newRouting.push(orderBookStage.id);
    if (artworkStage) newRouting.push(artworkStage.id);

    // Add assigned departments in sort_order
    for (const stage of targetStages || []) {
        if (!newRouting.includes(stage.id)) {
            newRouting.push(stage.id);
        }
    }

    // Always end with Goods Out
    if (goodsOutStage && !newRouting.includes(goodsOutStage.id)) {
        newRouting.push(goodsOutStage.id);
    }

    // Update the job_item's stage_routing
    const { error: routingError } = await supabase
        .from('job_items')
        .update({ stage_routing: newRouting })
        .eq('id', artworkJob.job_item_id);

    if (routingError) {
        return { error: `Failed to update item routing: ${routingError.message}` };
    }

    // Advance the item to the next routed stage
    const advanceResult = await advanceItemToNextRoutedStage(artworkJob.job_item_id);
    if ('error' in advanceResult) {
        return { error: `Routing updated but failed to advance item: ${advanceResult.error}` };
    }

    // Mark the artwork job as completed
    await supabase
        .from('artwork_jobs')
        .update({ status: 'completed' })
        .eq('id', artworkJobId);

    revalidatePath('/admin/artwork');
    revalidatePath('/admin/jobs');
    revalidatePath('/shop-floor');
    return { success: true };
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * List artwork jobs with optional filters
 */
export async function getArtworkJobs(
    filters?: { status?: string; search?: string }
): Promise<(ArtworkJob & { client_approved: boolean })[]> {
    const supabase = await createServerClient();

    let query = supabase
        .from('artwork_jobs')
        .select('*, artwork_approvals(status)')
        .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters?.search) {
        query = query.or(
            `job_name.ilike.%${filters.search}%,job_reference.ilike.%${filters.search}%,client_name.ilike.%${filters.search}%`
        );
    }

    const { data, error } = await query;

    if (error) {
        console.error('error fetching artwork jobs:', error);
        return [];
    }

    return (data || []).map((row: any) => {
        const approvals = row.artwork_approvals || [];
        const client_approved = approvals.some((a: any) => a.status === 'approved');
        const { artwork_approvals, ...job } = row;
        return { ...job, client_approved } as ArtworkJob & { client_approved: boolean };
    });
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
