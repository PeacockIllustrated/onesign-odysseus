import { z } from 'zod';

// =============================================================================
// INPUT SCHEMAS (server-action validation)
// =============================================================================

export const ContactTypeEnum = z.enum(['primary', 'billing', 'site', 'general']);

export const CreateContactInputSchema = z.object({
    org_id: z.string().uuid(),
    first_name: z.string().min(1, 'first name is required').max(80),
    last_name: z.string().min(1, 'last name is required').max(80),
    email: z.string().email().max(200).optional().or(z.literal('')),
    phone: z.string().max(40).optional(),
    mobile: z.string().max(40).optional(),
    job_title: z.string().max(120).optional(),
    contact_type: ContactTypeEnum.optional(),
    is_primary: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
});

export const UpdateContactInputSchema = z.object({
    id: z.string().uuid(),
    first_name: z.string().min(1).max(80).optional(),
    last_name: z.string().min(1).max(80).optional(),
    email: z.string().email().max(200).optional().or(z.literal('')),
    phone: z.string().max(40).optional(),
    mobile: z.string().max(40).optional(),
    job_title: z.string().max(120).optional(),
    contact_type: ContactTypeEnum.optional(),
    is_primary: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
});

export const CreateSiteInputSchema = z.object({
    org_id: z.string().uuid(),
    name: z.string().min(1, 'site name is required').max(120),
    address_line_1: z.string().max(200).optional(),
    address_line_2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    county: z.string().max(100).optional(),
    postcode: z.string().max(20).optional(),
    country: z.string().max(60).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().max(200).optional().or(z.literal('')),
    site_contact_id: z.string().uuid().optional(),
    is_primary: z.boolean().optional(),
    is_billing_address: z.boolean().optional(),
    is_delivery_address: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
});

export const UpdateSiteInputSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(120).optional(),
    address_line_1: z.string().max(200).optional(),
    address_line_2: z.string().max(200).optional(),
    city: z.string().max(100).optional(),
    county: z.string().max(100).optional(),
    postcode: z.string().max(20).optional(),
    country: z.string().max(60).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().max(200).optional().or(z.literal('')),
    site_contact_id: z.string().uuid().nullable().optional(),
    is_primary: z.boolean().optional(),
    is_billing_address: z.boolean().optional(),
    is_delivery_address: z.boolean().optional(),
    notes: z.string().max(2000).optional(),
});

export const UpdateOrgDetailsInputSchema = z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(200).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().email().max(200).optional().or(z.literal('')),
    website: z.string().max(300).optional(),
    business_type: z.string().max(60).optional(),
    account_number: z.string().max(60).optional(),
    company_reg_number: z.string().max(60).optional(),
    vat_number: z.string().max(60).optional(),
    tax_code: z.string().max(20).optional(),
    currency: z.string().max(10).optional(),
    payment_terms_days: z.number().int().min(0).max(365).optional(),
    sales_discount_percent: z.number().min(0).max(100).optional(),
    notes: z.string().max(2000).optional(),
    tags: z.array(z.string().max(40)).max(30).optional(),
});

export const CreateClientActionInputSchema = z.object({
    name: z.string().min(1, 'client name is required').max(200),
    primaryContact: z
        .object({
            first_name: z.string().min(1).max(80),
            last_name: z.string().min(1).max(80),
            email: z.string().email().max(200).optional().or(z.literal('')),
            phone: z.string().max(40).optional(),
            job_title: z.string().max(120).optional(),
        })
        .optional(),
});

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
