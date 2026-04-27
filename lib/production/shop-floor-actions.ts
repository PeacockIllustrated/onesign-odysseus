'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { type Result, ok, okVoid, err } from '@/lib/result';

// ---------------------------------------------------------------------------
// getSubItemsForItemAtStage
// ---------------------------------------------------------------------------

export interface ShopFloorSubItem {
    id: string;
    label: string;
    name: string | null;
    material: string | null;
    application_method: string | null;
    finish: string | null;
    quantity: number;
    width_mm: number | null;
    height_mm: number | null;
    returns_mm: number | null;
    measured_width_mm: number | null;
    measured_height_mm: number | null;
    dimension_flag: 'within_tolerance' | 'out_of_tolerance' | null;
    target_stage_id: string | null;
    design_signed_off_at: string | null;
    production_signed_off_at: string | null;
    thumbnail_url: string | null;
    component_id: string;
    component_name: string;
}

export interface ShopFloorCheckContext {
    item: {
        id: string;
        description: string;
        item_number: string | null;
        current_stage_id: string | null;
        stage_routing: string[] | null;
        job_id: string;
        job_number: string;
        client_name: string;
    };
    stage: { id: string; name: string; slug: string } | null;
    nextStage: { id: string; name: string; slug: string } | null;
    subItems: ShopFloorSubItem[];
    stageInstructions: string[];
}

/**
 * Load everything the shop-floor guided check needs in one round-trip:
 * the job_item, the artwork sub-items whose target_stage_id matches the
 * item's current stage, any admin instructions for that stage, and the
 * next stage in the item's routing (so "Complete & send to …" can label
 * itself correctly).
 */
export async function getSubItemsForItemAtStage(
    itemId: string
): Promise<ShopFloorCheckContext | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();

    // 1. Load the job_item + its parent production_job (for breadcrumbs).
    const { data: item, error: itemErr } = await supabase
        .from('job_items')
        .select(
            `id, description, item_number, current_stage_id, stage_routing, job_id,
             production_jobs!inner(job_number, client_name)`
        )
        .eq('id', itemId)
        .single();
    if (itemErr || !item) return { error: 'job item not found' };

    const job = (item as any).production_jobs;

    // 2. Resolve the current + next stages.
    const { data: stages } = await supabase
        .from('production_stages')
        .select('id, name, slug, sort_order')
        .is('org_id', null)
        .order('sort_order', { ascending: true });

    const stage =
        stages?.find((s: any) => s.id === item.current_stage_id) ?? null;

    const routing = (item.stage_routing as string[] | null) ?? [];
    const currentIdx = stage ? routing.indexOf(stage.id) : -1;
    const nextStageId =
        currentIdx >= 0 && currentIdx < routing.length - 1
            ? routing[currentIdx + 1]
            : null;
    const nextStage =
        (nextStageId && stages?.find((s: any) => s.id === nextStageId)) || null;

    // 3. Find the artwork_job + its components + sub-items for this item.
    const { data: artworkJob } = await supabase
        .from('artwork_jobs')
        .select('id')
        .eq('job_item_id', itemId)
        .maybeSingle();

    let subItems: ShopFloorSubItem[] = [];
    if (artworkJob && stage) {
        const { data: components } = await supabase
            .from('artwork_components')
            .select(
                `id, name,
                 sub_items:artwork_component_items(
                    id, label, sort_order, name, material, application_method,
                    finish, quantity, width_mm, height_mm, returns_mm,
                    measured_width_mm, measured_height_mm, dimension_flag,
                    target_stage_id, design_signed_off_at,
                    production_signed_off_at, thumbnail_url
                 )`
            )
            .eq('job_id', artworkJob.id);

        const all: ShopFloorSubItem[] = [];
        for (const c of components ?? []) {
            for (const si of (c as any).sub_items ?? []) {
                if (si.target_stage_id === stage.id) {
                    all.push({
                        ...si,
                        component_id: (c as any).id,
                        component_name: (c as any).name,
                    });
                }
            }
        }
        all.sort((a, b) => {
            if (a.component_name !== b.component_name) {
                return a.component_name.localeCompare(b.component_name);
            }
            return a.label.localeCompare(b.label);
        });
        subItems = all;
    }

    // 4. Admin instructions for this (job, stage).
    let stageInstructions: string[] = [];
    if (stage) {
        const { data: instrs } = await supabase
            .from('department_instructions')
            .select('instruction')
            .eq('job_id', item.job_id)
            .eq('stage_id', stage.id)
            .order('created_at', { ascending: true });
        stageInstructions = (instrs ?? []).map((i: any) => i.instruction);
    }

    return {
        item: {
            id: item.id,
            description: item.description,
            item_number: item.item_number ?? null,
            current_stage_id: item.current_stage_id ?? null,
            stage_routing: (item.stage_routing as string[] | null) ?? null,
            job_id: item.job_id,
            job_number: job.job_number,
            client_name: job.client_name,
        },
        stage: stage
            ? { id: stage.id, name: stage.name, slug: stage.slug }
            : null,
        nextStage: nextStage
            ? { id: nextStage.id, name: nextStage.name, slug: nextStage.slug }
            : null,
        subItems,
        stageInstructions,
    };
}

