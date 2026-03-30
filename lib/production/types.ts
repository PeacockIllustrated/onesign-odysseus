// lib/production/types.ts

export type JobPriority = 'urgent' | 'high' | 'normal' | 'low';
export type JobStatus = 'active' | 'paused' | 'completed' | 'cancelled';
export type JobItemStatus = 'pending' | 'in_progress' | 'completed';

export interface ProductionStage {
    id: string;
    org_id: string | null;
    name: string;
    slug: string;
    sort_order: number;
    color: string;
    is_approval_stage: boolean;
    is_default: boolean;
    created_at: string;
}

export interface ProductionJob {
    id: string;
    org_id: string;
    quote_id: string | null;
    job_number: string;
    title: string;
    description: string | null;
    client_name: string;
    current_stage_id: string | null;
    priority: JobPriority;
    status: JobStatus;
    assigned_to: string | null;
    assigned_initials: string | null;
    due_date: string | null;
    total_items: number;
    notes: string | null;
    created_at: string;
    updated_at: string;
    completed_at: string | null;
}

export interface JobItem {
    id: string;
    job_id: string;
    quote_item_id: string | null;
    description: string;
    quantity: number;
    current_stage_id: string | null;
    status: JobItemStatus;
    notes: string | null;
    created_at: string;
}

export interface JobStageLog {
    id: string;
    job_id: string;
    job_item_id: string | null;
    from_stage_id: string | null;
    to_stage_id: string;
    moved_by: string | null;
    moved_by_name: string | null;
    notes: string | null;
    moved_at: string;
}

export interface DepartmentInstruction {
    id: string;
    job_id: string;
    stage_id: string;
    instruction: string;
    created_by: string | null;
    created_at: string;
}

// Rich view type used in Kanban — job with its resolved stage
export interface JobWithStage extends ProductionJob {
    stage: ProductionStage | null;
}

// Board column: a stage with its jobs
export interface BoardColumn {
    stage: ProductionStage;
    jobs: JobWithStage[];
}

// Full detail for the slide-out panel
export interface JobDetail extends ProductionJob {
    stage: ProductionStage | null;
    items: JobItem[];
    stage_log: Array<JobStageLog & {
        to_stage: ProductionStage | null;
        from_stage: ProductionStage | null;
    }>;
    instructions: Array<DepartmentInstruction & {
        stage: ProductionStage | null;
    }>;
}
