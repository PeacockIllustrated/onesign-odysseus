/**
 * TypeScript types and Zod schemas for Artwork Compliance System
 * Matches database schema from migrations 015 + 016
 */

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const ArtworkJobStatusEnum = z.enum([
    'draft',
    'in_progress',
    'design_complete',
    'in_production',
    'completed',
]);
export type ArtworkJobStatus = z.infer<typeof ArtworkJobStatusEnum>;

export const ComponentTypeEnum = z.enum([
    'panel',
    'vinyl',
    'acrylic',
    'push_through',
    'dibond',
    'aperture_cut',
    'foamex',
    'other',
]);
export type ComponentType = z.infer<typeof ComponentTypeEnum>;

export const LightingTypeEnum = z.enum([
    'backlit',
    'halo',
    'edge_lit',
]);
export type LightingType = z.infer<typeof LightingTypeEnum>;

export const ComponentStatusEnum = z.enum([
    'pending_design',
    'design_submitted',
    'design_signed_off',
    'in_production',
    'production_complete',
    'flagged',
]);
export type ComponentStatus = z.infer<typeof ComponentStatusEnum>;

export const CheckTypeEnum = z.enum([
    'dimension_measurement',
    'material_confirmation',
    'rip_scaling_check',
    'quality_checkpoint',
    'final_signoff',
]);
export type CheckType = z.infer<typeof CheckTypeEnum>;

export const DimensionFlagEnum = z.enum([
    'within_tolerance',
    'out_of_tolerance',
]);
export type DimensionFlag = z.infer<typeof DimensionFlagEnum>;

// =============================================================================
// DATABASE ROW TYPES
// =============================================================================

export const ArtworkJobSchema = z.object({
    id: z.string().uuid(),
    job_name: z.string(),
    job_reference: z.string(),
    client_name: z.string().nullable(),
    description: z.string().nullable(),
    cover_image_path: z.string().nullable(),
    panel_size: z.string().nullable(),
    paint_colour: z.string().nullable(),
    status: ArtworkJobStatusEnum,
    created_at: z.string(),
    updated_at: z.string(),
    created_by: z.string().uuid().nullable(),
});
export type ArtworkJob = z.infer<typeof ArtworkJobSchema>;

export const ArtworkComponentSchema = z.object({
    id: z.string().uuid(),
    job_id: z.string().uuid(),
    name: z.string(),
    component_type: ComponentTypeEnum,
    sort_order: z.number().int(),
    status: ComponentStatusEnum,

    // Design fields
    width_mm: z.number().nullable(),
    height_mm: z.number().nullable(),
    returns_mm: z.number().nullable(),
    material: z.string().nullable(),
    lighting: z.string().nullable(),
    scale_confirmed: z.boolean(),
    bleed_included: z.boolean(),
    file_path: z.string().nullable(),
    artwork_thumbnail_url: z.string().nullable(),
    notes: z.string().nullable(),

    // Design sign-off
    designed_by: z.string().uuid().nullable(),
    design_signed_off_at: z.string().nullable(),
    design_signed_off_by: z.string().uuid().nullable(),

    // Production fields
    measured_width_mm: z.number().nullable(),
    measured_height_mm: z.number().nullable(),
    material_confirmed: z.boolean(),
    rip_no_scaling_confirmed: z.boolean(),
    production_notes: z.string().nullable(),

    // Dimension flags
    dimension_flag: z.string().nullable(),
    width_deviation_mm: z.number().nullable(),
    height_deviation_mm: z.number().nullable(),

    // Production sign-off
    production_checked_by: z.string().uuid().nullable(),
    production_signed_off_at: z.string().nullable(),
    production_signed_off_by: z.string().uuid().nullable(),

    created_at: z.string(),
    updated_at: z.string(),
});
export type ArtworkComponent = z.infer<typeof ArtworkComponentSchema>;

export const ComponentVersionSchema = z.object({
    id: z.string().uuid(),
    component_id: z.string().uuid(),
    version_number: z.number().int().positive(),
    width_mm: z.number().nullable(),
    height_mm: z.number().nullable(),
    returns_mm: z.number().nullable(),
    material: z.string().nullable(),
    scale_confirmed: z.boolean().nullable(),
    bleed_included: z.boolean().nullable(),
    file_path: z.string().nullable(),
    artwork_thumbnail_url: z.string().nullable(),
    notes: z.string().nullable(),
    lighting: z.string().nullable(),
    extra_items_json: z.unknown().nullable(),
    created_by: z.string().uuid().nullable(),
    created_at: z.string(),
});
export type ComponentVersion = z.infer<typeof ComponentVersionSchema>;

