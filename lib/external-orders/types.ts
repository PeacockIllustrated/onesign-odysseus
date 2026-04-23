import { z } from 'zod';

export const ExternalOrderSourceEnum = z.enum(['persimmon', 'mapleleaf', 'lynx', 'other']);
export type ExternalOrderSource = z.infer<typeof ExternalOrderSourceEnum>;

export const ExternalOrderStatusEnum = z.enum([
    'new',
    'acknowledged',
    'in_progress',
    'converted',
    'completed',
    'cancelled',
]);
export type ExternalOrderStatus = z.infer<typeof ExternalOrderStatusEnum>;

export interface ExternalOrder {
    id: string;
    source_app: ExternalOrderSource;
    external_ref: string | null;
    status: ExternalOrderStatus;

    client_name: string | null;
    client_email: string | null;
    client_phone: string | null;
    site_name: string | null;
    site_address: string | null;
    site_postcode: string | null;

    placed_at: string;
    item_count: number | null;
    item_summary: string | null;
    total_pence: number | null;
    raw_payload: unknown | null;

    linked_org_id: string | null;
    linked_quote_id: string | null;
    linked_production_job_id: string | null;

    notes: string | null;

    acknowledged_at: string | null;
    acknowledged_by: string | null;
    completed_at: string | null;
    completed_by: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;

    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export const CreateExternalOrderInputSchema = z.object({
    source_app: ExternalOrderSourceEnum,
    external_ref: z.string().max(120).optional().nullable(),
    client_name: z.string().max(200).optional().nullable(),
    client_email: z.string().email().optional().nullable().or(z.literal('').transform(() => null)),
    client_phone: z.string().max(40).optional().nullable(),
    site_name: z.string().max(200).optional().nullable(),
    site_address: z.string().max(500).optional().nullable(),
    site_postcode: z.string().max(20).optional().nullable(),
    placed_at: z.string().optional().nullable(),
    item_count: z.number().int().min(0).optional().nullable(),
    item_summary: z.string().max(1000).optional().nullable(),
    total_pence: z.number().int().min(0).optional().nullable(),
    notes: z.string().max(2000).optional().nullable(),
});
export type CreateExternalOrderInput = z.infer<typeof CreateExternalOrderInputSchema>;
