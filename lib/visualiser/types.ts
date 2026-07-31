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
 *   - 'vinyl'    — the WHOLE artwork is a printed full-colour vinyl applied to
 *                  the panel face: nothing is cut, and it renders in the
 *                  artwork's true colours + gradients (print-&-cut output).
 *                  This is the upload-time "this is a vinyl" choice; individual
 *                  paths can still be re-assigned via material groups.
 */
export type ApertureMode = 'aperture' | 'standoff' | 'vinyl';

/**
 * Extra-face materials — a decorative face laminated over a letter (push-
 * through, aperture-cut or backlit). For now a small metal-finish set; this
 * enum is the single extension point for new face stock. The rich spec
 * (preview colour, PBR hints, default thickness) lives in
 * `lib/visualiser/extra-face.ts` so this types module stays dependency-light.
 */
export const FaceMaterialEnum = z.enum([
    'brass',
    'stainless',
    'aluminium',
    'copper',
    'mirror',
]);
export type FaceMaterial = z.infer<typeof FaceMaterialEnum>;

/**
 * PanelCoreSchema is every field that describes a single folded-aluminium
 * panel — dimensions, returns, artwork, materials, illumination, fixings.
 *
 * A *design* is a main fascia panel (PanelParams, below) that may also carry
 * a second, projecting (blade) sign. The projecting sign is itself a full
 * PanelCore — it has its own artwork, materials and dimensions, designed on
 * its own tab — plus a `mount` describing where it attaches to the fascia and
 * how far it protrudes. The two are composited in one 3D scene (fascia on the
 * wall, blade protruding perpendicular, like a real shopfront) but fabricated
 * and exported as separate items.
 *
 * PanelCore deliberately has NO `projectingSign` field — only the main panel
 * (PanelParams) does, so a projecting sign can't itself carry another.
 */
