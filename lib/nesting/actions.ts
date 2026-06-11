'use server';

/**
 * Saved-nest CRUD — mirrors lib/visualiser/actions.ts.
 *
 * A nest is the raw uploaded artwork SVG plus its run config; reloading one
 * restores both so the operator can revise sheet/gap/rotation and re-nest.
 * Super-admin-gated writes via the service-role client (RLS on the table is
 * super-admin-only for writes, read for any authed user — migration 064).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import type { NestingDesignRow, NestingDesignSummary } from './types';

const TABLE = 'nesting_designs';

const NestConfigSchema = z.object({
    sheetWidthMm: z.number().positive(),
    sheetHeightMm: z.number().positive(),
    marginMm: z.number().min(0),
    gapMm: z.number().min(0),
    rotationStepDeg: z.union([
        z.literal(0),
        z.literal(15),
        z.literal(30),
        z.literal(45),
        z.literal(90),
    ]),
    allowHoleNesting: z.boolean(),
    resolutionMm: z.number().positive(),
    maxSheets: z.number().int().positive(),
});

const SaveSchema = z.object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(1, 'name is required').max(120),
    svgSource: z.string().min(1, 'artwork is required').max(10_000_000),
    config: NestConfigSchema,
    widthCalMm: z.number().positive().nullable().optional(),
    fileName: z.string().max(260).nullable().optional(),
});
export type SaveNestingDesignInput = z.infer<typeof SaveSchema>;

/** List saved nests, most recent first (no SVG/config payload). */
export async function listNestingDesigns(): Promise<
    Result<NestingDesignSummary[]>
> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('id, name, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);

    if (error) return err(error.message);
    return ok((data ?? []) as NestingDesignSummary[]);
}

/** Load a single saved nest in full (SVG + config). */
export async function getNestingDesign(
    id: string,
): Promise<Result<NestingDesignRow>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) return err(error.message);
    if (!data) return err('nest not found');
    return ok(data as NestingDesignRow);
}

/** Create (no id) or update (with id) a saved nest. */
export async function saveNestingDesign(
    input: SaveNestingDesignInput,
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { id, name, svgSource, config, widthCalMm, fileName } = parsed.data;

    const supabase = createAdminClient();
    const row = {
        name,
        svg_source: svgSource,
        config_json: {
            config,
            widthCalMm: widthCalMm ?? null,
            fileName: fileName ?? null,
        },
        updated_at: new Date().toISOString(),
    };

    if (id) {
        const { error } = await supabase.from(TABLE).update(row).eq('id', id);
        if (error) return err(error.message);
        revalidatePath('/admin/nesting');
        return ok({ id });
    }

    const user = await getUser();
    const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...row, created_by: user?.id ?? null })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/nesting');
    return ok({ id: data.id as string });
}

/** Delete a saved nest. */
export async function deleteNestingDesign(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/nesting');
    return ok(null);
}
