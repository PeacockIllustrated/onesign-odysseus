import { z } from 'zod';

// Project types matching the dropdown options
export const PROJECT_TYPES = [
    { value: 'public_realm', label: 'Public Realm' },
    { value: 'heritage', label: 'Heritage' },
    { value: 'education', label: 'Education' },
    { value: 'mixed_use', label: 'Mixed-Use' },
    { value: 'other', label: 'Other' },
] as const;

// RIBA stages
export const RIBA_STAGES = [
    { value: '1', label: 'Stage 1 – Preparation & Briefing' },
    { value: '2', label: 'Stage 2 – Concept Design' },
    { value: '3', label: 'Stage 3 – Spatial Coordination' },
    { value: '4', label: 'Stage 4 – Technical Design' },
    { value: '5', label: 'Stage 5 – Manufacturing & Construction' },
    { value: '6', label: 'Stage 6 – Handover' },
    { value: '7', label: 'Stage 7 – Use' },
    { value: 'not_sure', label: 'Not sure' },
] as const;

// Support options (mapped to "How we engage" bullets)
export const SUPPORT_OPTIONS = [
    { value: 'concept_review', label: 'Early concept sanity-checks' },
    { value: 'design_development', label: 'Design development and detailing' },
    { value: 'planning_heritage', label: 'Planning and heritage support' },
    { value: 'technical_packages', label: 'Technical packages for tender and construction' },
    { value: 'delivery_support', label: 'Delivery support through to installation' },
] as const;

// Schema for form validation
export const architectEnquirySchema = z.object({
    // Practice Information
    practice_name: z.string().min(2, 'Practice name is required'),
    contact_name: z.string().min(2, 'Contact name is required'),
    contact_role: z.string().optional(),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().optional(),

    // Project Information
    project_name: z.string().optional(),
    project_type: z.string().optional(),
    riba_stage: z.string().optional(),
    location: z.string().optional(),
    planning_sensitive: z.boolean().optional(),

    // Support Requirements
    support_needed: z.array(z.string()).optional(),
    notes: z.string().optional(),
});

export type ArchitectEnquiryFormData = z.infer<typeof architectEnquirySchema>;

// Step schemas for progressive validation
export const practiceSchema = z.object({
    practice_name: z.string().min(2, 'Practice name is required'),
    contact_name: z.string().min(2, 'Contact name is required'),
    contact_role: z.string().optional(),
    email: z.string().email('Please enter a valid email address'),
    phone: z.string().optional(),
});

export const projectSchema = z.object({
    project_name: z.string().optional(),
    project_type: z.string().optional(),
    riba_stage: z.string().optional(),
    location: z.string().optional(),
    planning_sensitive: z.boolean().optional(),
});

export const supportSchema = z.object({
    support_needed: z.array(z.string()).optional(),
    notes: z.string().optional(),
});

// Default values
export const defaultArchitectEnquiryValues: ArchitectEnquiryFormData = {
    practice_name: '',
    contact_name: '',
    contact_role: '',
    email: '',
    phone: '',
    project_name: '',
    project_type: '',
    riba_stage: '',
    location: '',
    planning_sensitive: false,
    support_needed: [],
    notes: '',
};
