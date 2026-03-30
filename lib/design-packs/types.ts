/**
 * TypeScript types and Zod schemas for Design Pack Creator
 * Matches database schema from migration 014_create_design_packs.sql
 */

import { z } from 'zod';

// =============================================================================
// ENUMS
// =============================================================================

export const DesignPackStatusEnum = z.enum(['in_progress', 'completed', 'exported']);
export type DesignPackStatus = z.infer<typeof DesignPackStatusEnum>;

export const SignTypeEnum = z.enum([
    // Original 7 types
    'entrance',
    'wayfinding',
    'info_board',
    'regulatory',
    'interactive',
    'fascia',
    'totem',
    // Phase 1: Quick wins (4 new types)
    'door_plate',
    'parking_sign',
    'safety_warning',
    'accessibility',
]);
export type SignType = z.infer<typeof SignTypeEnum>;

export const SignSizeEnum = z.enum(['small', 'medium', 'large']);
export type SignSize = z.infer<typeof SignSizeEnum>;

export const SignShapeEnum = z.enum(['rectangle', 'circle', 'triangle', 'diamond']);
export type SignShape = z.infer<typeof SignShapeEnum>;

export const IconFamilyEnum = z.enum(['line', 'filled', 'duotone', 'illustrative']);
export type IconFamily = z.infer<typeof IconFamilyEnum>;

export const CostTierEnum = z.union([z.literal(1), z.literal(2), z.literal(3)]);
export type CostTier = z.infer<typeof CostTierEnum>;

export const EnvironmentModeEnum = z.enum(['day', 'night', 'weather']);
export type EnvironmentMode = z.infer<typeof EnvironmentModeEnum>;

// =============================================================================
// FONT SELECTION
// =============================================================================

export const FontSelectionSchema = z.object({
    family: z.string().min(1, 'font family is required'),
    weight: z.number().int().min(100).max(900),
    google_font_url: z.string().url().nullable(),
});

export type FontSelection = z.infer<typeof FontSelectionSchema>;

// =============================================================================
// TYPOGRAPHY
// =============================================================================

export const TypographySelectionSchema = z.object({
    primary_font: FontSelectionSchema,
    secondary_font: FontSelectionSchema,
    locked: z.boolean().default(false),
});

export type TypographySelection = z.infer<typeof TypographySelectionSchema>;

// =============================================================================
// COLOURS
// =============================================================================

