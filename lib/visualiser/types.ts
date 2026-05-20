/**
 * Folded aluminium panel visualiser — shared types & Zod schemas.
 *
 * The visualiser turns a surveyed sign spec into a clean, production-ready
 * flat development (DXF) + a dimensioned shop drawing (PDF) + an interactive
 * 3D folded preview. PanelParams is the single source of truth: the 3D mesh,
 * the flat development, and both exporters all derive from it.
 */

import { z } from 'zod';

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum fabricable panel width (mm). Aluminium sheet usable width. When the
 * sign face is wider than this it is split into sections with a full panel
 * kept centred (the logo normally sits dead centre — keeping it on one
 * unbroken sheet is the whole point of the centred-split rule).
 */
export const MAX_PANEL_WIDTH_MM = 2990;

/** Uploaded-SVG features narrower than this get a non-blocking laser warning. */
export const MIN_LASER_FEATURE_MM = 5;

/**
 * The bend rule, in one place so the geometry, the PDF spec block and the DXF
 * NOTES layer can never disagree. Every fold line removes `thickness / 2` from
 * the material on EACH side of the line (user-specified shop rule). A face
 * edge shared with a return is one fold line: the face loses T/2 there and the
 * return loses T/2 at its root.
 */
export function bendDeductionPerSide(thicknessMm: number): number {
    return thicknessMm / 2;
}

export const BEND_RULE_TEXT =
    'Bend allowance: thickness ÷ 2 deducted from each side of every fold line';

// =============================================================================
// DXF LAYERS — named, discrete-entity layers. No blocks, no groups.
// =============================================================================

export const DXF_LAYERS = {
    PANEL_OUTLINE: 'PANEL_OUTLINE',
    FOLD_LINES: 'FOLD_LINES',
    APERTURE: 'APERTURE',
    FIXINGS: 'FIXINGS',
    KEYLINE: 'KEYLINE',
    SEAM: 'SEAM',
    DIMENSIONS: 'DIMENSIONS',
    NOTES: 'NOTES',
} as const;

export type DxfLayer = (typeof DXF_LAYERS)[keyof typeof DXF_LAYERS];

// AutoCAD colour numbers, mirrors the halman-thompson convention.
export const DXF_LAYER_COLORS: Record<DxfLayer, number> = {
    PANEL_OUTLINE: 7, // white/black
    FOLD_LINES: 1, // red
    APERTURE: 5, // blue
    FIXINGS: 6, // magenta — stand-off fixing holes
    KEYLINE: 4, // cyan
    SEAM: 3, // green
    DIMENSIONS: 8, // grey
    NOTES: 8, // grey
};

// =============================================================================
// ZOD SCHEMAS
// =============================================================================

export const ReturnsSchema = z.object({
    top: z.boolean(),
    bottom: z.boolean(),
    left: z.boolean(),
    right: z.boolean(),
});
export type Returns = z.infer<typeof ReturnsSchema>;

/**
 * Placement of the uploaded aperture SVG on the face.
 *
 * The anchor is the artwork's CENTRE OF MASS (its bounding-box centre), so
 * scaling and re-aligning never drift the artwork. `alignH`/`alignV` snap
 * that centre to a face position (default: dead centre); `nudge` is a fine
 * mm adjustment from there; `scale` multiplies the SVG's native units.
 * Nullable — a panel-only design has no aperture.
 */
export type AlignH = 'left' | 'center' | 'right';
export type AlignV = 'top' | 'middle' | 'bottom';

export const AperturePlacementSchema = z.object({
    alignH: z.enum(['left', 'center', 'right']),
    alignV: z.enum(['top', 'middle', 'bottom']),
    nudgeXMm: z.number(),
    nudgeYMm: z.number(),
    scale: z.number().positive(),
});
export type AperturePlacement = z.infer<typeof AperturePlacementSchema>;

/** Default: artwork centred on the face, no nudge, 1:1 scale. */
export const DEFAULT_PLACEMENT: AperturePlacement = {
    alignH: 'center',
    alignV: 'middle',
    nudgeXMm: 0,
    nudgeYMm: 0,
    scale: 1,
};

/**
 * What the uploaded SVG is used for:
 *   - 'aperture' — the SVG is cut OUT of the panel (lettering becomes holes).
 *   - 'standoff' — the lettering is fabricated separately and mounted with
 *                  stand-off studs; the panel gets small fixing holes placed
 *                  inside each letter shape instead, and the SVG appears as
 *                  a non-cut reference outline on the PDF.
 */
export type ApertureMode = 'aperture' | 'standoff';

