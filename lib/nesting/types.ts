/**
 * Acrylic nesting tool — shared types & defaults.
 *
 * The nesting tool takes an outlined-artwork SVG, splits it into individual
 * cut pieces (keeping the counters of D / R / O welded to their parent as
 * islands), and packs the pieces onto acrylic sheets with a configurable
 * minimum gap — the job the studio currently does by hand in Illustrator.
 *
 * Everything is millimetres, SVG-style y-down, sheet origin top-left.
 * All types here are plain data (structured-clone safe) so they can cross
 * the Web Worker boundary unchanged.
 */

export type Pt = [number, number];
export type Ring = Pt[];

/** One flattened contour from the uploaded SVG (mm, y-down). */
export interface NestPath {
    points: Ring;
    closed: boolean;
    /**
     * Stable id of the IMMEDIATE enclosing <g> (named or anonymous). This is
     * the primary grouping key — an Illustrator "group" is a <g>, so the
     * tightest <g> a path sits in is its natural section, even when only an
     * outer layer carries a name.
     */
    groupKey?: string;
    /** The immediate group's own name (Illustrator layer/group name), if it has one. */
    groupLabel?: string;
    /** Ordinal of the source SVG element — fallback grouping for compound paths. */
    sourceIndex: number;
}

export interface ImportedNestSvg {
    paths: NestPath[];
    /** Artwork bounding box in native mm. */
    bbox: { x: number; y: number; w: number; h: number };
    warnings: string[];
}

/**
 * A nestable cut piece: one outer contour plus the hole contours that sit
 * inside it (the islands of D, R, O…). Holes always travel with the piece —
 * they are never separate pieces themselves.
 */
export interface NestPiece {
    id: string;
    /** Display label, e.g. "Piece 4". */
    label: string;
    groupId: string;
    /**
     * When set, the engine packs every piece sharing this id as ONE rigid unit
     * (a "kept together" group), preserving their original relative layout.
     * Unset → the piece nests freely. Set by the client per group toggle.
     */
    clusterId?: string;
    outer: Ring;
    holes: Ring[];
    /** Net material area (outer minus holes), mm². */
    areaMm2: number;
    /** Unrotated bounding box. */
    widthMm: number;
    heightMm: number;
}

export interface PieceGroup {
    id: string;
    /** Display label, e.g. "RETAIL" (from the SVG group) or "Shape 3". */
    label: string;
    pieceIds: string[];
}

export interface NestConfig {
    sheetWidthMm: number;
    sheetHeightMm: number;
    /** Keep-out border from every sheet edge. */
    marginMm: number;
    /** Minimum edge-to-edge clearance between any two pieces. */
    gapMm: number;
    /** 0 = no rotation; otherwise pieces may rotate in multiples of this. */
    rotationStepDeg: 0 | 15 | 30 | 45 | 90;
    /** Allow small pieces to nest inside the cut-out counters of larger ones. */
    allowHoleNesting: boolean;
    /** Raster cell size for the packer. Smaller = tighter + slower. */
    resolutionMm: number;
    /** Hard cap on overflow sheets. */
    maxSheets: number;
}

export const DEFAULT_NEST_CONFIG: NestConfig = {
    sheetWidthMm: 2440,
    sheetHeightMm: 1220,
    marginMm: 10,
    gapMm: 3,
    rotationStepDeg: 15,
    allowHoleNesting: true,
    resolutionMm: 1,
    maxSheets: 10,
};

/** Stock acrylic sheet sizes the shop actually buys. */
export const SHEET_PRESETS: Array<{ label: string; w: number; h: number }> = [
    { label: '2440 × 1220 (8×4ft)', w: 2440, h: 1220 },
    { label: '3050 × 2030', w: 3050, h: 2030 },
    { label: '2030 × 1520', w: 2030, h: 1520 },
    { label: '1220 × 610 (4×2ft)', w: 1220, h: 610 },
];

/**
 * A placed piece. The transform is canonical: rotate the piece's rings by
 * `rotationDeg` about the origin, translate so the rotated bounding box's
 * min corner sits at (0,0) — `transformPieceRings` in geom.ts — then add
 * (xMm, yMm). Engine, canvas and every exporter share that one definition.
 */
export interface Placement {
    pieceId: string;
    sheetIndex: number;
    xMm: number;
    yMm: number;
    rotationDeg: number;
}

export interface SheetStats {
    index: number;
    pieceCount: number;
    /** Net piece area ÷ full sheet area. */
    utilisation: number;
    /** Bounding box of everything placed — drives the off-cut suggestion. */
    usedWidthMm: number;
    usedHeightMm: number;
}

export interface NestSolution {
    placements: Placement[];
    sheets: SheetStats[];
    /** Pieces that cannot fit on an empty sheet in any allowed rotation. */
    unplacedPieceIds: string[];
    /** Improvement iteration this solution was found at (0 = first greedy). */
    iteration: number;
    /** Lower is better; comparable only within one config + piece set. */
    score: number;
}

/** Engine progress events, yielded by the generator and relayed by the worker. */
export type NestProgress =
    | { type: 'solution'; solution: NestSolution }
    | { type: 'progress'; iteration: number; totalIterations: number };

export interface NestRequest {
    type: 'nest';
    pieces: NestPiece[];
    config: NestConfig;
    iterations: number;
    seed: number;
}

export type NestWorkerRequest = NestRequest | { type: 'stop' };

export type NestWorkerResponse =
    | { type: 'solution'; solution: NestSolution }
    | { type: 'progress'; iteration: number; totalIterations: number }
    | { type: 'done' }
    | { type: 'error'; message: string };

// =============================================================================
// SAVED DESIGNS (DB-backed — table nesting_designs, migration 064)
// =============================================================================

/** The restorable state of a saved nest (everything but the SVG, which is its
 *  own column). Stored as the row's `config_json`. */
export interface NestingDesignConfig {
    config: NestConfig;
    /** Artwork-width calibration override, or null to use the SVG's own size. */
    widthCalMm: number | null;
    /** Original upload filename, for display + export naming. */
    fileName: string | null;
    /** Group ids the operator marked "keep together" (packed as one unit). */
    keptGroupIds?: string[];
    /**
     * Display name of the source built-up-letter job, when this nest was
     * created by "Send to nester" (denormalised so the banner needs no join).
     * The authoritative link is the `source_job_id` column.
     */
    sourceJobName?: string;
    /**
     * Display name of the source panel-visualiser design, when this nest was
     * created by "Send metal faces to nester" (extra-face flow, migration 068).
     * Authoritative link is the `source_design_id` column.
     */
    sourceDesignName?: string;
}

/** Lightweight list item (no SVG / config payload) for the saved-nests rail. */
export interface NestingDesignSummary {
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
}

/** Full saved-design row, fetched on load. */
export interface NestingDesignRow extends NestingDesignSummary {
    svg_source: string;
    config_json: NestingDesignConfig;
    created_by: string | null;
    /** Origin tag, e.g. 'letter_returns' | 'panel_extra_face' — only set for
     *  tool-generated nests. */
    source_kind?: string | null;
    /** FK to the built-up-letter job that produced this nest (migration 065). */
    source_job_id?: string | null;
    /** FK to the panel-visualiser design that produced this nest, for the
     *  extra-face flow (migration 068). */
    source_design_id?: string | null;
}
