'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, okVoid, type Result } from '@/lib/result';
import {
    AddToBackshopInputSchema,
    checksForFeatures,
    normaliseChecks,
    type AddToBackshopInput,
} from './types';

const TABLE = 'backshop_items';
const BUCKET = 'backshop';

/**
 * Push a visualiser design onto the workshop TV board. Snapshots the display
 * fields + 3D thumbnail at push time and stores the reference PDF in the
 * private 'backshop' bucket. Re-pushing the same design refreshes its snapshot
 * in place (one active card per design). Super-admin only (designers push).
 */
export async function addToBackshop(
    input: AddToBackshopInput,
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = AddToBackshopInputSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const d = parsed.data;
    const supabase = createAdminClient();

    // Upload the reference PDF (if supplied) to a stable per-design path.
    let pdfPath: string | null = null;
    if (d.pdfBase64) {
        const path = `${d.designId}/reference.pdf`;
        const bytes = Buffer.from(d.pdfBase64, 'base64');
        const { error: upErr } = await supabase.storage
            .from(BUCKET)
            .upload(path, bytes, {
                contentType: 'application/pdf',
                upsert: true,
            });
        if (upErr) return err(`PDF upload failed: ${upErr.message}`);
        pdfPath = path;
    }

    const user = await getUser();
    const now = new Date().toISOString();

    // Manual upsert by design_id (the unique index is partial, so an ON
    // CONFLICT arbiter can't be used cleanly) — refresh the snapshot if the
    // design is already on the board, else insert a fresh card.
    const { data: existing, error: findErr } = await supabase
        .from(TABLE)
        .select('id, checks')
        .eq('design_id', d.designId)
        .maybeSingle();
    if (findErr) return err(findErr.message);

    // Contextual stages from the design's construction. On a re-push, keep the
    // tick state of any stage that still applies; add new stages as unticked;
    // drop stages that no longer apply.
    const applicable = checksForFeatures(d.features ?? {});
    const prevChecks = existing
        ? normaliseChecks(existing.checks as Record<string, unknown> | null)
        : {};
    const checks: Record<string, boolean> = {};
    for (const k of Object.keys(applicable)) {
        checks[k] = prevChecks[k] ?? false;
    }

    const snapshot = {
        design_id: d.designId,
        name: d.name,
        description: d.description ?? null,
        width_mm: d.widthMm ?? null,
        height_mm: d.heightMm ?? null,
        returns_mm: d.returnsMm ?? null,
        shadow_gap_mm: d.shadowGapMm ?? null,
        thumbnail: d.thumbnailDataUrl ?? null,
        pdf_path: pdfPath,
        checks,
        // Re-surfacing a finished card brings it back onto the active board.
        archived: false,
        updated_at: now,
    };

    if (existing) {
        const { error } = await supabase
            .from(TABLE)
            .update(snapshot)
            .eq('id', existing.id);
        if (error) return err(error.message);
        revalidatePath('/backshop');
        return ok({ id: existing.id as string });
    }

    const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...snapshot, added_by: user?.id ?? null })
        .select('id')
        .single();
    if (error) return err(error.message);
    revalidatePath('/backshop');
    return ok({ id: data.id as string });
}

/**
 * Tick / untick a production stage. Any authed user (the floor on the TV).
 */
export async function toggleBackshopCheck(
    id: string,
    stageKey: string,
    value: boolean,
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const supabase = createAdminClient();
    const { data: row, error: findErr } = await supabase
        .from(TABLE)
        .select('checks')
        .eq('id', id)
        .maybeSingle();
    if (findErr) return err(findErr.message);
    if (!row) return err('item not found');

    const checks = normaliseChecks(
        row.checks as Record<string, boolean> | null,
    );
    // Only toggle a stage the item actually carries.
    if (!(stageKey in checks)) return err('unknown stage');
    checks[stageKey] = value;

    const { error } = await supabase
        .from(TABLE)
        .update({ checks, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) return err(error.message);

    revalidatePath('/backshop');
    revalidatePath(`/backshop/${id}`);
    return okVoid();
}

/**
 * Clear a finished card off the active board (or restore it). Any authed user.
 */
export async function setBackshopArchived(
    id: string,
    archived: boolean,
): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const supabase = createAdminClient();
    const { error } = await supabase
        .from(TABLE)
        .update({ archived, updated_at: new Date().toISOString() })
        .eq('id', id);
    if (error) return err(error.message);

    revalidatePath('/backshop');
    revalidatePath(`/backshop/${id}`);
    return okVoid();
}

/**
 * Whether a design is already on the board — drives the visualiser's
 * "Add / Update backshop screen" button label. Any authed user.
 */
export async function isDesignOnBackshop(designId: string): Promise<boolean> {
    const user = await getUser();
    if (!user) return false;
    const supabase = createAdminClient();
    const { data } = await supabase
        .from(TABLE)
        .select('id')
        .eq('design_id', designId)
        .maybeSingle();
    return !!data;
}
