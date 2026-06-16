'use server';

/**
 * Production Pack server actions.
 *
 * CRUD for designer-authored works packs. Reads/writes go through the
 * RLS-enforced server client — the production_packs policy restricts every
 * operation to super-admins (migration 061), so no extra service-role client
 * is needed here. Image uploads happen client-side straight to Supabase
 * storage (see PackBuilder) to avoid the server-action body-size limit.
 *
 * Returns are the typed Result<T> discriminated union (lib/result.ts), per the
 * current convention for new action modules.
 */

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import { ok, err, okVoid, type Result } from '@/lib/result';
import {
    CreateProductionPackInputSchema,
    UpdatePackMetaInputSchema,
    ProductionPackContentSchema,
    DEFAULT_PRODUCTION_PACK_CONTENT,
    newSection,
    parseContent,
    type ProductionPack,
    type ProductionPackContent,
} from './types';

const TABLE = 'production_packs';

const LIST_PATH = '/admin/production-packs';
const itemPath = (id: string) => `/admin/production-packs/${id}`;

// =============================================================================
// MUTATIONS
// =============================================================================

/** Create a new pack, seeded with one starter sign section. */
export async function createProductionPack(
    input: { title?: string },
): Promise<Result<{ id: string }>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const parsed = CreateProductionPackInputSchema.safeParse(input ?? {});
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'invalid input');

    const content: ProductionPackContent = {
        cover: { ...DEFAULT_PRODUCTION_PACK_CONTENT.cover },
        sections: [newSection(1)],
        style: 'steel',
    };

    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            title: parsed.data.title,
            status: 'draft',
            content,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (error) {
        console.error('error creating production pack:', error);
        return err(error.message);
    }

    revalidatePath(LIST_PATH);
    return ok({ id: data.id as string });
}

/** Update the promoted/meta columns (title, status, client, project). */
export async function updateProductionPackMeta(
    id: string,
    updates: {
        title?: string;
        status?: 'draft' | 'ready' | 'archived';
        client_name?: string | null;
        project_name?: string | null;
    },
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const parsed = UpdatePackMetaInputSchema.safeParse(updates);
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'invalid input');

    const patch: Record<string, unknown> = {};
    if (parsed.data.title !== undefined) patch.title = parsed.data.title;
    if (parsed.data.status !== undefined) patch.status = parsed.data.status;
    if (parsed.data.client_name !== undefined) patch.client_name = parsed.data.client_name;
    if (parsed.data.project_name !== undefined) patch.project_name = parsed.data.project_name;
    if (Object.keys(patch).length === 0) return okVoid();

    const supabase = await createServerClient();
    const { error } = await supabase.from(TABLE).update(patch).eq('id', id);
    if (error) {
        console.error('error updating production pack meta:', error);
        return err(error.message);
    }

    revalidatePath(LIST_PATH);
    revalidatePath(itemPath(id));
    return okVoid();
}

/**
 * Persist the full document. The builder owns the whole document and sends it
 * in one shot, so this is a full replace (no merge) — simpler and avoids
 * partial-merge bugs. The promoted client/project columns are kept in step
 * with the cover so the list view stays useful.
 */
export async function saveProductionPackContent(
    id: string,
    content: unknown,
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const parsed = ProductionPackContentSchema.safeParse(content);
    if (!parsed.success) return err(parsed.error.issues[0]?.message ?? 'invalid pack content');

    const supabase = await createServerClient();
    const { error } = await supabase
        .from(TABLE)
        .update({
            content: parsed.data,
            project_name: parsed.data.cover.projectName || null,
            client_name: parsed.data.cover.clientName || null,
        })
        .eq('id', id);

    if (error) {
        console.error('error saving production pack content:', error);
        return err(error.message);
    }

    revalidatePath(LIST_PATH);
    revalidatePath(itemPath(id));
    return okVoid();
}

/** Duplicate a pack (the v1 reuse path, since there are no templates). */
export async function duplicateProductionPack(id: string): Promise<Result<{ id: string }>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const supabase = await createServerClient();
    const { data: original, error: fetchError } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .single();

    if (fetchError || !original) {
        return err('production pack not found');
    }

    const { data: duplicate, error: createError } = await supabase
        .from(TABLE)
        .insert({
            title: `${original.title} (copy)`,
            status: 'draft',
            client_name: original.client_name,
            project_name: original.project_name,
            content: original.content,
            created_by: user.id,
        })
        .select('id')
        .single();

    if (createError) {
        console.error('error duplicating production pack:', createError);
        return err(createError.message);
    }

    revalidatePath(LIST_PATH);
    return ok({ id: duplicate.id as string });
}

/** Delete a pack. Navigation is left to the caller (returns cleanly). */
export async function deleteProductionPack(id: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const supabase = await createServerClient();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) {
        console.error('error deleting production pack:', error);
        return err(error.message);
    }

    revalidatePath(LIST_PATH);
    return okVoid();
}

// =============================================================================
// QUERIES
// =============================================================================

export async function getProductionPacks(filters?: {
    status?: string;
    search?: string;
}): Promise<ProductionPack[]> {
    const supabase = await createServerClient();

    let query = supabase.from(TABLE).select('*').order('updated_at', { ascending: false });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }
    if (filters?.search) {
        const term = filters.search.replace(/[%,()]/g, '');
        query = query.or(
            `title.ilike.%${term}%,client_name.ilike.%${term}%,project_name.ilike.%${term}%`,
        );
    }

    const { data, error } = await query;
    if (error) {
        console.error('error fetching production packs:', error);
        return [];
    }

    return (data ?? []).map((row) => ({
        ...row,
        content: parseContent(row.content),
    })) as ProductionPack[];
}

export async function getProductionPack(id: string): Promise<ProductionPack | null> {
    const supabase = await createServerClient();

    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).single();
    if (error) {
        console.error('error fetching production pack:', error);
        return null;
    }

    return { ...data, content: parseContent(data.content) } as ProductionPack;
}