// ---------------------------------------------------------------------------
// reportShopFloorProblem
// ---------------------------------------------------------------------------

// Schema kept internal: Next.js's strict 'use server' only allows async
// function exports from a "use server" file, so the Zod object itself
// cannot be exported. The inferred TypeScript type is stripped at compile
// time so the type export remains safe.
const ReportProblemInputSchema = z.object({
    subItemId: z.string().uuid(),
    jobItemId: z.string().uuid(),
    stageId: z.string().uuid().nullable(),
    notes: z.string().min(1, 'notes are required').max(500),
});
export type ReportProblemInput = z.infer<typeof ReportProblemInputSchema>;

/**
 * Record a worker-reported problem against a sub-item and pause the job_item.
 * Best-effort: if the pause fails we still return success for the flag so the
 * worker's report isn't lost.
 */
export async function reportShopFloorProblem(
    input: ReportProblemInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const validation = ReportProblemInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = await createServerClient();

    const { data: flag, error: flagErr } = await supabase
        .from('shop_floor_flags')
        .insert({
            sub_item_id: parsed.subItemId,
            job_item_id: parsed.jobItemId,
            stage_id: parsed.stageId,
            reported_by: user.id,
            reported_by_name: user.email ?? null,
            notes: parsed.notes,
            status: 'open',
        })
        .select('id')
        .single();

    if (flagErr || !flag) {
        console.error('reportShopFloorProblem insert error:', flagErr);
        return { error: flagErr?.message ?? 'Failed to record flag' };
    }

    // Pause the item so staff see it's held up.
    const { error: pauseErr } = await supabase
        .from('job_items')
        .update({ status: 'pending' })
        .eq('id', parsed.jobItemId);
    if (pauseErr) {
        console.error('reportShopFloorProblem pause error:', pauseErr);
        // intentionally not returning an error — the flag itself was recorded.
    }

    revalidatePath('/shop-floor');
    revalidatePath(`/shop-floor/check/${parsed.jobItemId}`);
    revalidatePath('/admin/artwork');
    revalidatePath('/admin/jobs');
    revalidatePath('/admin/flags');
    return { id: flag.id };
}

// ---------------------------------------------------------------------------
// Admin: list + resolve shop-floor flags
// ---------------------------------------------------------------------------

export interface ShopFloorFlagRow {
    id: string;
    notes: string;
    status: 'open' | 'resolved';
    reportedAt: string;
    reportedByName: string | null;
    resolvedAt: string | null;
    subItem: {
        id: string;
        label: string;
        name: string | null;
        componentName: string | null;
    } | null;
    jobItem: {
        id: string;
        description: string;
        itemNumber: string | null;
        jobId: string;
        jobNumber: string | null;
        clientName: string | null;
    } | null;
    stage: {
        id: string;
        name: string;
        slug: string;
    } | null;
}

/**
 * List shop-floor flags for the admin review surface. Open flags first
 * (oldest at the top so the longest-stuck issue is the most visible),
 * then a tail of recently-resolved ones for context.
 */
