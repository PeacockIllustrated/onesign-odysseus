import { z } from 'zod';

// =============================================================================
// INPUT SCHEMAS (server-action validation)
// =============================================================================

export const CreatePoInputSchema = z.object({
    org_id: z.string().uuid(),
    supplier_name: z.string().min(1, 'supplier name is required').max(200),
    supplier_email: z.string().email().max(200).optional().or(z.literal('')),
    description: z.string().min(1, 'description is required').max(2000),
    required_by_date: z.string().max(40).optional(),
    quote_id: z.string().uuid().optional(),
    production_job_id: z.string().uuid().optional(),
});

export const UpdatePoInputSchema = z.object({
    id: z.string().uuid(),
    supplier_name: z.string().min(1).max(200).optional(),
    supplier_email: z.string().email().max(200).optional().or(z.literal('')),
    supplier_reference: z.string().max(120).optional(),
    description: z.string().min(1).max(2000).optional(),
    required_by_date: z.string().max(40).optional(),
    notes_internal: z.string().max(4000).optional(),
    notes_supplier: z.string().max(4000).optional(),
});

export const CreatePoItemInputSchema = z.object({
    po_id: z.string().uuid(),
    description: z.string().min(1, 'description is required').max(1000),
    quantity: z.number().positive('quantity must be positive'),
    unit_cost_pence: z.number().int().min(0, 'unit cost must be >= 0'),
});

export const UpdatePoItemInputSchema = z.object({
    id: z.string().uuid(),
    po_id: z.string().uuid(),
    description: z.string().min(1).max(1000).optional(),
    quantity: z.number().positive().optional(),
    unit_cost_pence: z.number().int().min(0).optional(),
});

export type PoStatus = 'draft' | 'sent' | 'acknowledged' | 'completed' | 'cancelled';

export interface PurchaseOrder {
    id: string;
    po_number: string;
    org_id: string;
    quote_id: string | null;
    production_job_id: string | null;
    supplier_name: string;
    supplier_email: string | null;
    supplier_reference: string | null;
    description: string;
    status: PoStatus;
    issue_date: string;
    required_by_date: string | null;
    notes_internal: string | null;
    notes_supplier: string | null;
    total_pence: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface PoItem {
    id: string;
    po_id: string;
    description: string;
    quantity: number;
    unit_cost_pence: number;
    line_total_pence: number;
    created_at: string;
}

export interface PoWithItems extends PurchaseOrder {
    items: PoItem[];
    linked_job: { id: string; job_number: string; title: string } | null;
    linked_quote: { id: string; quote_number: string; customer_name: string | null } | null;
}

export interface CreatePoInput {
    org_id: string;
    supplier_name: string;
    supplier_email?: string;
    description: string;
    required_by_date?: string;
    quote_id?: string;
    production_job_id?: string;
}

export interface UpdatePoInput {
    id: string;
    supplier_name?: string;
    supplier_email?: string;
    supplier_reference?: string;
    description?: string;
    required_by_date?: string;
    notes_internal?: string;
    notes_supplier?: string;
}

export interface CreatePoItemInput {
    po_id: string;
    description: string;
    quantity: number;
    unit_cost_pence: number;
}

export interface UpdatePoItemInput {
    id: string;
    po_id: string;
    description?: string;
    quantity?: number;
    unit_cost_pence?: number;
}
