import { z } from 'zod';

export const VisitTypeEnum = z.enum(['survey', 'inspection', 'repair', 'cleaning', 'other']);
export type VisitType = z.infer<typeof VisitTypeEnum>;

export const VisitStatusEnum = z.enum(['scheduled', 'in_progress', 'completed', 'cancelled']);
export type VisitStatus = z.infer<typeof VisitStatusEnum>;

export interface MaintenanceVisit {
    id: string;
    org_id: string;
    site_id: string | null;
    contact_id: string | null;
    visit_type: VisitType;
    status: VisitStatus;
    scheduled_date: string;
    completed_date: string | null;
    notes: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
    org_name?: string;
    site_name?: string;
    contact_name?: string;
}

export const CreateMaintenanceVisitSchema = z.object({
    org_id: z.string().uuid(),
    site_id: z.string().uuid().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
    visit_type: VisitTypeEnum,
    scheduled_date: z.string().min(1, 'scheduled date is required'),
    notes: z.string().max(2000).optional(),
});
export type CreateMaintenanceVisitInput = z.infer<typeof CreateMaintenanceVisitSchema>;

export const UpdateMaintenanceVisitSchema = z.object({
    visit_type: VisitTypeEnum.optional(),
    status: VisitStatusEnum.optional(),
    scheduled_date: z.string().optional(),
    completed_date: z.string().nullable().optional(),
    notes: z.string().max(2000).nullable().optional(),
    site_id: z.string().uuid().nullable().optional(),
    contact_id: z.string().uuid().nullable().optional(),
});
export type UpdateMaintenanceVisitInput = z.infer<typeof UpdateMaintenanceVisitSchema>;
