'use server';

/**
 * "Send metal faces to nester" — the extra-face handoff.
 *
 * Mirrors the built-up-returns handoff (returns-actions.ts), but a visualiser
 * nest links back to its `visualiser_designs` row instead of a
 * `letter_return_jobs` row: it writes a `nesting_designs` row whose SVG carries
 * the metal faces (built by buildExtraFaceNestSvg), tagged
 * `source_kind='panel_extra_face'` + `source_design_id` (migration 068) so the
 * nester can banner back to the design and the design can list its nests.
 *
 * The design must already be saved (the caller saves it first, exactly like the
 * returns tool saves its job before sending) so there's a row to link to.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import { DEFAULT_NEST_CONFIG } from '@/lib/nesting/types';
import { FaceMaterialEnum } from './types';
import { FACE_MATERIALS } from './extra-face';

const NESTS = 'nesting_designs';
const DESIGNS = 'visualiser_designs';

/** A nest produced from a design — for the design's "nested here" back-list. */
export interface LinkedNest {
    id: string;
    name: string;
    updated_at: string;
}

const SendSchema = z.object({
    designId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    combinedSvg: z.string().min(1).max(10_000_000),
    material: FaceMaterialEnum,
    fileName: z.string().max(260).nullable().optional(),
});
export type SendExtraFaceInput = z.infer<typeof SendSchema>;

/**
 * Push a design's extra metal faces to the acrylic nester as one new nest,
 * linked back to the design. Returns the new nest id so the caller can
 * deep-link into `/admin/nesting?open=<id>`.
 */
export async function sendExtraFaceToNester(
    input: SendExtraFaceInput,
): Promise<Result<{ nestId: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SendSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { designId, name, combinedSvg, material, fileName } = parsed.data;

    const supabase = createAdminClient();
    // The design must exist (and gives us the authoritative name for the nest).
    const { data: design, error: dErr } = await supabase
        .from(DESIGNS)
        .select('id, name')
        .eq('id', designId)
        .maybeSingle();
    if (dErr) return err(dErr.message);
    if (!design) return err('design not found');

    const user = await getUser();
    const label = FACE_MATERIALS[material].label;
    const nestName = `${name} — ${label} faces`;
    const { data, error } = await supabase
        .from(NESTS)
        .insert({
            name: nestName,
            svg_source: combinedSvg,
            config_json: {
                config: DEFAULT_NEST_CONFIG,
                // The SVG is already true mm — no calibration needed.
                widthCalMm: null,
                fileName: fileName ?? nestName,
                keptGroupIds: [],
                sourceDesignName: design.name as string,
            },
            source_kind: 'panel_extra_face',
            source_design_id: designId,
            created_by: user?.id ?? null,
        })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/nesting');
    revalidatePath('/admin/visualiser');
    return ok({ nestId: data.id as string });
}

/** Nests produced from a design (for the design's "nested here" back-list). */
export async function listNestsForDesign(
    designId: string,
): Promise<Result<LinkedNest[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(NESTS)
        .select('id, name, updated_at')
        .eq('source_design_id', designId)
        .order('updated_at', { ascending: false })
        .limit(50);

    if (error) return err(error.message);
    return ok((data ?? []) as LinkedNest[]);
}
