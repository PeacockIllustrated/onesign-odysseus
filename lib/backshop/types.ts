import { z } from 'zod';

// =============================================================================
// BACKSHOP SCREEN TYPES
// =============================================================================
//
// The backshop screen is the workshop TV board. A designer pushes a finished
// visualiser design to it; the floor ticks production stages off as the sign
// moves through the shop.
//
// Stages are CONTEXTUAL. Every sign carries the base gates (Designed / Cut /
// Painted / Assembled); a sign also picks up the extra gates that match how
// it's actually built — push-through acrylic, vinyl appliqué, illumination,
// stood-off lettering. The applicable set is frozen onto the item at push time
// (the keys present in its `checks` object ARE its stages), so the board only
// shows what's relevant to each job.

export type BackshopFeature =
    | 'pushThrough'
    | 'vinyl'
    | 'acrylic'
    | 'metalFace'
    | 'illumination'
    | 'standoff'
    | 'bracket';

export interface BackshopStage {
    key: string;
    label: string;
    /** When set, the stage only applies if the design has this feature. */
    feature?: BackshopFeature;
}

/**
 * Ordered production catalog. Featureless stages always apply; the rest only
 * when the pushed design has that construction. Order = rough shop sequence.
 */
export const BACKSHOP_STAGE_CATALOG: BackshopStage[] = [
    { key: 'designed', label: 'Designed' },
    { key: 'cut', label: 'Cut' },
    { key: 'pushthrough', label: 'Push-through', feature: 'pushThrough' },
    { key: 'vinyl', label: 'Vinyl', feature: 'vinyl' },
    // Face-stuck acrylic appliqué (distinct from push-through acrylic) — an
    // applied decoration like vinyl, so it sits alongside it in the sequence.
    { key: 'acrylic', label: 'Acrylic', feature: 'acrylic' },
    { key: 'painted', label: 'Painted' },
    // Brass / stainless / … face laminated onto the (painted) letters.
    { key: 'metalfaces', label: 'Metal faces', feature: 'metalFace' },
    { key: 'illumination', label: 'Illumination', feature: 'illumination' },
    { key: 'standoff', label: 'Stood-off', feature: 'standoff' },
    { key: 'assembled', label: 'Assembled' },
    // Projecting signs only — fit the bought-in wall bracket last.
    { key: 'bracket', label: 'Wall fixing', feature: 'bracket' },
];

/** Which construction features a pushed design has. */
export type BackshopFeatures = Partial<Record<BackshopFeature, boolean>>;

/** Tick state, keyed by stage. The KEYS define which stages the item has. */
export type BackshopChecks = Record<string, boolean>;

export type BackshopStatus = 'queued' | 'in_progress' | 'ready';

/** Stages that apply to a feature set, in catalog order. */
export function stagesForFeatures(f: BackshopFeatures): BackshopStage[] {
    return BACKSHOP_STAGE_CATALOG.filter((s) => !s.feature || f[s.feature]);
}

/** Fresh (all-false) checks for a feature set. */
export function checksForFeatures(f: BackshopFeatures): BackshopChecks {
    const out: BackshopChecks = {};
    for (const s of stagesForFeatures(f)) out[s.key] = false;
    return out;
}

/** The stages an item actually carries, in catalog order. */
export function stagesForChecks(
    checks: BackshopChecks | null | undefined,
): BackshopStage[] {
    if (!checks) return [];
    return BACKSHOP_STAGE_CATALOG.filter((s) => s.key in checks);
}

// Human descriptions of the contextual construction elements — what the sign
// is physically made of / the processes it involves. Keyed by the contextual
// stage keys (base stages are processes, not distinguishing elements).
const ELEMENT_LABELS: Record<string, string> = {
    pushthrough: 'Push-through acrylic',
    vinyl: 'Vinyl appliqué',
    acrylic: 'Acrylic (face-stuck)',
    metalfaces: 'Metal-faced letters',
    illumination: 'Illuminated',
    standoff: 'Stood-off letters',
    bracket: 'Projecting (bracket)',
};

/** The distinguishing elements/processes an item carries, in catalog order. */
export function elementsForChecks(
    checks: BackshopChecks | null | undefined,
): string[] {
    if (!checks) return [];
    return BACKSHOP_STAGE_CATALOG.filter(
        (s) => s.key in checks && ELEMENT_LABELS[s.key],
    ).map((s) => ELEMENT_LABELS[s.key]);
}

/** Coerce a stored value into a plain boolean-valued checks object. */
export function normaliseChecks(
    raw: Record<string, unknown> | null | undefined,
): BackshopChecks {
    const out: BackshopChecks = {};
    if (raw && typeof raw === 'object') {
        for (const [k, v] of Object.entries(raw)) out[k] = !!v;
    }
    return out;
}

/**
 * Board status from the check gates the item carries: nothing ticked = queued,
 * some = in progress, all = ready. An item with no stages reads as queued.
 */
export function backshopStatus(
    checks: BackshopChecks | null | undefined,
): BackshopStatus {
    const keys = checks ? Object.keys(checks) : [];
    if (keys.length === 0) return 'queued';
    const done = keys.filter((k) => checks![k]).length;
    if (done === 0) return 'queued';
    if (done >= keys.length) return 'ready';
    return 'in_progress';
}

/** A row of `public.backshop_items`. */
export interface BackshopItemRow {
    id: string;
    design_id: string | null;
    name: string;
    description: string | null;
    width_mm: number | null;
    height_mm: number | null;
    returns_mm: number | null;
    shadow_gap_mm: number | null;
    thumbnail: string | null;
    pdf_path: string | null;
    checks: BackshopChecks;
    archived: boolean;
    added_by: string | null;
    created_at: string;
    updated_at: string;
}

/** A board item enriched with a short-lived signed reference-PDF URL. */
export interface BackshopItemWithPdf extends BackshopItemRow {
    pdfUrl: string | null;
}

// Data URLs / base64 can be large (a 3D PNG + a multi-page PDF). Cap generously
// but finitely so a runaway payload can't be sent.
const MAX_DATA_URL = 8_000_000; // ~6 MB binary after base64
const MAX_PDF_BASE64 = 20_000_000; // ~15 MB binary after base64

export const AddToBackshopInputSchema = z.object({
    designId: z.string().uuid(),
    name: z.string().min(1).max(200),
    description: z.string().max(500).nullable().optional(),
    widthMm: z.number().nonnegative().nullable().optional(),
    heightMm: z.number().nonnegative().nullable().optional(),
    returnsMm: z.number().nonnegative().nullable().optional(),
    shadowGapMm: z.number().nonnegative().nullable().optional(),
    thumbnailDataUrl: z.string().max(MAX_DATA_URL).nullable().optional(),
    pdfBase64: z.string().max(MAX_PDF_BASE64).nullable().optional(),
    // Construction features → contextual production stages.
    features: z
        .object({
            pushThrough: z.boolean().optional(),
            vinyl: z.boolean().optional(),
            acrylic: z.boolean().optional(),
            metalFace: z.boolean().optional(),
            illumination: z.boolean().optional(),
            standoff: z.boolean().optional(),
            bracket: z.boolean().optional(),
        })
        .optional(),
});
export type AddToBackshopInput = z.infer<typeof AddToBackshopInputSchema>;
