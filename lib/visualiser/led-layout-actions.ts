'use server';

/**
 * Saved LED layout & wiring designs (migration 067) + the driver ladder the
 * sizing engine packs onto.
 *
 * A layout is the uploaded SVG plus the tool's config (voltage, module pitch,
 * run caps, driver headroom, real-size calibration) — enough to reopen it
 * exactly. Same access model as nesting_designs / letter_return_jobs:
 * super-admin manages via the service role; any authed user reads/creates.
 *
 * `getDriverSpecs` reads the existing `transformers` rate-card so driver sizing
 * uses the power supplies Onesign actually stocks (capacity parsed from the
 * type name, e.g. '60W', falling back to `led_capacity`); the client passes the
 * result into the pure engine, which falls back to a default ladder if empty.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import type { LedLayoutConfig, LedDriverSpec } from './led-layout';

const TABLE = 'led_layout_designs';

export interface LedLayoutJobConfig {
    config: LedLayoutConfig;
    widthMm: number | null;
    heightMm: number | null;
    fileName: string | null;
}

export interface LedLayoutSummary {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface LedLayoutRow extends LedLayoutSummary {
    svg_source: string;
    config_json: LedLayoutJobConfig;
    source_design_id: string | null;
    created_by: string | null;
}

const ConfigSchema = z.object({
    config: z.object({
        voltageV: z.union([z.literal(12), z.literal(24)]),
        strategy: z.enum(['auto', 'stroke', 'area']),
        modulePitchMm: z.number().positive(),
        rowPitchMm: z.number().positive(),
        wattsPerModule: z.number().positive(),
        maxModulesPerRun: z.number().int().positive(),
        maxRunLengthMm: z.number().positive(),
        driverHeadroom: z.number().min(0.1).max(1),
        cableSide: z.enum(['left', 'right', 'top', 'bottom']),
    }),
    widthMm: z.number().positive().nullable(),
    heightMm: z.number().positive().nullable(),
    fileName: z.string().max(260).nullable(),
});

const SaveSchema = z.object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1, 'name is required').max(120),
    svgSource: z.string().min(1, 'artwork is required').max(10_000_000),
    config: ConfigSchema,
    sourceDesignId: z.string().uuid().nullable().optional(),
});
export type SaveLedLayoutInput = z.infer<typeof SaveSchema>;

/** List saved LED layouts, most recent first (no SVG payload). */
export async function listLedLayouts(): Promise<Result<LedLayoutSummary[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('id, name, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);

    if (error) return err(error.message);
    return ok((data ?? []) as LedLayoutSummary[]);
}

/** Load a single LED layout in full (SVG + config). */
export async function getLedLayout(id: string): Promise<Result<LedLayoutRow>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) return err(error.message);
    if (!data) return err('LED layout not found');
    return ok(data as LedLayoutRow);
}

/** Create (no id) or update (with id) an LED layout. Returns its id. */
export async function saveLedLayout(
    input: SaveLedLayoutInput,
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { id, name, svgSource, config, sourceDesignId } = parsed.data;

    const supabase = createAdminClient();
    const row = {
        name,
        svg_source: svgSource,
        config_json: config,
        source_design_id: sourceDesignId ?? null,
        updated_at: new Date().toISOString(),
    };

    if (id) {
        const { error } = await supabase.from(TABLE).update(row).eq('id', id);
        if (error) return err(error.message);
        revalidatePath('/admin/visualiser/led-layout');
        return ok({ id });
    }

    const user = await getUser();
    const { data, error } = await supabase
        .from(TABLE)
        .insert({ ...row, created_by: user?.id ?? null })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/visualiser/led-layout');
    return ok({ id: data.id as string });
}

/** Delete an LED layout. */
export async function deleteLedLayout(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { error } = await supabase.from(TABLE).delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/visualiser/led-layout');
    return ok(null);
}

/** Driver ladder from the `transformers` rate card (empty → engine default). */
export async function getDriverSpecs(): Promise<Result<LedDriverSpec[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from('transformers')
        .select('type, led_capacity, unit_cost_pence');
    if (error) return err(error.message);

    const byType = new Map<string, LedDriverSpec>();
    for (const r of (data ?? []) as Array<{
        type: string;
        led_capacity: number | null;
        unit_cost_pence: number | null;
    }>) {
        const type = String(r.type ?? '').trim();
        if (!type) continue;
        const wattsFromName = /(\d+)\s*w/i.exec(type);
        const capacityW = wattsFromName
            ? parseInt(wattsFromName[1], 10)
            : Number(r.led_capacity) || 0;
        if (capacityW <= 0) continue;
        const spec: LedDriverSpec = {
            type,
            capacityW,
            unitCostPence: Number(r.unit_cost_pence) || 0,
        };
        const existing = byType.get(type);
        // Cheapest entry wins when a type appears in multiple pricing sets.
        if (!existing || spec.unitCostPence < existing.unitCostPence) {
            byType.set(type, spec);
        }
    }
    return ok([...byType.values()].sort((a, b) => a.capacityW - b.capacityW));
}