const PanelCoreSchema = z.object({
    name: z.string().min(1, 'name is required').max(120),
    panelWidthMm: z.number().positive('width must be > 0').max(20000),
    panelHeightMm: z.number().positive('height must be > 0').max(20000),
    /**
     * Optional override for the centre panel width when the sign is split
     * across multiple sheets. Default is "use the max sheet width" — set
     * this when the shop has an oddball off-cut to use up. Side panels
     * automatically rebalance around the new centre. Ignored when the
     * sign fits on one sheet.
     */
    centrePanelOverrideMm: z.number().positive().max(20000).nullable().optional(),
    returnDepthMm: z.number().min(0).max(2000),
    returns: ReturnsSchema,
    /** Inward lip folded at the return tip (0 = no shadow gap). */
    shadowGapMm: z.number().min(0).max(500),
    /**
     * Which edges actually get a shadow-gap lip when shadowGapMm > 0. In
     * practice top + bottom are the only ones the fabricator uses — the
     * lip is a mounting flange for hanging hardware on those edges. Left
     * and right returns never get a lip. Optional for backward compat:
     * missing → both true.
     */
    shadowGapEdges: z
        .object({ top: z.boolean(), bottom: z.boolean() })
        .optional(),
    /** Outward offset drawn around the aperture cut (0 = no keyline). */
    keylineMm: z.number().min(0).max(200),
    materialThicknessMm: z.number().positive('thickness must be > 0').max(50),
    /** Free-text finish/material, shown in the PDF spec block + DXF notes. */
    materialLabel: z.string().max(120).optional(),
    /** Panel base colour (hex). Carried forward into 3D and flat previews. */
    panelColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'panelColor must be a 6-digit hex colour')
        .optional(),
    /**
     * The RAL Classic code the panel colour was chosen as (e.g. 'RAL 9016').
     * panelColor holds the sRGB preview hex; THIS is the production spec — the
     * coat is ordered by RAL number. Set by the RAL picker.
     */
    panelRal: z.string().max(40).optional(),
    aperturePlacement: AperturePlacementSchema.nullable().optional(),
    /** How the uploaded artwork is treated. Default 'aperture'. */
    apertureMode: z.enum(['aperture', 'standoff', 'vinyl']).optional(),
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
    /**
     * Stand-off lettering: physical thickness of the cut letter pieces, the
     * distance they stand off the panel face, and their colour. Only used
     * in standoff mode to render the lettering as 3D extruded geometry in
     * front of the panel.
     */
    letterThicknessMm: z.number().positive().max(200).optional(),
    standoffDistanceMm: z.number().min(0).max(300).optional(),
    letterColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, 'letterColor must be a 6-digit hex colour')
        .optional(),
    /**
     * Standoff stud / fixing hardware spec — what the fabricator
     * actually procures. Captured once per sign (signs typically use
     * one stud type throughout). Surfaced on the standoff material
     * page of the reference PDF so the back-shop knows exactly which
     * fixings to order without phoning the office.
     *
     * Defaults to M8 stainless studs sized for the sign's standoff
     * distance (distance + ~15 mm penetration allowance).
     */
    standoffStudSpec: z
        .object({
            thread: z.enum(['M5', 'M6', 'M8', 'M10']).optional(),
            lengthMm: z.number().positive().max(300).optional(),
            finish: z.string().max(60).optional(),
            supplier: z.string().max(120).optional(),
        })
        .optional(),
    /**
     * Manually-placed fixing positions in flat-development coords (mm).
     * These survive density / radius / artwork edits — they're the "I
     * need a fixing exactly here" pins. Merged with the auto-placed
     * fixings at render and export time.
     */
    manualFixings: z.array(z.tuple([z.number(), z.number()])).optional(),
    /**
     * Cable-routing holes — manually positioned holes cut in the panel
     * face to feed LED cables into illuminated letters. Unlike standoff
     * fixings these are NEVER auto-placed: there's only one or two per
     * letter and the fabricator wants them exactly where the cable run
     * dictates, so they're a pure click-to-place positioner.
     *
     * Stored in SVG-local coords (like manualFixings) so they track the
     * lettering across alignment / scale / nudge edits.
     */
    cableHoles: z.array(z.tuple([z.number(), z.number()])).optional(),
    /** Diameter (mm) of each cable hole. Default 10mm. */
    cableHoleDiameterMm: z.number().positive().max(100).optional(),
    /**
     * Illumination config — which lighting effects the sign has, and
     * their colour. Independent of the day/night PREVIEW toggle (that's
     * a view-only state in the client): this records what's actually
     * built into the sign, so the preview knows what to light up when
     * the operator switches to the dark view.
     *
     * Keyline illumination: LEDs behind the opal push-through backing
     * board; the opal diffuses the light, which escapes through the
     * keyline shoulder (the gap between each letter and the panel hole)
     * as a halo around the lettering. Modelled as an emissive backing
     * panel so the halo falls out of the existing geometry for free.
     */
    illumination: z
        .object({
            keyline: z
                .object({
                    enabled: z.boolean(),
                    color: z
                        .string()
                        .regex(
                            /^#[0-9a-fA-F]{6}$/,
                            'colour must be 6-digit hex',
                        ),
                    /** Glow strength multiplier. Default 1. */
                    intensity: z.number().min(0).max(5).optional(),
                })
                .optional(),
        })
        .optional(),
    /**
     * Save material on the opal backing: instead of ONE sheet spanning every
     * illuminated piece (push-through + backlit), emit a separate sheet per
     * cluster of pieces — pieces that sit close together regroup onto one
     * sheet, isolated pieces get their own, and the gaps (e.g. a stood-off
     * letter between two backlit pieces) carry no opal. Off → one sheet
     * (default).
     */
    splitBacking: z.boolean().optional(),
    /**
     * Artwork layers — multiple independently-placed pieces of artwork
     * on one sign (an icon + a wordmark uploaded separately, say). Each
     * layer carries its own SVG (PNG/JPG are traced to SVG before
     * adding) and a position + scale in PANEL-FACE millimetres
     * (origin top-left of the face). At render the layers composite
     * into a single artwork in a panel-sized frame, which flows through
     * the normal pipeline unchanged. Empty / absent → the legacy
     * single-upload artwork (svg_source) is used instead.
     */
    artworkLayers: z
        .array(
            z.object({
                id: z.string().min(1),
                label: z.string().optional(),
                svgSource: z.string().max(2_000_000),
                /** Top-left position on the face, mm. */
                xMm: z.number(),
                yMm: z.number(),
                /** Multiplier on the layer's native units. */
                scale: z.number().positive(),
                /** Native bbox size (mm) — cached for sizing / the UI. */
                wMm: z.number().nonnegative(),
                hMm: z.number().nonnegative(),
            }),
        )
        .optional(),
    /**
     * Premium built-up lettering spec captured in the public studio — the same
     * data the standalone built-up returns builder produces, so production can
     * fulfil the job straight from the enquiry. Rides in params_json to the
     * lead; the engine ignores it (the letters render as stand-off in-scene for
     * now — the true face+returns asset render is a planned follow-up).
     */
    builtUp: z
        .object({
            finish: z.enum(['brass', 'white', 'black']),
            returnDepthMm: z.number().positive(),
            materialThicknessMm: z.number().positive(),
            breakAngleDeg: z.number().nonnegative(),
            stockLengthMm: z.number().positive(),
            realHeightMm: z.number().nonnegative().optional(),
            totalReturnLengthMm: z.number().nonnegative(),
            weldCount: z.number().nonnegative(),
            faceCount: z.number().nonnegative(),
        })
        .optional(),
    /**
     * Material groups — the heart of the mixed-material model. Each
     * group bundles a set of imported SVG paths under a shared
     * material. A single sign can mix any combination of materials
     * (e.g. aperture cuts + face-stuck acrylic detail + stood-off
     * lettering + vinyl tagline). Paths not in any group fall back to
     * the default behaviour driven by `apertureMode`.
     *
     *   - 'cut'         — explicit "cut from the panel" (face hole).
     *                     Same as ungrouped when apertureMode = 'aperture'.
     *   - 'solid'       — leave as panel material. Used for inner counters
     *                     that the SVG exports as a separate closed path.
     *   - 'vinyl'       — flat colour appliqué on the panel face.
     *   - 'acrylic'     — coloured sheet extruded by thicknessMm,
     *                     face-stuck (no standoff).
     *   - 'standoff'    — extruded letter mounted via studs at
     *                     standoffDistanceMm in front of the face.
     *   - 'pushthrough' — acrylic letter pressed through the panel face
     *                     from behind: panel has a keyline-shaped hole,
     *                     outer letter + counter cut as two separate
     *                     small acrylic pieces and mounted on a backing
     *                     board behind the panel. Counter is visible
     *                     through the panel hole because the hole sits
     *                     at the keyline (larger than the letter), so the
     *                     counter piece fits inside the hole next to the
     *                     outer piece.
     *   - 'backlight'   — the shape is cut from the panel (like an aperture)
     *                     and an opal diffuser panel sits behind it, lit from
     *                     behind: the solid cut shape glows. Same back-panel
     *                     construction as keyline illumination, but the glow
     *                     fills the whole cut rather than a keyline shoulder.
     *                     `color` is the per-element glow colour; `glowIntensity`
     *                     its brightness.
     *
     * Indices are positions into `imported.paths`, so the list is
     * cleared whenever a new SVG is loaded.
     */
    materialGroups: z
        .array(
            z.object({
                id: z.string().min(1),
                label: z.string().optional(),
                material: z.enum([
                    'cut',
                    'solid',
                    'vinyl',
                    'acrylic',
                    'standoff',
                    'pushthrough',
                    'backlight',
                ]),
                color: z
                    .string()
                    .regex(/^#[0-9a-fA-F]{6}$/, 'colour must be 6-digit hex'),
                /**
                 * Vinyl only. When true (the default for vinyl), the piece is
                 * a digitally-PRINTED vinyl: it renders in the artwork's true
                 * colours + gradients (sampled from the original SVG) and
                 * exports as print-&-cut (a full-colour print at 1:1 plus the
                 * contour cut line). When false it's a SOLID spot-colour cut
                 * vinyl — the flat `color` above, plotter-cut, no print.
                 * Ignored for non-vinyl materials.
                 */
                printFullColor: z.boolean().optional(),
                /**
                 * Backlight only — glow brightness multiplier for this
                 * element's lit opal (1 = default). The glow colour is the
                 * group `color`.
                 */
                glowIntensity: z.number().min(0).max(5).optional(),
                /** Acrylic, standoff + pushthrough. */
                thicknessMm: z.number().positive().max(50).optional(),
                /** Standoff only — gap between panel face and letter back. */
                standoffDistanceMm: z.number().min(0).max(300).optional(),
                /**
                 * Push-through only — outward offset between the original
                 * letter outline and the panel cut. Drives the keyline that
                 * becomes the panel's letter-shaped hole. Supersedes the
                 * global `keylineMm` for paths in this group. Default 1.5 mm
                 * (a typical press-fit shoulder for ~3 mm acrylic).
                 */
                keylineOffsetMm: z.number().min(0).max(50).optional(),
                /**
                 * Push-through only — how far the acrylic piece protrudes
                 * proud of the panel face from behind. Visual only on the
                 * 3D scene; cutter doesn't care. Default 5 mm.
                 */
                protrusionMm: z.number().min(0).max(100).optional(),
                /**
                 * Optional EXTRA FACE laminated over this group's letters — a
                 * second cut layer in a metal finish (brass / stainless / …).
                 * Only meaningful for groups whose material is a "letter" that
                 * a face can sit on: 'pushthrough', 'cut' or 'backlight'.
                 * Production: the face is cut from sheet metal to the same
                 * outline + counters as the letter and bonded on the front;
                 * it nests exactly like an acrylic face (drives
                 * `extraFacePieces` + the linked metal-faces nest on export).
                 * Absent / null → no extra face.
                 */
                extraFace: z
                    .object({
                        material: FaceMaterialEnum,
                        /** Sheet thickness (mm) of the metal face. */
                        thicknessMm: z.number().positive().max(20),
                    })
                    .nullable()
                    .optional(),
                /**
                 * Optional PRINTED FACE VINYL applied to this group's letters — a
                 * second uploaded SVG (the full-colour print artwork) of the same
                 * proportions as the letters. It is auto-aligned to the group's
                 * letter bounding box, clipped to the letter outlines, and
                 * laminated on the front (drives `faceVinylPrintDataUrl` +
                 * `faceVinylPieces` + the print-and-cut export). Same letter
                 * materials as extraFace ('pushthrough', 'cut', 'backlight',
                 * 'acrylic'). Absent / null → no face vinyl.
                 */
                faceVinyl: z
                    .object({
                        /** The print artwork SVG (colours + gradients intact). */
                        svgSource: z.string().min(1).max(2_000_000),
                        /** Cached native content bbox of the print, for naming. */
                        wMm: z.number().nonnegative().default(0),
                        hMm: z.number().nonnegative().default(0),
                    })
                    .nullable()
                    .optional(),
                pathIndices: z.array(z.number().int().min(0)),
            }),
        )
        .optional(),
});
export type PanelCore = z.infer<typeof PanelCoreSchema>;

