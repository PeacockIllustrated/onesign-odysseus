import { z } from 'zod';

// =============================================================================
// BACKSHOP SCREEN TYPES
// =============================================================================
//
// The backshop screen is the workshop TV board. A designer pushes a finished
// visualiser design to it; the floor ticks production stages off as the sign
// moves through the shop. Stages are a fixed four-gate set — single source of
// truth here so the UI, the checks JSON shape, and the status derivation all
// agree.

export const BACKSHOP_STAGES = [
    { key: 'designed', label: 'Designed' },
    { key: 'cut', label: 'Cut' },
    { key: 'painted', label: 'Painted' },
    { key: 'assembled', label: 'Assembled' },
] as const;

export type BackshopStageKey = (typeof BACKSHOP_STAGES)[number]['key'];

/** Tick state per production stage. */
export type BackshopChecks = Record<BackshopStageKey, boolean>;

/** Default (nothing ticked) — matches the DB column default. */
export const EMPTY_CHECKS: BackshopChecks = {
    designed: false,
    cut: false,
    painted: false,
    assembled: false,
};

export type BackshopStatus = 'queued' | 'in_progress' | 'ready';

/**
 * Derive the board status from the check gates: nothing ticked = queued,
 * some = in progress, all = ready. Tolerates a partial / unknown-shaped
 * `checks` object (only the known stage keys count).
 */
export function backshopStatus(checks: Partial<BackshopChecks> | null | undefined): BackshopStatus {
    const done = BACKSHOP_STAGES.filter((s) => checks?.[s.key]).length;
    if (done === 0) return 'queued';
    if (done >= BACKSHOP_STAGES.length) return 'ready';
    return 'in_progress';
}

/** Normalise an arbitrary stored value into a full BackshopChecks object. */
export function normaliseChecks(
    raw: Partial<BackshopChecks> | null | undefined,
): BackshopChecks {
    return {
        designed: !!raw?.designed,
        cut: !!raw?.cut,
        painted: !!raw?.painted,
        assembled: !!raw?.assembled,
    };
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
});
export type AddToBackshopInput = z.infer<typeof AddToBackshopInputSchema>;