export async function listShopFloorFlags(opts?: {
    includeResolved?: boolean;
    resolvedLimit?: number;
}): Promise<Result<ShopFloorFlagRow[]>> {
    const includeResolved = opts?.includeResolved ?? true;
    const resolvedLimit = opts?.resolvedLimit ?? 25;

    const supabase = await createServerClient();

    // RLS lets any authed user read flags (migration 042). No extra gate.
    const select = `
        id, notes, status, created_at, reported_by_name, resolved_at,
        sub_item:artwork_component_items!shop_floor_flags_sub_item_id_fkey(
            id, label, name,
            component:artwork_components(name)
        ),
        job_item:job_items!shop_floor_flags_job_item_id_fkey(
            id, description, item_number,
            job:production_jobs(id, job_number, client_name)
        ),
        stage:production_stages(id, name, slug)
    `;

    const open = await supabase
        .from('shop_floor_flags')
        .select(select)
        .eq('status', 'open')
        .order('created_at', { ascending: true });
    if (open.error) return err(open.error.message);

    let rows = open.data ?? [];
    if (includeResolved) {
        const resolved = await supabase
            .from('shop_floor_flags')
            .select(select)
            .eq('status', 'resolved')
            .order('resolved_at', { ascending: false })
            .limit(resolvedLimit);
        if (resolved.error) return err(resolved.error.message);
        rows = [...rows, ...(resolved.data ?? [])];
    }

    // Supabase's typed select returns relationships as arrays even for
    // single FKs depending on the codegen path; normalise here so the UI
    // can rely on a flat shape.
    const mapped: ShopFloorFlagRow[] = rows.map((r: any) => {
        const sub = Array.isArray(r.sub_item) ? r.sub_item[0] : r.sub_item;
        const ji = Array.isArray(r.job_item) ? r.job_item[0] : r.job_item;
        const job = ji ? (Array.isArray(ji.job) ? ji.job[0] : ji.job) : null;
        const comp = sub ? (Array.isArray(sub.component) ? sub.component[0] : sub.component) : null;
        const st = Array.isArray(r.stage) ? r.stage[0] : r.stage;
        return {
            id: r.id,
            notes: r.notes,
            status: r.status,
            reportedAt: r.created_at,
            reportedByName: r.reported_by_name,
            resolvedAt: r.resolved_at,
            subItem: sub
                ? {
                      id: sub.id,
                      label: sub.label,
                      name: sub.name,
                      componentName: comp?.name ?? null,
                  }
                : null,
            jobItem: ji
                ? {
                      id: ji.id,
                      description: ji.description,
                      itemNumber: ji.item_number,
                      jobId: job?.id ?? '',
                      jobNumber: job?.job_number ?? null,
                      clientName: job?.client_name ?? null,
                  }
                : null,
            stage: st ? { id: st.id, name: st.name, slug: st.slug } : null,
        };
    });
    return ok(mapped);
}

const ResolveFlagInputSchema = z.object({
    flagId: z.string().uuid(),
});

/**
 * Mark a flag resolved. Super-admin only (RLS enforces this too).
 * Does NOT change the underlying job_item status — admins are expected
 * to either resume the item via the Kanban or move it back a stage by
 * hand. Resolving a flag is purely an inbox-clearing action.
 */
export async function resolveShopFloorFlag(
    input: { flagId: string }
): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = ResolveFlagInputSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const user = await getUser();
    const supabase = await createServerClient();

    const { error: updErr } = await supabase
        .from('shop_floor_flags')
        .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            resolved_by: user?.id ?? null,
        })
        .eq('id', parsed.data.flagId)
        .eq('status', 'open');

    if (updErr) return err(updErr.message);

    revalidatePath('/admin/flags');
    revalidatePath('/shop-floor');
    return okVoid();
}

/** Lightweight counter for sidebar badge / dashboard tile. */
export async function countOpenShopFloorFlags(): Promise<Result<number>> {
    const supabase = await createServerClient();
    const { count, error } = await supabase
        .from('shop_floor_flags')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open');
    if (error) return err(error.message);
    return ok(count ?? 0);
}
