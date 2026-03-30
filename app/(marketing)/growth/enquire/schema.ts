import { z } from 'zod';

// Schema for each step validation
export const contactSchema = z.object({
    contact_name: z.string().min(2, 'Name is required'),
    contact_role: z.string().optional(),
    contact_email: z.string().email('Please enter a valid email'),
    contact_phone: z.string().optional(),
});

export const businessSchema = z.object({
    company_name: z.string().min(1, 'Company name is required'),
    company_website: z.string().url().optional().or(z.literal('')),
    industry_type: z.string().optional(),
    service_areas: z.array(z.string()).optional(),
});

export const commercialSchema = z.object({
    avg_job_value: z.string().optional(),
    capacity_per_week: z.string().optional(),
    coverage_radius: z.string().optional(),
    ideal_customer: z.string().optional(),
});

export const currentSchema = z.object({
    current_lead_sources: z.array(z.string()).optional(),
    has_existing_ads: z.boolean().optional(),
    has_existing_landing_page: z.boolean().optional(),
});

export const intentSchema = z.object({
    desired_start_date: z.string().optional(),
    package_key: z.string().optional(),
    accelerator_keys: z.array(z.string()).optional(),
    notes: z.string().optional(),
});

// Full form schema combining all steps
export const enquiryFormSchema = contactSchema
    .merge(businessSchema)
    .merge(commercialSchema)
    .merge(currentSchema)
    .merge(intentSchema);

export type EnquiryFormData = z.infer<typeof enquiryFormSchema>;

// Step schemas for progressive validation
export const stepSchemas = [
    contactSchema,
    businessSchema,
    commercialSchema,
    currentSchema,
    intentSchema,
];

// Default values
export const defaultEnquiryValues: EnquiryFormData = {
    contact_name: '',
    contact_role: '',
    contact_email: '',
    contact_phone: '',
    company_name: '',
    company_website: '',
    industry_type: '',
    service_areas: [],
    avg_job_value: '',
    capacity_per_week: '',
    coverage_radius: '',
    ideal_customer: '',
    current_lead_sources: [],
    has_existing_ads: undefined,
    has_existing_landing_page: undefined,
    desired_start_date: '',
    package_key: '',
    accelerator_keys: [],
    notes: '',
};
