/**
 * Sign calculator — price book and job shapes (panel_letters_v2).
 *
 * The calculator began as Mak's standalone HTML pricing tool. Its maths is
 * kept; what changed on the way into Odysseus is everything that let it go
 * wrong quietly (see the audit in the PR that added this):
 *
 *  - Money is whole pence everywhere, never decimal pounds.
 *  - Everything a sign points at in the price book is pointed at by a stable
 *    `id`, not by its display name — renaming a labour rate or a finish no
 *    longer orphans the hours or the selection on existing jobs.
 *  - Every number a person types is non-negative, enforced by the schema.
 *  - Settings parse key by key with defaults, so a price book saved by an
 *    older version picks up any setting added since instead of losing it.
 *
 * The price book is one JSON document, versioned in `calculator_price_books`
 * (migration 079) — every save is a new immutable version, so a priced job
 * can always say exactly which prices it used.
 */

import { z } from 'zod';

const pence = z.number().int().min(0);
const nonNeg = z.number().min(0);
const id = z.string().min(1).max(60);

// ---------------------------------------------------------------------------
// Price book
// ---------------------------------------------------------------------------

export const SheetSchema = z.object({
    id,
    material: z.string().min(1, 'every sheet needs a material name').max(80),
    w: z.number().positive('sheet width must be above 0'),
    h: z.number().positive('sheet height must be above 0'),
    price_pence: pence,
    /** Panel sheets are tray materials; aperture sheets are opal/face materials. */
    use: z.enum(['panel', 'aperture']),
    active: z.boolean(),
});

export const PanelFinishSchema = z.object({
    id,
    name: z.string().min(1).max(80),
    cost_per_m2_pence: pence,
});

export const LabourRateSchema = z.object({
    id,
    name: z.string().min(1).max(80),
    /** Sell rate per hour — charged as-is, not marked up again. */
    rate_pence: pence,
    /** Joins add their allowance to this operation's hours. */
    is_fabrication: z.boolean().default(false),
});

export const LetterFinishSchema = z.object({
    id,
    name: z.string().min(1).max(80),
    /** SELL price per letter at each height band (markup already in). */
    prices_pence: z.array(pence),
});

export const LetterTypeSchema = z.object({
    id,
    name: z.string().min(1).max(80),
    finishes: z.array(LetterFinishSchema),
});

export const TransformerSchema = z.object({
    id,
    name: z.string().min(1).max(40),
    max_leds: z.number().int().positive('a transformer must drive at least one LED'),
    price_pence: pence,
});

export const HeightPolicyEnum = z.enum(['roundup', 'nearest', 'block']);
export const CuttingPriorityEnum = z.enum(['joins', 'cost']);
export const SheetSharingEnum = z.enum(['batch', 'per_sign']);

/**
 * Every key has its own default, so `parse` fills in anything an older saved
 * book lacks rather than the whole block being replaced (audit finding 15).
 */
export const SettingsSchema = z.object({
    /** Markup on materials at cost: panel, finish, aperture, its LEDs, transformers. */
    markup_pct: nonNeg.default(60),
    vat_pct: nonNeg.default(20),
    /** One aperture LED per grid cell. */
    aperture_led_grid_mm: z.number().positive().default(200),
    aperture_led_unit_cost_pence: pence.default(29),
    /** Fabrication hours added per join, panel or aperture. */
    joint_allowance_hrs: nonNeg.default(1.5),
    height_policy: HeightPolicyEnum.default('roundup'),
    cutting_priority: CuttingPriorityEnum.default('joins'),
    /**
     * How a quantity of the same sign buys sheet. `batch` nests the whole run
     * onto shared sheets; `per_sign` charges each sign its own sheet(s), which
     * is what the original tool did and over-charged small multiples.
     */
    sheet_sharing: SheetSharingEnum.default('batch'),
});

