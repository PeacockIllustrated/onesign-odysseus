'use server';

/**
 * Saved built-up-letter return jobs (+ the "Send to nester" handoff).
 *
 * A return job is the uploaded outlined-letter SVG plus the tool's config
 * (depth, gauge, break angle, stock length, real-size calibration) — enough to
 * reopen it exactly. Stored in its own table `letter_return_jobs` (migration
 * 065). Same access model as nesting_designs / visualiser_designs: super-admin
 * manages via the service role; any authed user can read/create.
 *
 * `sendReturnsToNester` writes a `nesting_designs` row whose SVG carries both
 * the faces and the return strips, tagged with `source_job_id` so the nester
 * can link back to the job (and the job can list where it was nested).
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import { DEFAULT_NEST_CONFIG } from '@/lib/nesting/types';
import type { ReturnsConfig } from './returns';

const JOBS = 'letter_return_jobs';
const NESTS = 'nesting_designs';

export interface ReturnJobConfig {
    config: ReturnsConfig;
    /** Real-world calibration — one of these, in mm (blank = trust the SVG). */
    widthMm: number | null;
    heightMm: number | null;
    /** Original upload filename, for display + export naming. */
    fileName: string | null;
}

export interface ReturnJobSummary {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

export interface ReturnJobRow extends ReturnJobSummary {
    svg_source: string;
    config_json: ReturnJobConfig;
    created_by: string | null;
}

/** A nest produced from a return job — for the "nested here" back-list. */
export interface LinkedNest {
    id: string;
    name: string;
    updated_at: string;
}

const ReturnsConfigSchema = z.object({
    returnDepthMm: z.number().positive(),
    materialThicknessMm: z.number().min(0),
    breakAngleDeg: z.number().min(0).max(180),
    stockLengthMm: z.number().positive(),
});

const ConfigSchema = z.object({
    config: ReturnsConfigSchema,
    widthMm: z.number().positive().nullable(),
    heightMm: z.number().positive().nullable(),
    fileName: z.string().max(260).nullable(),
});

const SaveSchema = z.object({
    id: z.string().uuid().optional().nullable(),
    name: z.string().trim().min(1, 'name is required').max(120),
    svgSource: z.string().min(1, 'artwork is required').max(10_000_000),
    config: ConfigSchema,
});
export type SaveReturnJobInput = z.infer<typeof SaveSchema>;

/** List saved return jobs, most recent first (no SVG payload). */
export async function listReturnJobs(): Promise<Result<ReturnJobSummary[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(JOBS)
        .select('id, name, created_at, updated_at')
        .order('updated_at', { ascending: false })
        .limit(200);

    if (error) return err(error.message);
    return ok((data ?? []) as ReturnJobSummary[]);
}

/** Load a single return job in full (SVG + config). */
export async function getReturnJob(id: string): Promise<Result<ReturnJobRow>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(JOBS)
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) return err(error.message);
    if (!data) return err('return job not found');
    return ok(data as ReturnJobRow);
}

/** Create (no id) or update (with id) a return job. Returns its id. */
export async function saveReturnJob(
    input: SaveReturnJobInput,
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { id, name, svgSource, config } = parsed.data;

    const supabase = createAdminClient();
    const row = {
        name,
        svg_source: svgSource,
        config_json: config,
        updated_at: new Date().toISOString(),
    };

    if (id) {
        const { error } = await supabase.from(JOBS).update(row).eq('id', id);
        if (error) return err(error.message);
        revalidatePath('/admin/visualiser/returns');
        return ok({ id });
    }

    const user = await getUser();
    const { data, error } = await supabase
        .from(JOBS)
        .insert({ ...row, created_by: user?.id ?? null })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/visualiser/returns');
    return ok({ id: data.id as string });
}

/** Delete a return job. Its nests survive (source_job_id → null). */
export async function deleteReturnJob(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { error } = await supabase.from(JOBS).delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath('/admin/visualiser/returns');
    return ok(null);
}

const SendSchema = z.object({
    jobId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    combinedSvg: z.string().min(1).max(10_000_000),
    fileName: z.string().max(260).nullable().optional(),
});
export type SendReturnsInput = z.infer<typeof SendSchema>;

/**
 * Push a job's faces + returns to the acrylic nester as one new nest, linked
 * back to the job. Returns the new nest id so the caller can deep-link into
 * `/admin/nesting?open=<id>`.
 */
export async function sendReturnsToNester(
    input: SendReturnsInput,
): Promise<Result<{ nestId: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SendSchema.safeParse(input);
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'invalid input');
    }
    const { jobId, name, combinedSvg, fileName } = parsed.data;

    const supabase = createAdminClient();
    // The job must exist (and gives us the authoritative name for the nest).
    const { data: job, error: jobErr } = await supabase
        .from(JOBS)
        .select('id, name')
        .eq('id', jobId)
        .maybeSingle();
    if (jobErr) return err(jobErr.message);
    if (!job) return err('return job not found');

    const user = await getUser();
    const nestName = `${name} — faces + returns`;
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
                sourceJobName: job.name as string,
            },
            source_kind: 'letter_returns',
            source_job_id: jobId,
            created_by: user?.id ?? null,
        })
        .select('id')
        .single();

    if (error) return err(error.message);
    revalidatePath('/admin/nesting');
    revalidatePath('/admin/visualiser/returns');
    return ok({ nestId: data.id as string });
}

/** Nests produced from a return job (for the "nested here" back-list). */
export async function listNestsForReturnJob(
    jobId: string,
): Promise<Result<LinkedNest[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(NESTS)
        .select('id, name, updated_at')
        .eq('source_job_id', jobId)
        .order('updated_at', { ascending: false })
        .limit(50);

    if (error) return err(error.message);
    return ok((data ?? []) as LinkedNest[]);
}
