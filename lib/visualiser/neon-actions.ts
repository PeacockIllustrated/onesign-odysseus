'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';

/**
 * Saved neon designs.
 *
 * Reuses the `visualiser_designs` table (its `params_json` is unconstrained
 * JSONB) with a `kind: 'neon'` discriminator, so neon take-offs persist + are
 * shared exactly like the folded-panel designs — no separate table. The panel
 * tool's `listDesigns` filters these out, and this module only returns rows
 * tagged 'neon', so the two never see each other's records.
 *
 * A neon design is just the uploaded SVG plus the tool's settings (the real-
 * world calibration, backboard, glow saturation) — enough to reopen it exactly.
 */

const TABLE = 'visualiser_designs';
const KIND = 'neon';

export interface NeonDesignConfig {
    /** Real-world calibration — one of these, in mm (blank = trust the SVG). */
    widthMm: number | null;
    heightMm: number | null;
    backboardEnabled: boolean;
    backboardPaddingMm: number;
    saturation: number;
}

export interface NeonDesignRow {
    id: string;
    name: string;
    svg_source: string | null;
    params_json: { kind: 'neon' } & NeonDesignConfig;
    created_at: string;
    updated_at: string;
}

function isNeon(row: { params_json?: unknown }): boolean {
    const p = row.params_json as { kind?: string } | null;
    return !!p && p.kind === KIND;
}

/** List saved neon designs, most recent first. */
export async function listNeonDesigns(): Promise<Result<NeonDesignRow[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('id, name, svg_source, params_json, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);

    if (error) return err(error.message);
    return ok(((data ?? []) as NeonDesignRow[]).filter(isNeon));
}

/** Create or update a neon design. */
export async function saveNeonDesign(input: {
    id?: string | null;
    name: string;
    svgSource: string;
    config: NeonDesignConfig;
}): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const name = input.name.trim();
    if (!name || name.length > 120) return err('name must be 1–120 characters');
    if (!input.svgSource) return err('no SVG to save');

    const supabase = createAdminClient();
    const row = {
        name,
        params_json: { kind: KIND, ...input.config },
        svg_source: input.svgSource,
        updated_at: new Date().toISOString(),
    };

    if (input.id) {
        const { error } = await supabase
            .from(TABLE)
            .update(row)
            .eq('id', input.id);
        if (error) return err(error.message);
        revalidatePath('/admin/visualiser/neon');
        return ok({ id: input.id });
    }

    const user = await getUser();
    const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...row, created_by: user?.id ?? null })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/visualiser/neon');
    return ok({ id: data.id as string });
}

/** Delete a neon design (guards against deleting a non-neon row by mistake). */
export async function deleteNeonDesign(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error: readErr } = await supabase
        .from(TABLE)
        .select('params_json')
        .eq('id', id)
        .maybeSingle();
    if (readErr) return err(readErr.message);
    if (!data || !isNeon(data)) return err('neon design not found');

    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/visualiser/neon');
    return ok(null);
}
