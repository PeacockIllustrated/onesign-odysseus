import { z } from 'zod';

export type DeliveryStatus = 'scheduled' | 'in_transit' | 'delivered' | 'failed';
export type PodStatus = 'pending' | 'signed' | 'refused';

export interface Delivery {
    id: string;
    delivery_number: string;
    org_id: string;
    production_job_id: string;
    site_id: string | null;
    contact_id: string | null;
    status: DeliveryStatus;
    driver_name: string | null;
    driver_phone: string | null;
    driver_id: string | null;
    scheduled_date: string;
    delivered_at: string | null;
    notes_internal: string | null;
    notes_driver: string | null;
    pod_token: string | null;
    pod_status: PodStatus;
    pod_signed_by: string | null;
    pod_signature_data: string | null;
    pod_notes: string | null;
    pod_signed_at: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface DeliveryItem {
    id: string;
    delivery_id: string;
    job_item_id: string | null;
    description: string;
    quantity: number;
    sort_order: number;
    created_at: string;
}

export interface DeliveryWithItems extends Delivery {
    items: DeliveryItem[];
    linked_job: { id: string; job_number: string; title: string; client_name: string; status: string } | null;
    delivery_site: {
        id: string; name: string;
        address_line_1: string | null; address_line_2: string | null;
        city: string | null; county: string | null; postcode: string | null; country: string;
        phone: string | null; latitude: number | null; longitude: number | null;
    } | null;
    delivery_contact: { id: string; first_name: string; last_name: string; email: string | null; phone: string | null } | null;
}

export interface CreateDeliveryInput {
    production_job_id: string;
    site_id?: string;
    contact_id?: string;
    driver_name?: string;
    driver_phone?: string;
    scheduled_date: string;
    notes_internal?: string;
    notes_driver?: string;
}

export interface UpdateDeliveryInput {
    id: string;
    site_id?: string;
    contact_id?: string;
    driver_name?: string;
    driver_phone?: string;
    scheduled_date?: string;
    notes_internal?: string;
    notes_driver?: string;
}

// =============================================================================
// INPUT SCHEMAS (server-action validation)
// =============================================================================

export const CreateDeliveryInputSchema = z.object({
    production_job_id: z.string().uuid(),
    site_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    driver_name: z.string().max(120).optional(),
    driver_phone: z.string().max(40).optional(),
    scheduled_date: z.string().min(1, 'scheduled date is required').max(40),
    notes_internal: z.string().max(4000).optional(),
    notes_driver: z.string().max(4000).optional(),
});

export const UpdateDeliveryInputSchema = z.object({
    id: z.string().uuid(),
    site_id: z.string().uuid().optional(),
    contact_id: z.string().uuid().optional(),
    driver_name: z.string().max(120).optional(),
    driver_phone: z.string().max(40).optional(),
    scheduled_date: z.string().max(40).optional(),
    notes_internal: z.string().max(4000).optional(),
    notes_driver: z.string().max(4000).optional(),
});

// Public POD submission
export const SubmitPodInputSchema = z.object({
    signed_by: z.string().min(1, 'Name is required').max(200),
    signature_data: z.string().min(1, 'Signature is required').max(1_000_000),
    notes: z.string().max(4000).optional(),
});
export type SubmitPodInput = z.infer<typeof SubmitPodInputSchema>;

// Data returned to the public POD page
export interface PodPageData {
    delivery_number: string;
    scheduled_date: string;
    client_name: string;
    job_number: string;
    driver_name: string | null;
    notes_driver: string | null;
    pod_status: PodStatus;
    pod_signed_by: string | null;
    pod_signed_at: string | null;
    items: Array<{ description: string; quantity: number }>;
    site: {
        name: string;
        address_line_1: string | null; address_line_2: string | null;
        city: string | null; county: string | null; postcode: string | null;
    } | null;
}
