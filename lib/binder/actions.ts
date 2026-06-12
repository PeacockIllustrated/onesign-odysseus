'use server';

/**
 * SVG binder — a shared library of client logo SVGs (migration 066).
 *
 * "Save to binder" in the Image → SVG converter drops a cleaned, signage-ready
 * logo here; a binder picker at every "upload SVG" point (visualiser, neon,
 * returns, nesting) reads it back, so a logo vectorised once is reusable
 * everywhere. Same access model as nesting_designs / letter_return_jobs:
 * super-admin manages via the service role; any authed user reads/creates.
 *
 * The list includes `svg_source` so the picker can render real thumbnails —
 * logos are small — capped so the payload stays sane; filter by client to
 * narrow a big library. Client names are resolved client-side from the org
 * list the picker already loads (no PostgREST embed).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';

const TABLE = 'binder_assets';

export interface BinderAssetSummary {
    id: string;
    name: string;
    org_id: string | null;
    /** The SVG — included so the picker can thumbnail it. */
    svg_source: string;
    updated_at: string;
}

export interface BinderAssetRow extends BinderAssetSummary {
    created_by: string | null;
    created_at: string;
}

const SaveSchema = z.object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1, 'name is required').max(160),
    svgSource: z.string().min(1, 'svg is required').max(5_000_000),
    orgId: z.string().uuid().nullable().optional(),
});
export type SaveBinderAssetInput = z.infer<typeof SaveSchema>;

/** List binder assets (newest first), optionally for one client. Includes the
 *  SVG for thumbnails — capped to keep the payload reasonable. */
export async function listBinderAssets(
    orgId?: string | null,
): Promise<Result<BinderAssetSummary[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    let query = supabase
        .from(TABLE)
        .select('id, name, org_id, svg_source, updated_at')
        .order('updated_at', { ascending: false })
        .limit(150);
    if (orgId) query = query.eq('org_id', orgId);

    const { data, error } = await query;
    if (error) return err(error.message);
    return ok((data ?? []) as BinderAssetSummary[]);
}

/** Create (no id) or update (with id) a binder asset. Returns its id. */
export async function saveBinderAsset(
    input: SaveBinderAssetInput,
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { id, name, svgSource, orgId } = parsed.data;

    const supabase = createAdminClient();
    const row = {
        name,
        svg_source: svgSource,
        org_id: orgId ?? null,
        updated_at: new Date().toISOString(),
    };

    if (id) {
        const { error } = await supabase.from(TABLE).update(row).eq('id', id);
        if (error) return err(error.message);
        revalidatePath('/admin/binder');
        return ok({ id });
    }

    const user = await getUser();
    const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...row, created_by: user?.id ?? null })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/binder');
    return ok({ id: data.id as string });
}

/** Delete a binder asset. */
export async function deleteBinderAsset(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/binder');
    return ok(null);
}