/** Projecting-sign silhouette. Square (the Wallsend shopfront style) or a round disc. */
export type ProjectingShape = 'square' | 'circle';

/** Default size (mm) of a new projecting sign — small, like a real shopfront blade. */
export const DEFAULT_PROJECTING_SIZE_MM = 500;

/**
 * How a projecting (blade) sign attaches to the main fascia. It ALWAYS sits
 * perpendicular to the fascia FACE — it mounts somewhere on the front face and
 * projects straight out toward the street (read from the side as you approach),
 * never off an edge / top / bottom / back. Its panel WIDTH is how far it
 * protrudes and its HEIGHT is vertical. The mount positions the attachment
 * point on the face, records the shape, and how far it stands off the fascia.
 */
export const ProjectingMountSchema = z.object({
    /**
     * Horizontal position of the attachment point on the fascia FACE, measured
     * in mm from the fascia's LEFT edge. Default 0 (near the left, like the
     * Wallsend shopfront).
     */
    offsetXMm: z.number().optional(),
    /**
     * Vertical position of the sign's TOP, measured in mm down from the
     * fascia's top edge. Default 0 (aligned near the fascia top).
     */
    offsetYMm: z.number().optional(),
    /** Sign silhouette. Default 'square'. */
    shape: z.enum(['square', 'circle']).optional(),
    /** Artwork on both faces (the usual case for a projecting sign). */
    doubleSided: z.boolean().optional(),
    /**
     * Gap between the fascia FACE and the projecting sign's near edge, in mm.
     * Default 0 (the sign's near edge meets the fascia face). Raise it to
     * stand the sign off the fascia. How it physically mounts is decided in
     * the workshop — we just record the standoff distance for now.
     */
    offsetZMm: z.number().optional(),
});
export type ProjectingMount = z.infer<typeof ProjectingMountSchema>;