export const PanelParamsSchema = z.object({
    name: z.string().min(1, 'name is required').max(120),
    panelWidthMm: z.number().positive('width must be > 0').max(20000),
    panelHeightMm: z.number().positive('height must be > 0').max(20000),
    returnDepthMm: z.number().min(0).max(2000),
    returns: ReturnsSchema,
    /** Inward lip folded at the return tip (0 = no shadow gap). */
    shadowGapMm: z.number().min(0).max(500),
    /** Outward offset drawn around the aperture cut (0 = no keyline). */
    keylineMm: z.number().min(0).max(200),
    materialThicknessMm: z.number().positive('thickness must be > 0').max(50),
    /** Free-text finish/material, shown in the PDF spec block + DXF notes. */
    materialLabel: z.string().max(120).optional(),
    aperturePlacement: AperturePlacementSchema.nullable().optional(),
    /** How the uploaded artwork is treated. Default 'aperture'. */
    apertureMode: z.enum(['aperture', 'standoff']).optional(),
    /** Diameter (mm) of each stand-off fixing hole. Default 10mm. */
    fixingDiameterMm: z.number().positive().max(100).optional(),
    /**
     * Deprecated — kept so saved designs from the previous radius-based
     * schema still load. The UI reads fixingDiameterMm; if absent, falls
     * back to `fixingRadiusMm * 2`.
     */
    fixingRadiusMm: z.number().positive().max(50).optional(),
    /**
     * Fixing density multiplier: 1.0 = the auto default, >1 = denser (more
     * holes, heavier lettering like brass), <1 = sparser (fewer holes, light
     * lettering like acrylic). Clamped to a safe range.
     */
    fixingDensity: z.number().min(0.4).max(2.5).optional(),
});
export type PanelParams = z.infer<typeof PanelParamsSchema>;

export const SaveDesignInputSchema = z.object({
    id: z.string().uuid().optional(),
    params: PanelParamsSchema,
    /** Raw uploaded aperture SVG (already flattened on import). */
    svgSource: z.string().max(5_000_000).nullable().optional(),
    quoteId: z.string().uuid().nullable().optional(),
    quoteItemId: z.string().uuid().nullable().optional(),
    orgId: z.string().uuid().nullable().optional(),
});
export type SaveDesignInput = z.infer<typeof SaveDesignInputSchema>;

// =============================================================================
// DATABASE ROW
// =============================================================================

export interface VisualiserDesignRow {
    id: string;
    name: string;
    org_id: string | null;
    quote_id: string | null;
    quote_item_id: string | null;
    params_json: PanelParams;
    svg_source: string | null;
    created_by: string | null;
    created_at: string;
    updated_at: string;
}

// =============================================================================
// GEOMETRY OUTPUT TYPES (shared by 3D, flat preview, DXF, PDF)
// =============================================================================

export type SegmentRole = 'face' | 'return' | 'lip';
export type PanelEdge = 'top' | 'bottom' | 'left' | 'right';

/** A rectangle in flat-development space (mm, origin top-left, y-down). */
export interface FlatSegment {
    id: string;
    role: SegmentRole;
    edge?: PanelEdge;
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
    label: string;
}

/** A fold line in flat-development space. */
export interface FoldLine {
    id: string;
    edge: PanelEdge;
    kind: 'return' | 'lip';
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    note: string;
}

export interface PanelDevelopment {
    /** Nominal face size (the survey size, before bend deduction). */
    faceNominalWMm: number;
    faceNominalHMm: number;
    /** Face size in the flat blank, after bend deduction. */
    faceFlatWMm: number;
    faceFlatHMm: number;
    /** Return depth in the flat blank, after bend deduction. */
    returnFlatDepthMm: number;
    /** Shadow-gap lip depth in the flat blank (0 if no shadow gap). */
    lipFlatDepthMm: number;
    /** Overall flat blank bounding box. */
    totalFlatWMm: number;
    totalFlatHMm: number;
    segments: FlatSegment[];
    foldLines: FoldLine[];
}

export interface PanelSplit {
    /** Section face widths, left → right, summing to the face width. */
    sections: number[];
    /** Seam X positions in face mm, measured from the left face edge. */
    seamXsMm: number[];
    /** Index into `sections` of the centred full panel. */
    centreIndex: number;
    /** True when the sign needed splitting (face width > MAX_PANEL_WIDTH_MM). */
    wasSplit: boolean;
}

// =============================================================================
// SVG IMPORT TYPES
// =============================================================================

export interface FlatPath {
    /** Absolute polyline points in the SVG's native units (mm). */
    points: Array<[number, number]>;
    closed: boolean;
}

export interface ImportedSvg {
    paths: FlatPath[];
    /** Native bounding box in mm. */
    bbox: { x: number; y: number; w: number; h: number };
    /** Non-blocking laser warnings (features < MIN_LASER_FEATURE_MM). */
    warnings: string[];
}