export const ColourSpecSchema = z.object({
    hex: z
        .string()
        .regex(/^#[0-9A-Fa-f]{6}$/, 'must be valid hex colour (e.g. #000000)'),
    name: z.string().min(1, 'colour name is required'),
    wcag_contrast_ratio: z.number().positive().nullable(),
});

export type ColourSpec = z.infer<typeof ColourSpecSchema>;

export const ColourPaletteSchema = z.object({
    primary: ColourSpecSchema,
    secondary: ColourSpecSchema,
    accents: z.array(ColourSpecSchema).max(4, 'maximum 4 accent colours'),
    locked: z.boolean().default(false),
});

export type ColourPalette = z.infer<typeof ColourPaletteSchema>;

// =============================================================================
// GRAPHIC STYLE
// =============================================================================

export const GraphicStyleSchema = z.object({
    icon_family: IconFamilyEnum,
    pattern_style: z.string().nullable(),
    locked: z.boolean().default(false),
});

export type GraphicStyle = z.infer<typeof GraphicStyleSchema>;

// =============================================================================
// MATERIALS
// =============================================================================

export const MaterialSelectionSchema = z.object({
    substrate: z.string().min(1, 'substrate is required'),
    finish: z.string().min(1, 'finish is required'),
    cost_tier: CostTierEnum,
    locked: z.boolean().default(false),
});

export type MaterialSelection = z.infer<typeof MaterialSelectionSchema>;

// =============================================================================
// GRAPHIC ELEMENTS FOR SIGNS
// =============================================================================

export const GraphicElementSchema = z.object({
    id: z.string(), // Unique ID for this element instance
    icon_id: z.string(), // ID from graphic library
    x: z.number(), // X position (percentage or pixels)
    y: z.number(), // Y position (percentage or pixels)
    size: z.number().default(40), // Size in pixels
    rotation: z.number().default(0), // Rotation in degrees
    color: z.string().regex(/^#[0-9A-Fa-f]{6}$/), // Hex color
    opacity: z.number().min(0).max(1).default(1), // Opacity 0-1
});

export type GraphicElement = z.infer<typeof GraphicElementSchema>;

// =============================================================================
// SIGN TYPE PREVIEW
// =============================================================================

export const SignTypePreviewSchema = z.object({
    type: SignTypeEnum,
    size: SignSizeEnum.default('medium'),
    shape: SignShapeEnum.default('rectangle'),
    content: z.record(z.string(), z.string()).optional(), // Custom text content for the sign
    graphics: z.array(GraphicElementSchema).default([]), // Graphic elements on the sign
    pattern_id: z.string().nullable(), // Background pattern ID
    preview_svg: z.string().min(1, 'svg content is required'),
    notes: z.string().nullable(),
});

export type SignTypePreview = z.infer<typeof SignTypePreviewSchema>;

// =============================================================================
// ENVIRONMENT PREVIEW
// =============================================================================

export const EnvironmentPreviewSchema = z.object({
    site_photo_url: z.string().url(),
    composite_image_url: z.string().url().or(z.literal('')),
    mode: EnvironmentModeEnum,
    overlay_position: z
        .object({
            x: z.number(),
            y: z.number(),
            width: z.number(),
            height: z.number(),
        })
        .optional(),
});

export type EnvironmentPreview = z.infer<typeof EnvironmentPreviewSchema>;

// =============================================================================
// PARKED DECISION
// =============================================================================

export const ParkedDecisionSchema = z.object({
    section: z.string().min(1),
    options: z.array(z.string()).min(2, 'must have at least 2 options'),
    reason: z.string().min(1, 'reason is required'),
    created_at: z.string().datetime(),
});

export type ParkedDecision = z.infer<typeof ParkedDecisionSchema>;

// =============================================================================
// EXPORT RECORD
// =============================================================================

export const ExportRecordSchema = z.object({
    exported_at: z.string().datetime(),
    pdf_url: z.string().url(),
    version: z.number().int().positive(),
});

export type ExportRecord = z.infer<typeof ExportRecordSchema>;

// =============================================================================
// DESIGN PACK DATA (data_json field content)
// =============================================================================

export const DesignPackDataSchema = z.object({
    typography: TypographySelectionSchema.optional(),
    colours: ColourPaletteSchema.optional(),
    graphic_style: GraphicStyleSchema.optional(),
    materials: MaterialSelectionSchema.optional(),
    sign_types: z.array(SignTypePreviewSchema).default([]),
    environment_previews: z.array(EnvironmentPreviewSchema).default([]),
    parked_decisions: z.array(ParkedDecisionSchema).default([]),
    export_history: z.array(ExportRecordSchema).default([]),
});

export type DesignPackData = z.infer<typeof DesignPackDataSchema>;

// =============================================================================
// DESIGN PACK (full database row)
// =============================================================================

export const DesignPackSchema = z.object({
    id: z.string().uuid(),
    project_name: z.string().min(1, 'project name is required'),
    client_name: z.string().min(1, 'client name is required'),
    client_email: z.string().email().nullable(),
    status: DesignPackStatusEnum,
    data_json: DesignPackDataSchema,
    created_at: z.string().datetime(),
    updated_at: z.string().datetime(),
    created_by: z.string().uuid().nullable(),
});

export type DesignPack = z.infer<typeof DesignPackSchema>;

// =============================================================================
// INPUT SCHEMAS (for server actions)
// =============================================================================

export const CreateDesignPackInputSchema = z.object({
    project_name: z.string().min(1, 'project name is required'),
    client_name: z.string().min(1, 'client name is required'),
    client_email: z.string().email().optional(),
});

export type CreateDesignPackInput = z.infer<typeof CreateDesignPackInputSchema>;

export const UpdateDesignPackInputSchema = z.object({
    project_name: z.string().min(1).optional(),
    client_name: z.string().min(1).optional(),
    client_email: z.string().email().nullable().optional(),
    status: DesignPackStatusEnum.optional(),
    data_json: DesignPackDataSchema.partial().optional(),
});

export type UpdateDesignPackInput = z.infer<typeof UpdateDesignPackInputSchema>;

// =============================================================================
// DEFAULT VALUES
// =============================================================================

export const DEFAULT_DESIGN_PACK_DATA: DesignPackData = {
    typography: undefined,
    colours: undefined,
    graphic_style: undefined,
    materials: undefined,
    sign_types: [],
    environment_previews: [],
    parked_decisions: [],
    export_history: [],
};

// Default brand colours (customizable starting point)
export const DEFAULT_BRAND_COLOURS: ColourPalette = {
    primary: {
        hex: '#000000',
        name: 'black',
        wcag_contrast_ratio: 21, // vs white
    },
    secondary: {
        hex: '#FFFFFF',
        name: 'white',
        wcag_contrast_ratio: 21, // vs black
    },
    accents: [],
    locked: false,
};

// =============================================================================
// HELPER TYPES
// =============================================================================

// For section locking in presentation mode
export type LockableSection =
    | 'typography'
    | 'colours'
    | 'graphic_style'
    | 'materials'
    | 'sign_types'
    | 'environment';

// Progress tracking
export interface ProgressState {
    total_sections: number;
    completed_sections: number;
    locked_sections: Set<LockableSection>;
    percentage: number;
}

// Presentation mode state
export interface PresentationState {
    current_slide: number;
    locked_sections: Set<LockableSection>;
    comparison_mode: boolean;
}