/**
 * A projecting sign attached to a design: a full panel (its own artwork,
 * materials, dimensions) plus the mount, plus the blade's own uploaded
 * aperture SVG (the main panel's lives in the `svg_source` column; the
 * blade's rides here inside params_json).
 */
export const ProjectingSignSchema = z.object({
    panel: PanelCoreSchema,
    mount: ProjectingMountSchema,
    svgSource: z.string().max(5_000_000).nullable().optional(),
});
export type ProjectingSign = z.infer<typeof ProjectingSignSchema>;

/**
 * The main fascia panel — a PanelCore that may also carry a projecting sign.
 * The whole projecting blade (its panel + mount + svg) nests inside
 * params_json, so adding it needs no DB migration and old designs (no
 * `projectingSign`) load as a main panel only.
 */
export const PanelParamsSchema = PanelCoreSchema.extend({
    projectingSign: ProjectingSignSchema.optional(),
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
// SECTIONED EXPORT (multi-panel cut sheet)
// =============================================================================
//
// When a sign is wider than one piece of sheet stock, the export DXF/PDF
// contains each section as its own cut-ready flat blank, laid out side by
// side on the same sheet. Returns only sit on the outer perimeter of the
// assembled sign — internal split edges are butt joins, no folds.

export interface SectionLayout {
    /** 0-based section index, left → right. */
    index: number;
    /** Total number of sections in this export. */
    count: number;
    /** Nominal face width of this section (mm). */
    sectionWidthMm: number;
    /** X start of this section in the full-sign's nominal face (mm). */
    faceSliceXMm: number;
    /** Returns config used when building this section's development. */
    returnsUsed: Returns;
    /**
     * Flat development of this section alone, with its own bend deductions.
     * Coords are local — see `layoutOriginXMm` for placement in the export.
     */
    development: PanelDevelopment;
    /**
     * X offset of this section's flat blank in the export sheet layout
     * (cumulative widths of previous sections + per-section gap).
     */
    layoutOriginXMm: number;
}

export interface SectionedExport {
    sections: SectionLayout[];
    /** Overall export sheet width (sum of section flat widths + gaps). */
    totalLayoutWMm: number;
    /** Overall export sheet height (max section flat height). */
    totalLayoutHMm: number;
    /** Gap between adjacent sections in the layout (mm). */
    gapMm: number;
}

/**
 * Everything the 3D scene needs to render one panel's full design. Captured
 * for the active panel and cached so the OTHER panel in a projecting-sign
 * design can be drawn with its real material-group geometry too (both signs
 * show their proper design at once), without re-running the pipeline twice.
 */
/** The flat face rectangle in flat-development mm — the coordinate frame the
 *  full-colour vinyl raster is rendered into, so consumers can place it. */
export interface FaceRectMm {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface PanelRenderBundle {
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    pushThroughKeyline: FlatPath[];
    pushThroughIslands: FlatPath[];
    autoFixings: FlatPath[];
    manualFixings: FlatPath[];
    cableHoles: FlatPath[];
    reference: FlatPath[];
    vinylPieces: MaterialPiece[];
    acrylicPieces: MaterialPiece[];
    solidPieces: MaterialPiece[];
    standoffPieces: StandoffPiece[];
    pushThroughPieces: PushThroughPiece[];
    /**
     * Backlit apertures — cut from the panel, with an opal diffuser behind
     * that glows (the cut shape lights up). `color` is the glow colour,
     * `glowIntensity` its brightness. The CUT itself is also in `aperture`.
     */
    backlightPieces: MaterialPiece[];
    /**
     * Extra metal faces (brass / stainless / …) laminated over letters — flat
     * cut pieces, same outline + counters as the underlying letter. They nest
     * exactly like acrylic faces and export as a linked metal-faces nest.
     */
    extraFacePieces: ExtraFacePiece[];
    /**
     * Full-colour vinyl print — a transparent face-sized PNG of the real
     * artwork (colours + gradients), masked to the printed-vinyl shapes. Null
     * when there's no printed vinyl. Paired with `faceRectMm` so it can be
     * dropped onto the face at the right place. Built async (canvas), so it's
     * threaded alongside the (sync) bundle rather than inside it.
     */
    vinylPrintDataUrl?: string | null;
    faceRectMm?: FaceRectMm | null;
}

/**
 * The per-section export geometry + pieces for one panel — everything a PDF
 * generator needs beyond doc-level fields. Captured for the active panel and
 * cached so the OTHER panel of a two-item (fascia + projecting) job can be
 * included in the same PDF export without re-running the pipeline.
 */
export interface PanelPdfData {
    params: PanelParams;
    sectionExport: SectionedExport;
    /**
     * The WHOLE-SIGN continuous flat development + its continuous cut arrays —
     * used only by the reference-PDF human pages to draw a split sign as one
     * continuous panel with seam lines (so artwork can't drift against gapped
     * section blanks). Carried here so a two-item job's projecting sign gets the
     * same treatment via the `secondary` PdfOptions.
     */
    development: PanelDevelopment;
    aperture: FlatPath[];
    pushThroughIslands: FlatPath[];
    fixings: FlatPath[];
    apertureBySection: FlatPath[][];
    keylineBySection: FlatPath[][];
    pushThroughKeylineBySection: FlatPath[][];
    pushThroughIslandsBySection: FlatPath[][];
    fixingsBySection: FlatPath[][];
    cableHolesBySection: FlatPath[][];
    referenceBySection: FlatPath[][];
    apertureHolesBySection: FlatPath[][];
    vinylPieces: MaterialPiece[];
    acrylicPieces: MaterialPiece[];
    solidPieces: MaterialPiece[];
    standoffPieces: StandoffPiece[];
    pushThroughPieces: PushThroughPiece[];
    /** Backlit apertures (see PanelRenderBundle) — for the opal-backing +
     *  LED pages in the production PDF and the reference backlight page. */
    backlightPieces: MaterialPiece[];
    /** Extra metal faces (see PanelRenderBundle) — for the metal-faces cut
     *  page in the production PDF. */
    extraFacePieces: ExtraFacePiece[];
    /** Full-colour vinyl print (see PanelRenderBundle) — for the print-&-cut
     *  page. Null when there's no printed vinyl. */
    vinylPrintDataUrl?: string | null;
    faceRectMm?: FaceRectMm | null;
}

/** A pre-export advisory warning. Never blocks the download. */
export interface ExportWarning {
    kind:
        | 'missing_material'
        | 'aperture_clipped'
        | 'fixing_on_seam'
        | 'aperture_near_fold'
        | 'aperture_on_seam'
        // Viewport-side advisories merged into the same list so the
        // canvas tray and the export ready-checklist never disagree on
        // the count.
        | 'geometry'
        | 'counter_survival';
    message: string;
}

// =============================================================================
// SVG IMPORT TYPES
// =============================================================================

export interface FlatPath {
    /** Absolute polyline points in the SVG's native units (mm). */
    points: Array<[number, number]>;
    closed: boolean;
    /**
     * Resolved display colour from the source SVG (stroke, falling back to
     * fill), as a CSS colour string — e.g. '#ff2d95'. Optional: the cut/
     * panel pipeline ignores it; the neon visualiser uses it to colour each
     * glowing run. Absent when the importer couldn't resolve a colour.
     */
    stroke?: string;
}

export interface ImportedSvg {
    paths: FlatPath[];
    /** Native bounding box in mm. */
    bbox: { x: number; y: number; w: number; h: number };
    /** Non-blocking laser warnings (features < MIN_LASER_FEATURE_MM). */
    warnings: string[];
}

/**
 * A path that has been pulled out of the aperture cut and re-classified
 * as a different material. Placed + clipped to face bounds, so callers
 * can render it directly. Vinyl = flat colour on the face; acrylic =
 * extruded by thicknessMm, sitting on the face front.
 */
export interface MaterialPiece {
    /** Index back into the original imported.paths array. */
    pathIndex: number;
    path: FlatPath;
    /**
     * Nested paths fully contained inside `path`, regardless of their
     * own material assignment. Rendered as even-odd subtractive holes
     * so an outer letter outline (vinyl) with an inner counter
     * (anything) renders as a proper donut.
     */
    holes?: FlatPath[];
    color: string;
    /** Only set for acrylic. */
    thicknessMm?: number;
    /**
     * Vinyl only. True → this is a printed full-colour vinyl: the renderers
     * paint the shared face-artwork raster (true colours + gradients) instead
     * of the flat `color`, and the contour stays the cut line (print-&-cut).
     * False/undefined → flat solid-colour cut vinyl (`color`).
     */
    fullColor?: boolean;
    /**
     * Backlight only — glow brightness multiplier for the lit opal behind the
     * cut (`color` is the glow colour). Default 1.
     */
    glowIntensity?: number;
}

/**
 * Standoff piece — a path rendered as an extruded letter mounted with
 * studs at `standoffDistanceMm` in front of the panel face. Pieces
 * carry their own settings so a single sign can mix standoff groups
 * with different thicknesses, distances and colours.
 */
export interface StandoffPiece {
    pathIndex: number;
    path: FlatPath;
    holes?: FlatPath[];
    color: string;
    thicknessMm: number;
    standoffDistanceMm: number;
}

/**
 * Push-through piece — an acrylic letter pressed through the panel
 * face from behind. Production reality:
 *   1. Panel face is cut at the OUTWARD keyline (a simple letter-
 *      shaped hole, no counter), `keylineOffsetMm` larger than the
 *      letter outline. This gives the press-fit shoulder.
 *   2. The acrylic itself is cut as TWO separate pieces per letter:
 *      the outer outline, AND each inner counter (R / O / A counter).
 *      Both go on the insert page of the production PDF as separate
 *      closed contours.
 *   3. Both pieces are bonded to a backing board in their original
 *      positions (the counter sits inside the outer ring with zero
 *      gap), the backing assembly is pressed into the panel from
 *      behind. Outside the panel hole, both pieces are visible — the
 *      letter optically reads correctly because the counter sits in
 *      the hole next to the outer piece.
 *
 * `holes` is a list of counter paths (in flat-development coords).
 * Carrying them separately from `path` is what lets the renderer
 * draw two SEPARATE extruded shapes (outer + counter) rather than
 * a compound-with-hole, which is the correct production semantics.
 */
export interface PushThroughPiece {
    pathIndex: number;
    path: FlatPath;
    holes?: FlatPath[];
    color: string;
    thicknessMm: number;
    keylineOffsetMm: number;
    protrusionMm: number;
}

/**
 * Extra-face piece — a decorative metal face (brass / stainless / …) laminated
 * over a letter. Same outline + counters (`holes`) as the underlying cut /
 * push-through / backlit letter, cut from sheet metal. Flat cut geometry, so
 * it nests exactly like an acrylic face piece (one material per nest).
 *
 * `frontZMm` is where the face's FRONT surface sits in the 3D scene: a push-
 * through letter stands proud of the panel, so its brass face sits at the
 * letter's protrusion; a flat aperture/backlit cut sits just on the panel
 * face. The cutter ignores it — it's a render-only hint.
 */
export interface ExtraFacePiece {
    pathIndex: number;
    path: FlatPath;
    holes?: FlatPath[];
    material: FaceMaterial;
    /** sRGB preview hex for the 3D face + cut-sheet swatch. */
    color: string;
    thicknessMm: number;
    /** Z (mm) of the face's front surface, for the 3D scene only. */
    frontZMm: number;
}

/**
 * High-contrast palette used to outline material groups on the flat
 * canvas. Each group gets the colour at `index % palette.length`, so
 * the operator can tell groups apart at a glance regardless of the
 * material colour they ship with.
 */
export const GROUP_HIGHLIGHT_PALETTE = [
    '#0ea5e9', // sky
    '#22c55e', // green
    '#a855f7', // purple
    '#f59e0b', // amber
    '#ec4899', // pink
    '#14b8a6', // teal
    '#eab308', // yellow
    '#6366f1', // indigo
] as const;