export const PriceBookSchema = z.object({
    /** Letter-height bands in mm, strictly ascending. Every price row follows them. */
    heights: z.array(z.number().positive()).min(1),
    sheets: z.array(SheetSchema),
    panel_finishes: z.array(PanelFinishSchema),
    labour: z.array(LabourRateSchema),
    letter_types: z.array(LetterTypeSchema),
    illumination: z.object({
        leds_per_letter: z.array(z.number().int().min(0)),
        /** SELL price per lit letter at each band (LED + material markup already in). */
        price_per_letter_pence: z.array(pence),
    }),
    transformers: z.array(TransformerSchema),
    settings: SettingsSchema.default(() => SettingsSchema.parse({})),
});

export type Sheet = z.infer<typeof SheetSchema>;
export type PanelFinish = z.infer<typeof PanelFinishSchema>;
export type LabourRate = z.infer<typeof LabourRateSchema>;
export type LetterFinish = z.infer<typeof LetterFinishSchema>;
export type LetterType = z.infer<typeof LetterTypeSchema>;
export type Transformer = z.infer<typeof TransformerSchema>;
export type CalcSettings = z.infer<typeof SettingsSchema>;
export type PriceBook = z.infer<typeof PriceBookSchema>;

// ---------------------------------------------------------------------------
// Job
// ---------------------------------------------------------------------------

export const LetterSetSchema = z.object({
    type_id: z.string(),
    finish_id: z.string(),
    height_mm: nonNeg,
    qty: z.number().int().min(0),
    illuminated: z.boolean(),
});

export const CalcSignSchema = z.object({
    id,
    name: z.string().max(120),
    qty: z.number().int().min(1),
    panel: z.object({
        material: z.string(),
        width_mm: nonNeg,
        height_mm: nonNeg,
        /** Return depth, positive, added to both sides of the flat development. */
        returns_mm: nonNeg,
        finish_id: z.string(),
        /** Fix the sheet (by sheet id) rather than letting the plan choose. */
        sheet_id: z.string().nullable(),
    }),
    aperture: z.object({
        on: z.boolean(),
        material: z.string(),
        width_mm: nonNeg,
        height_mm: nonNeg,
    }),
    letter_sets: z.array(LetterSetSchema).max(12),
    /** Hours PER SIGN, keyed by labour rate id. Multiplied by quantity. */
    hours: z.record(z.string(), nonNeg),
    /** 'auto' picks the cheapest type; otherwise a transformer id. */
    transformer: z.string(),
    /** Overrides the book's materials markup for this sign; null = book default. */
    materials_markup_pct: nonNeg.nullable(),
    /** Discount on the whole sign — materials, letters and labour alike. */
    discount_pct: z.number().min(0).max(100),
});

export const ExtraSchema = z.object({
    id,
    description: z.string().max(200),
    qty: nonNeg,
    unit_cost_pence: pence,
    /** Run the line through the materials markup; off = already at sell price. */
    markup: z.boolean(),
});

export const CalcJobSchema = z.object({
    signs: z.array(CalcSignSchema).max(50),
    extras: z.array(ExtraSchema).max(50),
});

export type LetterSet = z.infer<typeof LetterSetSchema>;
export type CalcSign = z.infer<typeof CalcSignSchema>;
export type Extra = z.infer<typeof ExtraSchema>;
export type CalcJob = z.infer<typeof CalcJobSchema>;

// ---------------------------------------------------------------------------
// Persistence rows (migration 079)
// ---------------------------------------------------------------------------

export interface PriceBookVersion {
    id: string | null;
    /** 0 means the built-in defaults: nothing has been saved yet. */
    version: number;
    book: PriceBook;
    note: string | null;
    created_at: string | null;
    created_by_email: string | null;
}

export interface CalculatorJobRow {
    id: string;
    reference: string;
    title: string;
    client_name: string | null;
    org_id: string | null;
    job: CalcJob;
    price_book_version: number;
    net_pence: number;
    gross_pence: number;
    quote_id: string | null;
    created_at: string;
    updated_at: string;
}

export interface CalculatorJobSummary {
    id: string;
    reference: string;
    title: string;
    client_name: string | null;
    net_pence: number;
    quote_id: string | null;
    quote_number: string | null;
    updated_at: string;
}
