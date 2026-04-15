// lib/production/types.ts

import { z } from 'zod';

// =============================================================================
// INPUT SCHEMAS (server-action validation)
// =============================================================================

export const JobPriorityEnum = z.enum(['urgent', 'high', 'normal', 'low']);

export const CreateManualJobInputSchema = z.object({
    orgId: z.string().uuid(),
    title: z.string().min(1, 'title is required').max(200),
    clientName: z.string().min(1, 'client name is required').max(200),
    description: z.string().max(4000).optional(),
    priority: JobPriorityEnum,
    dueDate: z.string().max(40).optional(),
    assignedInitials: z.string().max(6).optional(),
    contactId: z.string().uuid().optional(),
    siteId: z.string().uuid().optional(),
});

export const ItemRoutingSchema = z.object({
    quoteItemId: z.string().uuid(),
    stageIds: z.array(z.string().uuid()).max(20),
    description: z.string().max(500),
});

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
    contact_id: string | null;
    site_id: string | null;
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

export interface WorkCentre {
    id: string;
    stage_id: string;
    name: string;
    slug: string;
    is_active: boolean;
    sort_order: number;
    created_at: string;
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
    item_number: string | null;
    stage_routing: string[];
    work_centre_id: string | null;
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

// Item as it appears on the item-level board, with parent job context
export interface JobItemWithJob extends JobItem {
    stage: ProductionStage | null;
    work_centre: WorkCentre | null;
    job: Pick<ProductionJob, 'id' | 'job_number' | 'client_name' | 'title' | 'priority' | 'due_date' | 'org_id'>;
    artwork_job_id?: string | null;
}

// Item board column: a stage with its job items
export interface ItemBoardColumn {
    stage: ProductionStage;
    items: JobItemWithJob[];
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
