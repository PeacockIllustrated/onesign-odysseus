'use server';

/**
 * Design Pack Server Actions
 *
 * Server-side mutations for design packs.
 * All actions enforce super-admin access via RLS.
 */

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
    CreateDesignPackInput,
    CreateDesignPackInputSchema,
    UpdateDesignPackInput,
    UpdateDesignPackInputSchema,
    DesignPack,
    DesignPackData,
    DEFAULT_DESIGN_PACK_DATA,
    ParkedDecision,
    LockableSection,
} from './types';

// =============================================================================
// DESIGN PACK CRUD ACTIONS
// =============================================================================

/**
 * Create a new design pack
 */
export async function createDesignPack(
    input: CreateDesignPackInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    // Validate input
    const validation = CreateDesignPackInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('design_packs')
        .insert({
            project_name: input.project_name,
            client_name: input.client_name,
            client_email: input.client_email || null,
            status: 'in_progress',
            data_json: DEFAULT_DESIGN_PACK_DATA,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        console.error('error creating design pack:', error);
        return { error: error.message };
    }

    revalidatePath('/app/admin/design-packs');
    return { id: data.id };
}

/**
 * Update an existing design pack
 */
export async function updateDesignPack(
    id: string,
    updates: UpdateDesignPackInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    // Validate input
    const validation = UpdateDesignPackInputSchema.safeParse(updates);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }

    const supabase = await createServerClient();

    // Build update object dynamically
    const updateData: any = {
        updated_at: new Date().toISOString(),
    };

    if (updates.project_name !== undefined) updateData.project_name = updates.project_name;
    if (updates.client_name !== undefined) updateData.client_name = updates.client_name;
    if (updates.client_email !== undefined) updateData.client_email = updates.client_email;
    if (updates.status !== undefined) updateData.status = updates.status;

    // Handle data_json updates (merge with existing)
    if (updates.data_json) {
        const { data: existing } = await supabase
            .from('design_packs')
            .select('data_json')
            .eq('id', id)
            .single();

        if (existing) {
            updateData.data_json = {
                ...existing.data_json,
                ...updates.data_json,
            };
        }
    }

    const { error } = await supabase
        .from('design_packs')
        .update(updateData)
        .eq('id', id);

    if (error) {
        console.error('error updating design pack:', error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/design-packs/${id}`);
    revalidatePath('/app/admin/design-packs');
    return { success: true };
}

/**
 * Update design pack data_json field
 * Convenience method for updating just the design data
 */
export async function updateDesignPackData(
    id: string,
    dataUpdates: Partial<DesignPackData>
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get existing data
    const { data: existing, error: fetchError } = await supabase
        .from('design_packs')
        .select('data_json')
        .eq('id', id)
        .single();

    if (fetchError) {
        console.error('error fetching design pack:', fetchError);
        return { error: fetchError.message };
    }

    // Merge updates
    const updatedData = {
        ...existing.data_json,
        ...dataUpdates,
    };

    const { error } = await supabase
        .from('design_packs')
        .update({
            data_json: updatedData,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error('error updating design pack data:', error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/design-packs/${id}`);
    return { success: true };
}

/**
 * Delete a design pack
 */
export async function deleteDesignPack(id: string): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    const { error } = await supabase.from('design_packs').delete().eq('id', id);

    if (error) {
        console.error('error deleting design pack:', error);
        return { error: error.message };
    }

    revalidatePath('/app/admin/design-packs');
    redirect('/app/admin/design-packs');
}

/**
 * Duplicate a design pack
 */
export async function duplicateDesignPack(id: string): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get original pack
    const { data: original, error: fetchError } = await supabase
        .from('design_packs')
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !original) {
        console.error('error fetching design pack:', fetchError);
        return { error: 'design pack not found' };
    }

    // Create duplicate with modified data
    const { data: duplicate, error: createError } = await supabase
        .from('design_packs')
        .insert({
            project_name: `${original.project_name} (copy)`,
            client_name: original.client_name,
            client_email: original.client_email,
            status: 'in_progress',
            data_json: {
                ...original.data_json,
                export_history: [], // Clear export history
                parked_decisions: [], // Clear parked decisions
            },
            created_by: user.id,
        })
        .select('id')
        .single();

    if (createError) {
        console.error('error duplicating design pack:', createError);
        return { error: createError.message };
    }

    revalidatePath('/app/admin/design-packs');
    return { id: duplicate.id };
}

// =============================================================================
// SECTION LOCKING ACTIONS
// =============================================================================

/**
 * Lock a section in presentation mode
 */
