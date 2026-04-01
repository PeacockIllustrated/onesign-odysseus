export type ContactType = 'primary' | 'billing' | 'site' | 'general';

export interface Contact {
    id: string;
    org_id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    job_title: string | null;
    contact_type: ContactType;
    is_primary: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrgSite {
    id: string;
    org_id: string;
    name: string;
    address_line_1: string | null;
    address_line_2: string | null;
    city: string | null;
    county: string | null;
    postcode: string | null;
    country: string;
    phone: string | null;
    email: string | null;
    site_contact_id: string | null;
    is_primary: boolean;
    is_billing_address: boolean;
    is_delivery_address: boolean;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface OrgExtended {
    id: string;
    name: string;
    slug: string;
    logo_url: string | null;
    phone: string | null;
    email: string | null;
    website: string | null;
    business_type: string | null;
    account_number: string | null;
    company_reg_number: string | null;
    vat_number: string | null;
    tax_code: string;
    currency: string;
    payment_terms_days: number;
    sales_discount_percent: number;
    notes: string | null;
    tags: string[];
    created_at: string;
    updated_at: string | null;
}

export interface ClientWithDetails extends OrgExtended {
    contacts: Contact[];
    sites: OrgSite[];
}

export interface ClientSummary extends OrgExtended {
    contact_count: number;
    site_count: number;
    primary_contact_name: string | null;
}

// Input types
export interface CreateContactInput {
    org_id: string;
    first_name: string;
    last_name: string;
    email?: string;
    phone?: string;
    mobile?: string;
    job_title?: string;
    contact_type?: ContactType;
    is_primary?: boolean;
    notes?: string;
}

export interface UpdateContactInput {
    id: string;
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    job_title?: string;
    contact_type?: ContactType;
    is_primary?: boolean;
    notes?: string;
}

export interface CreateSiteInput {
    org_id: string;
    name: string;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    county?: string;
    postcode?: string;
    country?: string;
    phone?: string;
    email?: string;
    site_contact_id?: string;
    is_primary?: boolean;
    is_billing_address?: boolean;
    is_delivery_address?: boolean;
    notes?: string;
}

export interface UpdateSiteInput {
    id: string;
    name?: string;
    address_line_1?: string;
    address_line_2?: string;
    city?: string;
    county?: string;
    postcode?: string;
    country?: string;
    phone?: string;
    email?: string;
    site_contact_id?: string;
    is_primary?: boolean;
    is_billing_address?: boolean;
    is_delivery_address?: boolean;
    notes?: string;
}

export interface UpdateOrgDetailsInput {
    id: string;
    name?: string;
    phone?: string;
    email?: string;
    website?: string;
    business_type?: string;
    account_number?: string;
    company_reg_number?: string;
    vat_number?: string;
    tax_code?: string;
    currency?: string;
    payment_terms_days?: number;
    sales_discount_percent?: number;
    notes?: string;
    tags?: string[];
}