export const ArtworkComponentItemSchema = z.object({
    id: z.string().uuid(),
    component_id: z.string().uuid(),
    label: z.string(),
    sort_order: z.number().int(),
    width_mm: z.number().nullable(),
    height_mm: z.number().nullable(),
    returns_mm: z.number().nullable(),
    measured_width_mm: z.number().nullable(),
    measured_height_mm: z.number().nullable(),
    dimension_flag: z.string().nullable(),
    width_deviation_mm: z.number().nullable(),
    height_deviation_mm: z.number().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type ArtworkComponentItem = z.infer<typeof ArtworkComponentItemSchema>;

export const ProductionCheckSchema = z.object({
    id: z.string().uuid(),
    component_id: z.string().uuid(),
    check_type: CheckTypeEnum,
    passed: z.boolean(),
    value_json: z.record(z.string(), z.unknown()).nullable(),
    notes: z.string().nullable(),
    checked_by: z.string().uuid().nullable(),
    created_at: z.string(),
});
export type ProductionCheck = z.infer<typeof ProductionCheckSchema>;

// =============================================================================
// INPUT SCHEMAS
// =============================================================================

export const CreateArtworkJobInputSchema = z.object({
    job_name: z.string().min(1, 'job name is required'),
    client_name: z.string().optional(),
    description: z.string().optional(),
});
export type CreateArtworkJobInput = z.infer<typeof CreateArtworkJobInputSchema>;

export const UpdateArtworkJobInputSchema = z.object({
    job_name: z.string().min(1).optional(),
    client_name: z.string().nullable().optional(),
    description: z.string().nullable().optional(),
    panel_size: z.string().nullable().optional(),
    paint_colour: z.string().nullable().optional(),
    status: ArtworkJobStatusEnum.optional(),
});
export type UpdateArtworkJobInput = z.infer<typeof UpdateArtworkJobInputSchema>;

export const CreateComponentInputSchema = z.object({
    name: z.string().min(1, 'component name is required'),
    component_type: ComponentTypeEnum,
});
export type CreateComponentInput = z.infer<typeof CreateComponentInputSchema>;

export const ExtraItemInputSchema = z.object({
    width_mm: z.number().positive('width must be positive'),
    height_mm: z.number().positive('height must be positive'),
    returns_mm: z.number().nullable(),
});
export type ExtraItemInput = z.infer<typeof ExtraItemInputSchema>;

export const SubmitDesignInputSchema = z.object({
    width_mm: z.number().positive('width must be positive'),
    height_mm: z.number().positive('height must be positive'),
    returns_mm: z.number().nullable(),
    material: z.string().min(1, 'material is required'),
    lighting: z.string().nullable().optional(),
    scale_confirmed: z.literal(true, {
        error: 'scale must be confirmed as 1:1',
    }),
    bleed_included: z.boolean(),
    file_path: z.string().min(1, 'file path is required'),
    notes: z.string().optional(),
    extra_items: z.array(ExtraItemInputSchema).optional(),
});
export type SubmitDesignInput = z.infer<typeof SubmitDesignInputSchema>;

export const ExtraItemMeasurementInputSchema = z.object({
    item_id: z.string().uuid(),
    measured_width_mm: z.number().positive('measured width must be positive'),
    measured_height_mm: z.number().positive('measured height must be positive'),
});
export type ExtraItemMeasurementInput = z.infer<typeof ExtraItemMeasurementInputSchema>;

export const SubmitProductionMeasurementsInputSchema = z.object({
    measured_width_mm: z.number().positive('measured width must be positive'),
    measured_height_mm: z.number().positive('measured height must be positive'),
    material_confirmed: z.boolean(),
    rip_no_scaling_confirmed: z.boolean(),
    production_notes: z.string().optional(),
    item_measurements: z.array(ExtraItemMeasurementInputSchema).optional(),
});
export type SubmitProductionMeasurementsInput = z.infer<
    typeof SubmitProductionMeasurementsInputSchema
>;

// =============================================================================
// CONSTANTS
// =============================================================================

export const DIMENSION_TOLERANCE_MM = 2;

// =============================================================================
// COMPOSITE / HELPER TYPES
// =============================================================================

export interface DimensionCheckResult {
    width_deviation_mm: number;
    height_deviation_mm: number;
    width_within_tolerance: boolean;
    height_within_tolerance: boolean;
    overall_pass: boolean;
    flag: DimensionFlag;
}

export interface ArtworkJobWithComponents extends ArtworkJob {
    components: ArtworkComponent[];
}

export interface ArtworkComponentWithVersions extends ArtworkComponent {
    versions: ComponentVersion[];
    production_checks: ProductionCheck[];
    extra_items: ArtworkComponentItem[];
}
