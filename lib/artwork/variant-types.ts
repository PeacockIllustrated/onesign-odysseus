/**
 * Zod schemas + inferred TypeScript types for artwork variants and the
 * visual-approval job shape. Kept in a separate file from
 * visual-approval-actions.ts because that file uses 'use server' and
 * Next.js forbids exporting Zod objects from such files.
 */

import { z } from 'zod';

export const ArtworkVariantSchema = z.object({
    id: z.string().uuid(),
    component_id: z.string().uuid(),
    label: z.string(),
    sort_order: z.number().int(),
    name: z.string().nullable(),
    description: z.string().nullable(),
    thumbnail_url: z.string().nullable(),
    material: z.string().nullable(),
    application_method: z.string().nullable(),
    finish: z.string().nullable(),
    width_mm: z.number().nullable(),
    height_mm: z.number().nullable(),
    returns_mm: z.number().nullable(),
    is_chosen: z.boolean(),
    chosen_at: z.string().nullable(),
    notes: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type ArtworkVariant = z.infer<typeof ArtworkVariantSchema>;

export const CreateVisualJobInputSchema = z.object({
    jobName: z.string().min(1).max(200),
    description: z.string().max(2000).optional(),
    orgId: z.string().uuid().nullable().optional(),
    contactId: z.string().uuid().nullable().optional(),
    siteId: z.string().uuid().nullable().optional(),
    quoteId: z.string().uuid().nullable().optional(),
});
export type CreateVisualJobInput = z.infer<typeof CreateVisualJobInputSchema>;

export const CreateVariantInputSchema = z.object({
    componentId: z.string().uuid(),
    name: z.string().max(120).optional(),
    description: z.string().max(2000).optional(),
    material: z.string().max(200).optional(),
    applicationMethod: z.string().max(200).optional(),
    finish: z.string().max(120).optional(),
    widthMm: z.number().positive().nullable().optional(),
    heightMm: z.number().positive().nullable().optional(),
    returnsMm: z.number().nullable().optional(),
    notes: z.string().max(500).optional(),
});
export type CreateVariantInput = z.infer<typeof CreateVariantInputSchema>;

export const UpdateVariantInputSchema = z.object({
    name: z.string().max(120).nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    material: z.string().max(200).nullable().optional(),
    applicationMethod: z.string().max(200).nullable().optional(),
    finish: z.string().max(120).nullable().optional(),
    widthMm: z.number().positive().nullable().optional(),
    heightMm: z.number().positive().nullable().optional(),
    returnsMm: z.number().nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
});
export type UpdateVariantInput = z.infer<typeof UpdateVariantInputSchema>;

export const VariantSelectionSchema = z.object({
    componentId: z.string().uuid(),
    variantId: z.string().uuid(),
});
export type VariantSelection = z.infer<typeof VariantSelectionSchema>;
