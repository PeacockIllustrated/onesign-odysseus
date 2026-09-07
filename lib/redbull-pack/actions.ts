'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { ok, okVoid, err, type Result } from '@/lib/result';
import {
    UpdateRowSchema,
    SetPublishedSchema,
    type UpdateRowInput,
    type SetPublishedInput,
    type JobPack,
    type PackRow,
    type PackState,
    type ArtworkPart,
    DEFAULT_PACK_SLUG,
} from './types';

/**
 * Everything the editor needs, in one round trip.
 *
 * Deliberately the RLS-enforced client rather than the service role: the
 * redbull_* policies already say who may read and who may write, so letting
 * them decide keeps the UI and the database from disagreeing. Nothing here
 * needs to bypass RLS.
 */
export async function getJobPack(
    slug: string = DEFAULT_PACK_SLUG
): Promise<Result<{ pack: JobPack; states: PackState[] }>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const supabase = await createServerClient();

    const [{ data: packData, error: packError }, { data: stateData, error: stateError }] =
        await Promise.all([
            supabase
                .from('redbull_packs')
                .select(
                    `
                    id, slug, client, venue, title, revision, issued, updated,
                    is_published, updated_at,
                    sheets:redbull_sheets (
                        id, slug, number, nav, title, subtitle, type, position,
                        panels:redbull_panels (
                            id, slug, title, note, colour, is_wide, footnote, position,
                            rows:redbull_rows (
                                id, code, name, size, artwork, position, updated_at
                            )
                        )
                    )
                `
                )
                .eq('slug', slug)
                .maybeSingle(),
            supabase
                .from('redbull_states')
                .select('key, label, note, position')
                .order('position'),
        ]);

    if (packError) return err(packError.message);
    if (stateError) return err(stateError.message);
    if (!packData) return err(`no job pack with slug "${slug}"`);

    // PostgREST will not order two levels down, so the tree is sorted here.
    const pack = packData as unknown as JobPack;
    pack.sheets = (pack.sheets ?? [])
        .map((sheet) => ({
            ...sheet,
            panels: (sheet.panels ?? [])
                .map((panel) => ({
                    ...panel,
                    rows: (panel.rows ?? [])
                        .map((row) => ({ ...row, artwork: normaliseArtwork(row.artwork) }))
                        .sort((a, b) => a.position - b.position),
                }))
                .sort((a, b) => a.position - b.position),
        }))
        .sort((a, b) => a.position - b.position);

    return ok({ pack, states: (stateData ?? []) as PackState[] });
}

/** jsonb comes back as unknown; keep only well-formed parts. */
function normaliseArtwork(value: unknown): ArtworkPart[] {
    if (!Array.isArray(value)) return [];
    return value.flatMap((entry) => {
        if (!entry || typeof entry !== 'object') return [];
        const { label, state } = entry as Record<string, unknown>;
        if (typeof label !== 'string' || typeof state !== 'string') return [];
        return [{ label, state }];
    });
}

/**
 * Update one row. This is the field the whole job pack is edited through, so
 * it is the only write path the editor needs.
 */
export async function updateRow(
    rowId: string,
    patch: UpdateRowInput
): Promise<Result<PackRow>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const validation = UpdateRowSchema.safeParse(patch);
    if (!validation.success) return err(validation.error.issues[0].message);
    const parsed = validation.data;

    const supabase = await createServerClient();

    // States are data, not an enum, so check the value against the table
    // rather than trusting a constant that would drift.
    if (parsed.artwork?.length) {
        const { data: states, error: stateError } = await supabase
            .from('redbull_states')
            .select('key');
        if (stateError) return err(stateError.message);

        const valid = new Set((states ?? []).map((s) => s.key as string));
        const unknown = parsed.artwork.find((p) => !valid.has(p.state));
        if (unknown) {
            return err(
                `"${unknown.state}" is not a known artwork state (${[...valid].sort().join(', ')})`
            );
        }
    }

    const updates: Record<string, unknown> = { updated_by: user.id };
    if (parsed.code !== undefined) updates.code = parsed.code;
    if (parsed.name !== undefined) updates.name = parsed.name || null;
    if (parsed.size !== undefined) updates.size = parsed.size || null;
    if (parsed.artwork !== undefined) updates.artwork = parsed.artwork;

    const { data, error } = await supabase
        .from('redbull_rows')
        .update(updates)
        .eq('id', rowId)
        .select('id, code, name, size, artwork, position, updated_at')
        .maybeSingle();

    if (error) return err(error.message);
    // RLS returns no row rather than an error when the write is not permitted.
    if (!data) return err('row not found, or you do not have permission to edit it');

    revalidatePath('/admin/redbull-pack');
    return ok({ ...(data as PackRow), artwork: normaliseArtwork(data.artwork) });
}

/**
 * Publish or unpublish. Unpublishing is the kill switch — the public endpoint
 * starts returning 404 within its cache window.
 */
export async function setPackPublished(
    input: SetPublishedInput
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const validation = SetPublishedSchema.safeParse(input);
    if (!validation.success) return err(validation.error.issues[0].message);
    const { packId, isPublished } = validation.data;

    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('redbull_packs')
        .update({ is_published: isPublished })
        .eq('id', packId)
        .select('id')
        .maybeSingle();

    if (error) return err(error.message);
    if (!data) return err('only a super admin can publish or unpublish the pack');

    revalidatePath('/admin/redbull-pack');
    return okVoid();
}
