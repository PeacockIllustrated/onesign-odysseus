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
import { DEFAULT_NEST_CONFIG, type NestingDesignRow } from '@/lib/nesting/types';
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

const SendNestSchema = z.object({
    designId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    combinedSvg: z.string().min(1).max(10_000_000),
    /** Short material label for the nest name, e.g. "Brass faces" / "Acrylic". */
    nestLabel: z.string().trim().min(1).max(80),
    /** Origin tag, e.g. 'panel_extra_face' | 'panel_acrylic'. */
    sourceKind: z.string().trim().min(1).max(40),
    fileName: z.string().max(260).nullable().optional(),
});
export type SendDesignNestInput = z.infer<typeof SendNestSchema>;

/**
 * Push ONE material's worth of cut pieces (already a true-mm nest SVG) to the
 * acrylic nester as a new nest, linked back to the design. The generic engine
 * behind both the metal-face and the acrylic hand-offs. Returns the new nest
 * id so the caller can deep-link into `/admin/nesting?open=<id>`.
 */
export async function sendDesignNest(
    input: SendDesignNestInput,
): Promise<Result<{ nestId: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SendNestSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { designId, name, combinedSvg, nestLabel, sourceKind, fileName } =
        parsed.data;

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
    const nestName = `${name} — ${nestLabel}`;
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
            source_kind: sourceKind,
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

const SendSchema = z.object({
    designId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    combinedSvg: z.string().min(1).max(10_000_000),
    material: FaceMaterialEnum,
    fileName: z.string().max(260).nullable().optional(),
});
export type SendExtraFaceInput = z.infer<typeof SendSchema>;

/** Metal-face hand-off — thin wrapper over sendDesignNest. */
export async function sendExtraFaceToNester(
    input: SendExtraFaceInput,
): Promise<Result<{ nestId: string }>> {
    const parsed = SendSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { designId, name, combinedSvg, material, fileName } = parsed.data;
    return sendDesignNest({
        designId,
        name,
        combinedSvg,
        nestLabel: `${FACE_MATERIALS[material].label} faces`,
        sourceKind: 'panel_extra_face',
        fileName,
    });
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

/**
 * Full nest rows for a design (svg_source + config_json + source_kind) — what
 * the visualiser PDFs need to reproduce the packed sheets. Heavier than
 * listNestsForDesign; only the PDF flow uses it.
 */
export async function getNestsForDesign(
    designId: string,
): Promise<Result<NestingDesignRow[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(NESTS)
        .select(
            'id, name, created_at, updated_at, svg_source, config_json, source_kind, source_job_id, source_design_id',
        )
        .eq('source_design_id', designId)
        .order('updated_at', { ascending: false })
        .limit(50);

    if (error) return err(error.message);
    return ok((data ?? []) as NestingDesignRow[]);
}
