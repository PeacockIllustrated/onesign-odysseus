// lib/production/queries.ts
import { createServerClient } from '@/lib/supabase-server';
import type {
    ProductionStage,
    ProductionJob,
    BoardColumn,
    JobWithStage,
    JobDetail,
    JobItem,
    JobStageLog,
    DepartmentInstruction,
} from './types';

// =============================================================================
// STAGES
// =============================================================================

export async function getProductionStages(): Promise<ProductionStage[]> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('production_stages')
        .select('*')
        .is('org_id', null)
        .order('sort_order', { ascending: true });

    if (error) {
        console.error('getProductionStages error:', error);
        return [];
    }
    return (data || []) as ProductionStage[];
}

// =============================================================================
// JOB BOARD
// =============================================================================

export async function getJobBoard(): Promise<BoardColumn[]> {
    const supabase = await createServerClient();

    const [stages, { data: jobs, error }] = await Promise.all([
        getProductionStages(),
        supabase
            .from('production_jobs')
            .select('*')
            .eq('status', 'active')
            .order('created_at', { ascending: true }),
    ]);

    if (error) {
        console.error('getJobBoard error:', error);
        return stages.map(stage => ({ stage, jobs: [] }));
    }

    const jobList = (jobs || []) as ProductionJob[];
    // Supabase RLS on production_jobs ensures only the requesting user's org's jobs are visible
    const stageMap = new Map(stages.map(s => [s.id, s]));

    return stages.map(stage => ({
        stage,
        jobs: jobList
            .filter(j => j.current_stage_id === stage.id)
            .map(j => ({ ...j, stage: stageMap.get(j.current_stage_id!) ?? null })),
    }));
}

// =============================================================================
// JOB DETAIL
// =============================================================================

export async function getJobDetail(jobId: string): Promise<JobDetail | null> {
    const supabase = await createServerClient();

    const { data: job, error: jobError } = await supabase
        .from('production_jobs')
        .select('*')
        .eq('id', jobId)
        .single();

    if (jobError || !job) return null;

    const [
        { data: stageData },
        { data: items },
        { data: stageLog },
        { data: instructions },
    ] = await Promise.all([
        job.current_stage_id
            ? supabase.from('production_stages').select('*').eq('id', job.current_stage_id).single()
            : Promise.resolve({ data: null }),
        supabase
            .from('job_items')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true }),
        supabase
            .from('job_stage_log')
            .select('*')
            .eq('job_id', jobId)
            .order('moved_at', { ascending: false }),
        supabase
            .from('department_instructions')
            .select('*')
            .eq('job_id', jobId)
            .order('created_at', { ascending: true }),
    ]);

    // Resolve stage references for log entries and instructions
    const allStageIds = new Set<string>();
    (stageLog || []).forEach((l: any) => {
        if (l.to_stage_id) allStageIds.add(l.to_stage_id);
        if (l.from_stage_id) allStageIds.add(l.from_stage_id);
    });
    (instructions || []).forEach((i: any) => {
        if (i.stage_id) allStageIds.add(i.stage_id);
    });

    let stagesById: Map<string, ProductionStage> = new Map();
    if (allStageIds.size > 0) {
        const { data: stagesData } = await supabase
            .from('production_stages')
            .select('*')
            .in('id', Array.from(allStageIds));
        (stagesData || []).forEach((s: any) => stagesById.set(s.id, s));
    }

    return {
        ...(job as ProductionJob),
        stage: stageData as ProductionStage | null,
        items: (items || []) as JobItem[],
        stage_log: (stageLog || []).map((l: any) => ({
            ...l as JobStageLog,
            to_stage: stagesById.get(l.to_stage_id) ?? null,
            from_stage: l.from_stage_id ? stagesById.get(l.from_stage_id) ?? null : null,
        })),
        instructions: (instructions || []).map((i: any) => ({
            ...i as DepartmentInstruction,
            stage: stagesById.get(i.stage_id) ?? null,
        })),
    };
}

// =============================================================================
// SHOP FLOOR
// =============================================================================

export async function getShopFloorQueue(stageSlug: string): Promise<ProductionJob[]> {
    const supabase = await createServerClient();

    const { data: stage } = await supabase
        .from('production_stages')
        .select('id')
        .eq('slug', stageSlug)
        .is('org_id', null)
        .single();

    if (!stage) return [];

    const { data: jobs, error } = await supabase
        .from('production_jobs')
        .select('*')
        .eq('current_stage_id', stage.id)
        .in('status', ['active', 'paused'])
        .order('due_date', { ascending: true, nullsFirst: false }); // dated jobs first, undated last

    if (error) {
        console.error('getShopFloorQueue error:', error);
        return [];
    }
    return (jobs || []) as ProductionJob[];
}

// =============================================================================
// DASHBOARD STATS
// =============================================================================

export async function getProductionStats(): Promise<{
    totalActive: number;
    overdueCount: number;
    byStage: Array<{ name: string; color: string; count: number; sortOrder: number }>;
}> {
    const supabase = await createServerClient();
    const today = new Date().toISOString().split('T')[0];

    const [{ count: total }, { count: overdue }, { data: activeJobs }] = await Promise.all([
        supabase
            .from('production_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['active', 'paused']),
        supabase
            .from('production_jobs')
            .select('*', { count: 'exact', head: true })
            .in('status', ['active', 'paused'])
            .lt('due_date', today),
        supabase
            .from('production_jobs')
            .select('current_stage_id')
            .in('status', ['active', 'paused']),
    ]);

    const stages = await getProductionStages();
    const stageMap = new Map(stages.map(s => [s.id, s]));
    const stageCounts = new Map<string, number>();
    for (const job of activeJobs || []) {
        if (job.current_stage_id) {
            stageCounts.set(job.current_stage_id, (stageCounts.get(job.current_stage_id) || 0) + 1);
        }
    }

    return {
        totalActive: total || 0,
        overdueCount: overdue || 0,
        byStage: stages.map(s => ({
            name: s.name,
            color: s.color,
            count: stageCounts.get(s.id) || 0,
            sortOrder: s.sort_order,
        })),
    };
}

// =============================================================================
// ACCEPTED QUOTES WITHOUT JOBS (for CreateJobModal)
// =============================================================================

export async function getAcceptedQuotesWithoutJobs(): Promise<
    Array<{ id: string; quote_number: string; customer_name: string | null }>
> {
    const supabase = await createServerClient();

    // Supabase RLS enforced on both tables
    // Fetch job quote_ids first (bounded by job count), then exclude from quotes query
    const { data: existingJobs } = await supabase
        .from('production_jobs')
        .select('quote_id')
        .not('quote_id', 'is', null);

    const convertedIds = (existingJobs || [])
        .map((j: any) => j.quote_id as string)
        .filter(Boolean);

    // Build query — filter out already-converted quotes at DB level
    const baseQuery = supabase
        .from('quotes')
        .select('id, quote_number, customer_name')
        .eq('status', 'accepted')
        .order('created_at', { ascending: false });

    const { data: quotes, error } = convertedIds.length > 0
        ? await baseQuery.not('id', 'in', `(${convertedIds.join(',')})`)
        : await baseQuery;

    if (error || !quotes) return [];

    return quotes as Array<{ id: string; quote_number: string; customer_name: string | null }>;
}
