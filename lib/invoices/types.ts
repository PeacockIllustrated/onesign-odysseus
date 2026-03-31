export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Invoice {
    id: string;
    invoice_number: string;
    org_id: string;
    quote_id: string;
    production_job_id: string | null;
    customer_name: string;
    customer_email: string | null;
    customer_phone: string | null;
    customer_reference: string | null;
    project_name: string | null;
    status: InvoiceStatus;
    invoice_date: string;
    due_date: string | null;
    payment_terms_days: number;
    notes_internal: string | null;
    notes_customer: string | null;
    subtotal_pence: number;
    vat_rate: number;
    vat_pence: number;
    total_pence: number;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

export interface InvoiceItem {
    id: string;
    invoice_id: string;
    quote_item_id: string | null;
    description: string;
    quantity: number;
    unit_price_pence: number;
    line_total_pence: number;
    sort_order: number;
    created_at: string;
}

export interface InvoiceWithItems extends Invoice {
    items: InvoiceItem[];
    linked_quote: { id: string; quote_number: string; customer_name: string | null } | null;
    linked_job: { id: string; job_number: string; status: string } | null;
}

export interface CreateInvoiceInput {
    quote_id: string;
    org_id: string;
}

export interface UpdateInvoiceInput {
    id: string;
    customer_name?: string;
    customer_email?: string;
    customer_phone?: string;
    customer_reference?: string;
    project_name?: string;
    payment_terms_days?: number;
    due_date?: string;
    notes_internal?: string;
    notes_customer?: string;
}

export interface CreateInvoiceItemInput {
    invoice_id: string;
    description: string;
    quantity: number;
    unit_price_pence: number;
}

export interface UpdateInvoiceItemInput {
    id: string;
    invoice_id: string;
    description?: string;
    quantity?: number;
    unit_price_pence?: number;
}
