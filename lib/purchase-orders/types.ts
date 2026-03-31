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