export async function lockSection(
    id: string,
    section: LockableSection
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get existing data
    const { data: existing, error: fetchError } = await supabase
        .from('design_packs')
        .select('data_json')
        .eq('id', id)
        .single();

    if (fetchError || !existing) {
        return { error: 'design pack not found' };
    }

    // Update the locked field for the section
    const updatedData = { ...existing.data_json };
    if (updatedData[section]) {
        updatedData[section] = {
            ...updatedData[section],
            locked: true,
        };
    }

    const { error } = await supabase
        .from('design_packs')
        .update({
            data_json: updatedData,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error('error locking section:', error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/design-packs/${id}`);
    revalidatePath(`/app/admin/design-packs/${id}/present`);
    return { success: true };
}

/**
 * Unlock a section
 */
export async function unlockSection(
    id: string,
    section: LockableSection
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get existing data
    const { data: existing, error: fetchError } = await supabase
        .from('design_packs')
        .select('data_json')
        .eq('id', id)
        .single();

    if (fetchError || !existing) {
        return { error: 'design pack not found' };
    }

    // Update the locked field for the section
    const updatedData = { ...existing.data_json };
    if (updatedData[section]) {
        updatedData[section] = {
            ...updatedData[section],
            locked: false,
        };
    }

    const { error } = await supabase
        .from('design_packs')
        .update({
            data_json: updatedData,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error('error unlocking section:', error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/design-packs/${id}`);
    revalidatePath(`/app/admin/design-packs/${id}/present`);
    return { success: true };
}

// =============================================================================
// PARKED DECISIONS
// =============================================================================

/**
 * Add a parked decision
 */
export async function parkDecision(
    id: string,
    decision: Omit<ParkedDecision, 'created_at'>
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get existing data
    const { data: existing, error: fetchError } = await supabase
        .from('design_packs')
        .select('data_json')
        .eq('id', id)
        .single();

    if (fetchError || !existing) {
        return { error: 'design pack not found' };
    }

    // Check limit (max 5 parked decisions)
    const currentParked = existing.data_json.parked_decisions || [];
    if (currentParked.length >= 5) {
        return { error: 'maximum 5 parked decisions allowed' };
    }

    // Add new parked decision
    const newParkedDecision: ParkedDecision = {
        ...decision,
        created_at: new Date().toISOString(),
    };

    const updatedData = {
        ...existing.data_json,
        parked_decisions: [...currentParked, newParkedDecision],
    };

    const { error } = await supabase
        .from('design_packs')
        .update({
            data_json: updatedData,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error('error parking decision:', error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/design-packs/${id}`);
    revalidatePath(`/app/admin/design-packs/${id}/present`);
    return { success: true };
}

/**
 * Remove a parked decision
 */
export async function removeParkedDecision(
    id: string,
    section: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get existing data
    const { data: existing, error: fetchError } = await supabase
        .from('design_packs')
        .select('data_json')
        .eq('id', id)
        .single();

    if (fetchError || !existing) {
        return { error: 'design pack not found' };
    }

    // Remove parked decision by section
    const currentParked = existing.data_json.parked_decisions || [];
    const updatedParked = currentParked.filter((pd: ParkedDecision) => pd.section !== section);

    const updatedData = {
        ...existing.data_json,
        parked_decisions: updatedParked,
    };

    const { error } = await supabase
        .from('design_packs')
        .update({
            data_json: updatedData,
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    if (error) {
        console.error('error removing parked decision:', error);
        return { error: error.message };
    }

    revalidatePath(`/app/admin/design-packs/${id}`);
    revalidatePath(`/app/admin/design-packs/${id}/present`);
    return { success: true };
}

// =============================================================================
// EXPORT TRACKING
// =============================================================================

/**
 * Record a PDF export
 */
export async function recordExport(id: string): Promise<{ version: number } | { error: string }> {
    const user = await getUser();
    if (!user) {
        return { error: 'not authenticated' };
    }

    const supabase = await createServerClient();

    // Get current max version for this pack
    const { data: exports } = await supabase
        .from('design_pack_exports')
        .select('version')
        .eq('design_pack_id', id)
        .order('version', { ascending: false })
        .limit(1);

    const nextVersion = (exports?.[0]?.version || 0) + 1;

    // Create export record
    const { error } = await supabase.from('design_pack_exports').insert({
        design_pack_id: id,
        version: nextVersion,
        pdf_storage_path: `design-pack-assets/${id}/exports/v${nextVersion}.pdf`,
        exported_by: user.id,
    });

    if (error) {
        console.error('error recording export:', error);
        return { error: error.message };
    }

    // Update pack status to exported
    await supabase
        .from('design_packs')
        .update({
            status: 'exported',
            updated_at: new Date().toISOString(),
        })
        .eq('id', id);

    revalidatePath(`/app/admin/design-packs/${id}`);
    revalidatePath('/app/admin/design-packs');
    return { version: nextVersion };
}

// =============================================================================
// QUERY HELPERS
// =============================================================================

/**
 * Get all design packs (for list view)
 */
export async function getDesignPacks(filters?: {
    status?: string;
    search?: string;
}): Promise<DesignPack[]> {
    const supabase = await createServerClient();

    let query = supabase
        .from('design_packs')
        .select('*')
        .order('created_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters?.search) {
        query = query.or(
            `project_name.ilike.%${filters.search}%,client_name.ilike.%${filters.search}%`
        );
    }

    const { data, error } = await query;

    if (error) {
        console.error('error fetching design packs:', error);
        return [];
    }

    return (data as DesignPack[]) || [];
}

/**
 * Get a single design pack by ID
 */
export async function getDesignPack(id: string): Promise<DesignPack | null> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('design_packs')
        .select('*')
        .eq('id', id)
        .single();

    if (error) {
        console.error('error fetching design pack:', error);
        return null;
    }

    return data as DesignPack;
}

/**
 * Get export history for a design pack
 */
export async function getExportHistory(designPackId: string) {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('design_pack_exports')
        .select('*')
        .eq('design_pack_id', designPackId)
        .order('version', { ascending: false });

    if (error) {
        console.error('error fetching export history:', error);
        return [];
    }

    return data || [];
}
