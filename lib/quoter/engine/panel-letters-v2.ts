/**
 * Panel Letters V2 — the sign calculator's pricing engine.
 *
 * The maths is Mak's (the standalone calculator he built from the pricing
 * spreadsheet), which fixed two long-standing faults v1 still carries: sheets
 * are planned as a real cut (strips stacked down a sheet, long runs joined end
 * to end) rather than a grid count, and apertures are placed by dimension
 * rather than divided by area. On the way in, every route the audit found
 * going wrong quietly was closed:
 *
 *  - Whole pence throughout; every money line is rounded once, and the totals
 *    are sums of the rounded lines, so a quote never disagrees with itself.
 *  - A quantity of one sign shares sheet (`sheet_sharing: 'batch'`), and small
 *    panels pack along the sheet as well as down it.
 *  - References into the price book are ids. A reference that no longer
 *    resolves is an ERROR on the sign, never a silent £0.
 *  - Nothing here throws on a sparse price book: empty finishes or transformer
 *    lists report what is missing instead of crashing the page.
 *  - Aperture joins add fabrication time, like panel joins.
 *
 * Pure and DOM-free: the calculator page, the server action that turns a job
 * into a quote, and the Vitest suite all call the same functions.
 */

import type {
    CalcJob,
    CalcSign,
    Extra,
    LetterSet,
    PriceBook,
    Sheet,
} from '../calculator/types';
import { PriceBookSchema } from '../calculator/types';

// ===========================================================================
// Money and words
// ===========================================================================

export const formatPence = (pence: number): string =>
    (pence < 0 ? '-' : '') +
    '£' +
    (Math.abs(pence) / 100).toLocaleString('en-GB', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });

const mm = (n: number) => Math.round(n).toLocaleString('en-GB');
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export const newId = () => Math.random().toString(36).slice(2, 10);

// ===========================================================================
// Cutting plans
// ===========================================================================

export interface NestPlan {
    /** Sheets bought for the whole count being nested. */
    sheets: number;
    /** Pieces ONE panel is cut into. */
    pieces: number;
    /** Joins in ONE panel. */
    joins: number;
    /** Length of each piece when a run is split (evenly, never a sliver). */
    piece_len: number;
    strip_h: number;
    /** Piece slots on one sheet. */
    per_sheet: number;
    run: number;
    sheet_w: number;
    sheet_h: number;
    /** Bigger than a sheet both ways — gridded, needs a human check. */
    fallback: boolean;
}

/**
 * Every way `count` panels of w × h can come off sheets of sw × sh.
 *
 * A panel is cut as strips: a run L at height H. Several strips stack down a
 * sheet; a short panel also packs along it, which is what lets ten small signs
 * share one sheet. A run longer than the sheet is split into equal pieces and
 * joined — 3100 becomes 2 × 1550, not 3000 plus a 100mm sliver. Both panel and
 * both sheet orientations are tried; the caller ranks them.
 */
export function nestPlans(w: number, h: number, sw: number, sh: number, count = 1): NestPlan[] {
    const out: NestPlan[] = [];
    if (!(w > 0 && h > 0 && sw > 0 && sh > 0 && count > 0)) return out;

    for (const [L, H] of [
        [w, h],
        [h, w],
    ]) {
        for (const [SL, SH] of [
            [sw, sh],
            [sh, sw],
        ]) {
            const rows = Math.floor(SH / H);
            if (rows < 1) continue;
            const pieces = L <= SL ? 1 : Math.ceil(L / SL);
            const pieceLen = L / pieces;
            const perRow = Math.max(1, Math.floor(SL / pieceLen + 1e-9));
            const slots = rows * perRow;
            out.push({
                sheets: Math.ceil((pieces * count) / slots),
                pieces,
                joins: pieces - 1,
                piece_len: pieceLen,
                strip_h: H,
                per_sheet: slots,
                run: L,
                sheet_w: sw,
                sheet_h: sh,
                fallback: false,
            });
        }
    }

    if (!out.length) {
        const a = Math.ceil(w / sw) * Math.ceil(h / sh);
        const b = Math.ceil(w / sh) * Math.ceil(h / sw);
        const pieces = Math.min(a, b);
        out.push({
            sheets: pieces * count,
            pieces,
            joins: pieces - 1,
            piece_len: Math.min(w, sw),
            strip_h: Math.min(h, sh),
            per_sheet: 1,
            run: w,
            sheet_w: sw,
            sheet_h: sh,
            fallback: true,
        });
    }
    return out;
}

export function planWords(n: NestPlan, count: number): string {
    const of = `${mm(n.sheet_w)} × ${mm(n.sheet_h)} sheet`;
    if (n.fallback) return `too large to strip cleanly — gridded into ${plural(n.sheets, 'sheet')}`;
    const fit = count > 1 ? ` · ${n.per_sheet} per sheet · ${plural(n.sheets, 'sheet')} for ${count}` : '';
    if (n.pieces === 1) {
        return `one piece, ${mm(n.run)} × ${mm(n.strip_h)}mm, from a ${of}${fit}`;
    }
    return `${n.pieces} pieces of ${mm(n.piece_len)} × ${mm(n.strip_h)}mm joined end to end · ${plural(n.joins, 'join')}${
        count > 1 ? fit : ` · ${plural(n.sheets, 'sheet')}`
    }`;
}

// ===========================================================================
// Letter heights
// ===========================================================================

export interface Band {
    i: number;
    band: number | null;
    exact: boolean;
    over: boolean;
}

/** Resolve a letter height onto a priced band. */
export function resolveBand(height: number, heights: number[], policy: PriceBook['settings']['height_policy']): Band {
    if (!heights.length) return { i: -1, band: null, exact: false, over: false };
    const exact = heights.indexOf(height);
    if (exact !== -1) return { i: exact, band: height, exact: true, over: false };
    const max = heights[heights.length - 1];
    if (height > max) return { i: heights.length - 1, band: max, exact: false, over: true };
    if (policy === 'block') return { i: -1, band: null, exact: false, over: false };
    if (policy === 'nearest') {
        let best = 0;
        let d = Infinity;
        heights.forEach((v, i) => {
            const dd = Math.abs(v - height);
            if (dd < d) {
                d = dd;
                best = i;
            }
        });
        return { i: best, band: heights[best], exact: false, over: false };
    }
    const i = heights.findIndex((v) => v > height);
    return { i, band: heights[i], exact: false, over: false };
}

/** Linear extrapolation above the top band. */
export const overshootFactor = (height: number, heights: number[]) => {
    const max = heights[heights.length - 1];
    return max && height > max ? height / max : 1;
};

// ===========================================================================
// Price book checks
// ===========================================================================

/**
 * Everything wrong with a price book, in words. An empty list means it is safe
 * to save and to price from. The editor refuses to save while this has
 * anything in it — which is what stops "delete every finish" from taking the
 * calculator down for everyone (audit findings 6 and 7).
 */
export function validatePriceBook(input: unknown): string[] {
    const parsed = PriceBookSchema.safeParse(input);
    if (!parsed.success) {
        return parsed.error.issues.map((i) => `${i.path.join(' › ') || 'price book'}: ${i.message}`);
    }
    const b = parsed.data;
    const problems: string[] = [];

    b.heights.forEach((h, i) => {
        if (i > 0 && h <= b.heights[i - 1]) problems.push(`Letter heights must go up in order — ${h}mm follows ${b.heights[i - 1]}mm.`);
    });
    const n = b.heights.length;

    if (!b.sheets.some((s) => s.use === 'panel' && s.active)) problems.push('Keep at least one active panel sheet.');
    if (!b.panel_finishes.length) problems.push('Keep at least one panel finish (a "None" row prices unfinished trays).');
    if (!b.transformers.length) problems.push('Keep at least one transformer, or lit letters cannot be priced.');
    if (!b.labour.length) problems.push('Keep at least one labour rate.');
    if (!b.letter_types.length) problems.push('Keep at least one letter type.');

    for (const t of b.letter_types) {
        if (!t.finishes.length) problems.push(`${t.name} has no finishes — add one or remove the type.`);
        for (const f of t.finishes) {
            if (f.prices_pence.length !== n) problems.push(`${t.name} ${f.name} has ${f.prices_pence.length} prices for ${n} heights.`);
        }
    }
    if (b.illumination.leds_per_letter.length !== n || b.illumination.price_per_letter_pence.length !== n) {
        problems.push(`Illumination needs one LED count and one price for each of the ${n} heights.`);
    }

    const dupes = (label: string, ids: string[]) => {
        const seen = new Set<string>();
        for (const x of ids) {
            if (seen.has(x)) problems.push(`Two ${label} share the id "${x}".`);
            seen.add(x);
        }
    };
    dupes('sheets', b.sheets.map((s) => s.id));
    dupes('finishes', b.panel_finishes.map((s) => s.id));
    dupes('labour rates', b.labour.map((s) => s.id));
    dupes('letter types', b.letter_types.map((s) => s.id));
    dupes('transformers', b.transformers.map((s) => s.id));
    b.letter_types.forEach((t) => dupes(`${t.name} finishes`, t.finishes.map((f) => f.id)));

    return problems;
}

/** Parse a stored book, filling any setting it predates with the default. */
export function parsePriceBook(input: unknown): PriceBook | null {
    const r = PriceBookSchema.safeParse(input);
    return r.success ? r.data : null;
}

// ===========================================================================
// Keeping a sign honest against the book
// ===========================================================================

export const panelMaterials = (b: PriceBook) => [
    ...new Set(b.sheets.filter((s) => s.use === 'panel' && s.active).map((s) => s.material)),
];
export const apertureMaterials = (b: PriceBook) => [
    ...new Set(b.sheets.filter((s) => s.use === 'aperture' && s.active).map((s) => s.material)),
];

/**
 * Re-point anything on a sign that no longer exists in the book.
 *
 * This is the fix for the dropdown that lied: change a letter set from
 * Fabricated to Komacel and the old finish ("Powder coated") does not exist
 * there, so the browser showed the first option while the sign still held the
 * old one and priced the letters at £0. Running every sign through this after
 * each edit means what the dropdown shows is what the sign holds. Each change
 * is reported, so the page can say what it moved rather than doing it quietly.
 */
export function normaliseSign(sign: CalcSign, b: PriceBook): { sign: CalcSign; notes: string[] } {
    const notes: string[] = [];
    const s: CalcSign = structuredClone(sign);

    const mats = panelMaterials(b);
    if (mats.length && !mats.includes(s.panel.material)) {
        notes.push(`${s.panel.material || 'The panel material'} is no longer in the price book — switched to ${mats[0]}.`);
        s.panel.material = mats[0];
    }
    if (b.panel_finishes.length && !b.panel_finishes.some((f) => f.id === s.panel.finish_id)) {
        s.panel.finish_id = b.panel_finishes[0].id;
    }
    if (
        s.panel.sheet_id &&
        !b.sheets.some((x) => x.id === s.panel.sheet_id && x.active && x.use === 'panel' && x.material === s.panel.material)
    ) {
        notes.push('The fixed sheet size is not available for this material — the cutting plan is choosing again.');
        s.panel.sheet_id = null;
    }

    const apMats = apertureMaterials(b);
    if (apMats.length && !apMats.includes(s.aperture.material)) s.aperture.material = apMats[0];

    s.letter_sets = s.letter_sets.map((set) => {
        const next = { ...set };
        let type = b.letter_types.find((t) => t.id === next.type_id);
        if (!type && b.letter_types.length) {
            type = b.letter_types[0];
            next.type_id = type.id;
        }
        if (type && !type.finishes.some((f) => f.id === next.finish_id) && type.finishes.length) {
            const was = next.finish_id;
            next.finish_id = type.finishes[0].id;
            if (was && set.type_id === next.type_id) {
                notes.push(`That finish isn't offered on ${type.name} — switched to ${type.finishes[0].name}.`);
            }
        }
        return next;
    });

    if (s.transformer !== 'auto' && !b.transformers.some((t) => t.id === s.transformer)) {
        s.transformer = 'auto';
    }
    return { sign: s, notes };
}

export function blankSign(b: PriceBook, n: number): CalcSign {
    const type = b.letter_types[0];
    const finish = type?.finishes.find((f) => /powder/i.test(f.name)) ?? type?.finishes[0];
    return normaliseSign(
        {
            id: newId(),
            name: `Sign ${n}`,
            qty: 1,
            panel: {
                material: panelMaterials(b)[0] ?? '',
                width_mm: 1750,
                height_mm: 750,
                returns_mm: 50,
                finish_id: b.panel_finishes.find((f) => /powder/i.test(f.name))?.id ?? b.panel_finishes[0]?.id ?? '',
                sheet_id: null,
            },
            aperture: { on: false, material: apertureMaterials(b)[0] ?? '', width_mm: 0, height_mm: 0 },
            letter_sets: [
                { type_id: type?.id ?? '', finish_id: finish?.id ?? '', height_mm: 500, qty: 0, illuminated: false },
            ],
            hours: Object.fromEntries(b.labour.map((l) => [l.id, 0])),
            transformer: 'auto',
            materials_markup_pct: null,
            discount_pct: 0,
        },
        b
    ).sign;
}

export function blankLetterSet(b: PriceBook): LetterSet {
    const type = b.letter_types[0];
    return {
        type_id: type?.id ?? '',
        finish_id: type?.finishes[0]?.id ?? '',
        height_mm: 500,
        qty: 0,
        illuminated: false,
    };
}

export const blankJob = (b: PriceBook): CalcJob => ({ signs: [blankSign(b, 1)], extras: [] });

// ===========================================================================
// Pricing a sign
// ===========================================================================

export type TraceGroup = 'Panel' | 'Aperture' | 'Letters' | 'Illumination' | 'Labour' | 'Total';

export interface TraceLine {
    group: TraceGroup;
    label: string;
    work: string;
    /** Pence for the whole quantity, or null for an explanatory line. */
    value: number | null;
    sub?: boolean;
    total?: boolean;
}

export interface SignResult {
    /** Problems that left part of the sign unpriced. Show these loudly. */
    errors: string[];
    warnings: string[];
    trace: TraceLine[];
    qty: number;

    dev_w_mm: number;
    dev_h_mm: number;
    dev_area_m2: number;
    sheet_label: string;
    sheets: number;
    sheet_price_pence: number;
    panel_joins: number;
    aperture_joins: number;
    joint_hours: number;
    sheet_fixed: boolean;
    letter_count: number;
    total_leds: number;
    transformer_count: number;
    transformer_name: string;

    /** All money below is for the whole quantity, in pence. */
    panel_pence: number;
    finish_pence: number;
    aperture_pence: number;
    aperture_led_pence: number;
    transformer_pence: number;
    materials_pence: number;
    markup_pct: number;
    markup_pence: number;
    letters_pence: number;
    illumination_pence: number;
    labour_pence: number;
    subtotal_pence: number;
    discount_pence: number;
    /** Each, after discount — what the quote line carries. */
    unit_pence: number;
    /** unit × qty, so the quote line and the calculator always agree. */
    total_pence: number;
}

interface Scored {
    sheet: Sheet;
    plan: NestPlan;
    cost: number;
    all: number;
    waste: number;
}

function rankPlans(
    candidates: Sheet[],
    w: number,
    h: number,
    count: number,
    perSign: boolean,
    qty: number,
    joinCost: number,
    priority: 'joins' | 'cost'
): Scored[] {
    const scored: Scored[] = [];
    for (const s of candidates) {
        for (const n of nestPlans(w, h, s.w, s.h, count)) {
            const sheets = perSign ? n.sheets * qty : n.sheets;
            const plan = { ...n, sheets };
            const cost = sheets * s.price_pence;
            scored.push({
                sheet: s,
                plan,
                cost,
                all: cost + n.joins * qty * joinCost,
                waste: (sheets * s.w * s.h) / 1e6 - ((w * h) / 1e6) * qty,
            });
        }
    }
    scored.sort(
        priority === 'cost'
            ? (a, b) => a.all - b.all || a.plan.joins - b.plan.joins || a.plan.sheets - b.plan.sheets || a.waste - b.waste
            : (a, b) => a.plan.joins - b.plan.joins || a.all - b.all || a.plan.sheets - b.plan.sheets || a.waste - b.waste
    );
    return scored;
}

export function priceSign(sign: CalcSign, b: PriceBook): SignResult {
    const S = b.settings;
    const trace: TraceLine[] = [];
    const errors: string[] = [];
    const warnings: string[] = [];
    const g = (group: TraceGroup, label: string, work: string, value: number | null, opts: Partial<TraceLine> = {}) =>
        trace.push({ group, label, work, value, ...opts });

    const qty = Math.max(1, Math.floor(sign.qty || 1));
    const each = qty > 1 ? ` × ${qty} off` : '';
    const pos = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
    const markupPct = sign.materials_markup_pct ?? S.markup_pct;
    const perSign = S.sheet_sharing === 'per_sign';
    const count = perSign ? 1 : qty;

    const fabRate = b.labour.find((l) => l.is_fabrication);
    const joinCost = Math.round(S.joint_allowance_hrs * (fabRate?.rate_pence ?? 0));

    // --- panel --------------------------------------------------------------
    const faceW = pos(sign.panel.width_mm);
    const faceH = pos(sign.panel.height_mm);
    const ret = pos(sign.panel.returns_mm);
    const devW = faceW + 2 * ret;
    const devH = faceH + 2 * ret;
    const devArea = (devW / 1000) * (devH / 1000);
    const hasPanel = faceW > 0 && faceH > 0;

    let panelPence = 0;
    let sheets = 0;
    let panelJoins = 0;
    let sheetLabel = '—';
    let sheetPrice = 0;
    let sheetFixed = false;

    if (!hasPanel) {
        warnings.push('No panel size entered — this sign is priced without a tray.');
    } else {
        g('Panel', 'Face size', `${mm(faceW)} × ${mm(faceH)}mm`, null);
        g('Panel', 'Flat development', `${mm(faceW)} + 2 × ${mm(ret)} = ${mm(devW)}mm · ${mm(faceH)} + 2 × ${mm(ret)} = ${mm(devH)}mm`, null);
        g('Panel', 'Material area', `${(devW / 1000).toFixed(3)} × ${(devH / 1000).toFixed(3)} = ${devArea.toFixed(4)} m²${each}`, null);

        const candidates = b.sheets.filter((s) => s.active && s.use === 'panel' && s.material === sign.panel.material);
        if (!candidates.length) {
            errors.push(`No active sheet sizes for "${sign.panel.material}" — the tray is not priced. Add one in the price book.`);
        } else {
            let scored = rankPlans(candidates, devW, devH, count, perSign, qty, joinCost, S.cutting_priority);
            if (sign.panel.sheet_id) {
                const only = scored.filter((x) => x.sheet.id === sign.panel.sheet_id);
                if (only.length) {
                    scored = only.concat(scored.filter((x) => !only.includes(x)));
                    sheetFixed = true;
                } else {
                    warnings.push('The fixed sheet size is not available for this material, so the plan chose one.');
                }
            }
            const c = scored[0];
            sheets = c.plan.sheets;
            panelJoins = c.plan.joins;
            panelPence = c.cost;
            sheetLabel = `${mm(c.sheet.w)} × ${mm(c.sheet.h)}`;
            sheetPrice = c.sheet.price_pence;

            g('Panel', 'Sheet', `${sheetLabel}mm @ ${formatPence(c.sheet.price_pence)}${sheetFixed ? ' · fixed by you' : ''}`, null);
            g('Panel', 'Cutting plan', planWords(c.plan, count), null);
            g('Panel', 'Panel material', `${plural(sheets, 'sheet')} × ${formatPence(c.sheet.price_pence)}${perSign && qty > 1 ? ' (a sheet per sign)' : ''}`, panelPence);
            if (panelJoins > 0) {
                g('Panel', 'Plan chosen on',
                    `${S.cutting_priority === 'joins' ? 'fewest joins first, then cost' : 'lowest total cost'} — ${formatPence(c.cost)} of sheet + ${plural(panelJoins * qty, 'join')} at ${formatPence(joinCost)} of fabrication = ${formatPence(c.all)}`,
                    null, { sub: true });
            }
            const seen = new Set([`${c.sheet.id}|${c.plan.sheets}|${c.plan.joins}`]);
            const alts: string[] = [];
            for (const x of scored.slice(1)) {
                const k = `${x.sheet.id}|${x.plan.sheets}|${x.plan.joins}`;
                if (seen.has(k)) continue;
                seen.add(k);
                if (alts.length < 4) alts.push(`${mm(x.sheet.w)}×${mm(x.sheet.h)}: ${x.plan.sheets} sh + ${x.plan.joins} joins = ${formatPence(x.all)}`);
            }
            if (alts.length) g('Panel', 'Plans rejected', alts.join('   ·   '), null, { sub: true });
            if (c.waste > 0.0005) g('Panel', 'Offcut', `${c.waste.toFixed(3)} m² of sheet unused`, null, { sub: true });
            if (c.plan.fallback) warnings.push('This panel is bigger than a sheet in both directions, so it has been gridded rather than stripped. Check the cutting plan by hand.');
        }
    }

    let finishPence = 0;
    if (hasPanel) {
        const fin = b.panel_finishes.find((f) => f.id === sign.panel.finish_id);
        if (!fin) {
            errors.push('Pick a panel finish — the one on this sign is no longer in the price book.');
        } else {
            finishPence = Math.round(devArea * qty * fin.cost_per_m2_pence);
            g('Panel', 'Finish', `${fin.name} — ${(devArea * qty).toFixed(4)} m² × ${formatPence(fin.cost_per_m2_pence)}/m²`, finishPence);
        }
    }

    // --- aperture -----------------------------------------------------------
    let apPence = 0;
    let apLedPence = 0;
    let apLeds = 0;
    let apJoins = 0;
    if (sign.aperture.on) {
        const aw = pos(sign.aperture.width_mm);
        const ah = pos(sign.aperture.height_mm);
        if (!(aw > 0 && ah > 0)) {
            errors.push('Enter the aperture size, or untick the aperture.');
        } else {
            const candidates = b.sheets.filter((s) => s.active && s.use === 'aperture' && s.material === sign.aperture.material);
            g('Aperture', 'Opening', `${mm(aw)} × ${mm(ah)}mm`, null);
            if (!candidates.length) {
                errors.push(`No active aperture sheet for "${sign.aperture.material}".`);
            } else {
                const c = rankPlans(candidates, aw, ah, count, perSign, qty, joinCost, 'joins')[0];
                apPence = c.cost;
                apJoins = c.plan.joins;
                g('Aperture', 'Cutting plan', planWords(c.plan, count), null);
                g('Aperture', 'Aperture material', `${plural(c.plan.sheets, 'sheet')} × ${formatPence(c.sheet.price_pence)}`, apPence);
            }
            if (aw > faceW || ah > faceH) warnings.push('The aperture is larger than the sign face.');

            const grid = S.aperture_led_grid_mm;
            apLeds = Math.ceil(aw / grid) * Math.ceil(ah / grid);
            apLedPence = apLeds * qty * S.aperture_led_unit_cost_pence;
            g('Aperture', 'Aperture LEDs',
                `ceil(${mm(aw)}/${grid}) × ceil(${mm(ah)}/${grid}) = ${apLeds} LEDs × ${formatPence(S.aperture_led_unit_cost_pence)}${each} — marked up with materials`,
                apLedPence);
        }
    }

    // --- letters ------------------------------------------------------------
    let lettersPence = 0;
    let illumPence = 0;
    let letterLeds = 0;
    let letterCount = 0;
    let tallest = 0;
    let runEstimate = 0;

    sign.letter_sets.forEach((set, idx) => {
        const n = Math.max(0, Math.floor(set.qty || 0));
        if (!n) return;
        const tag = `Set ${idx + 1}`;
        const type = b.letter_types.find((t) => t.id === set.type_id);
        const fin = type?.finishes.find((f) => f.id === set.finish_id);
        if (!type || !fin) {
            errors.push(`${tag}: pick a letter type and finish — ${type ? 'that finish is not offered on ' + type.name : 'that letter type is not in the price book'}. Not priced.`);
            return;
        }
        const h = pos(set.height_mm);
        if (!h) {
            errors.push(`${tag}: enter a letter height. Not priced.`);
            return;
        }
        const band = resolveBand(h, b.heights, S.height_policy);
        if (band.i === -1) {
            errors.push(`${tag}: ${h}mm is not a priced height and the price book is set to refuse in-between heights.`);
            return;
        }
        const f = overshootFactor(h, b.heights);
        const base = fin.prices_pence[band.i] ?? 0;
        if (!base) warnings.push(`${tag}: ${type.name} ${fin.name} at ${band.band}mm is £0.00 in the price book.`);
        const line = Math.round(base * f * n * qty);
        lettersPence += line;
        letterCount += n * qty;
        tallest = Math.max(tallest, h);
        runEstimate += n * h * 0.62;

        g('Letters', `${tag} — ${type.name}, ${fin.name.toLowerCase()}`,
            `${n} × ${mm(h)}mm @ ${formatPence(base)}${f !== 1 ? ` × ${f.toFixed(3)} extrapolated` : ''}${!band.exact && !band.over ? ` (priced at the ${band.band}mm band)` : ''}${each}`,
            line);
        if (!band.exact && !band.over) warnings.push(`${tag}: ${h}mm sits between bands — priced at ${band.band}mm.`);
        if (band.over) warnings.push(`${tag}: ${h}mm is above the largest priced band (${band.band}mm). Cost extrapolated — check it by hand.`);

        if (set.illuminated) {
            const per = (b.illumination.price_per_letter_pence[band.i] ?? 0) * f;
            const leds = Math.round((b.illumination.leds_per_letter[band.i] ?? 0) * f);
            const il = Math.round(per * n * qty);
            illumPence += il;
            letterLeds += leds * n;
            g('Illumination', `${tag} — lit letters`, `${n} × ${formatPence(Math.round(per))} · ${leds} LEDs each${each}`, il);
        }
    });

    if (hasPanel && tallest > faceH) warnings.push(`The tallest letter (${tallest}mm) is taller than the sign face (${faceH}mm).`);
    if (hasPanel && runEstimate > faceW) warnings.push(`The letters need roughly ${Math.round(runEstimate)}mm of width and the face is ${faceW}mm. Rough estimate — check the artwork.`);

    // --- transformers -------------------------------------------------------
    const totalLeds = letterLeds + apLeds; // per sign
    let trCount = 0;
    let trPence = 0;
    let trName = '—';
    if (totalLeds > 0) {
        if (!b.transformers.length) {
            errors.push('This sign has LEDs but the price book has no transformers. Add one.');
        } else {
            const options = b.transformers
                .map((t) => {
                    const c = Math.ceil(totalLeds / t.max_leds);
                    return { t, c, cost: c * t.price_pence };
                })
                .sort((a, z) => a.cost - z.cost);
            let pick = options[0];
            if (sign.transformer !== 'auto') {
                const fixed = options.find((x) => x.t.id === sign.transformer);
                if (fixed) pick = fixed;
                else warnings.push('The chosen transformer is no longer in the price book — using the cheapest.');
            }
            trCount = pick.c;
            trName = pick.t.name;
            trPence = pick.cost * qty;
            g('Illumination', 'LEDs per sign', `${letterLeds} in letters + ${apLeds} in the aperture = ${totalLeds}`, null);
            g('Illumination', 'Transformers', `${trName} drives ${pick.t.max_leds} — ceil(${totalLeds}/${pick.t.max_leds}) = ${trCount} × ${formatPence(pick.t.price_pence)}${each}`, trPence);
            if (sign.transformer === 'auto' && options.length > 1) {
                g('Illumination', 'Also considered', options.slice(1).map((x) => `${x.t.name}: ${x.c} = ${formatPence(x.cost)}`).join('   ·   '), null, { sub: true });
            }
        }
    }

    // --- labour -------------------------------------------------------------
    const joints = panelJoins + apJoins;
    const jointHours = joints * S.joint_allowance_hrs;
    if (joints > 0) {
        warnings.push(`${plural(joints, 'join')} per sign — ${jointHours.toFixed(2)} fabrication hrs added automatically.`);
        if (!fabRate) warnings.push('Joins need a labour rate marked as fabrication in the price book — none is, so they are not charged.');
    }
    let labourPence = 0;
    for (const l of b.labour) {
        let hrs = pos(sign.hours[l.id] ?? 0);
        const auto = l === fabRate ? jointHours : 0;
        hrs += auto;
        if (!hrs) continue;
        const c = Math.round(hrs * l.rate_pence * qty);
        labourPence += c;
        g('Labour', l.name,
            `${hrs.toFixed(2)} hrs × ${formatPence(l.rate_pence)}/hr${auto ? ` (incl. ${auto.toFixed(2)} hrs for ${plural(joints, 'join')})` : ''}${each}`,
            c);
    }
    const orphaned = Object.entries(sign.hours).filter(([k, v]) => v > 0 && !b.labour.some((l) => l.id === k));
    if (orphaned.length) {
        warnings.push(`${plural(orphaned.length, 'labour line')} on this sign point at a rate that has been removed from the price book — those hours are not charged.`);
    }
    if (!labourPence) warnings.push('No production hours entered — labour is £0.00.');

    // --- totals -------------------------------------------------------------
    const materials = panelPence + finishPence + apPence + apLedPence + trPence;
    const markup = Math.round((materials * markupPct) / 100);
    const subtotal = materials + markup + lettersPence + illumPence + labourPence;
    const discount = Math.round((subtotal * Math.min(100, pos(sign.discount_pct))) / 100);
    const unit = Math.round((subtotal - discount) / qty);
    const total = unit * qty;

    g('Total', 'Materials at cost', 'panel + finish + aperture + its LEDs + transformers', materials, { sub: true });
    g('Total', `Materials markup ${markupPct}%`, `${formatPence(materials)} × ${markupPct}%${sign.materials_markup_pct !== null ? ' (set on this sign)' : ''}`, markup);
    g('Total', 'Letters and illumination', 'sell prices from the price book — markup already in', lettersPence + illumPence, { sub: true });
    g('Total', 'Production labour', 'charged at the hourly sell rate', labourPence, { sub: true });
    if (discount) g('Total', `Discount ${sign.discount_pct}%`, `on ${formatPence(subtotal)}`, -discount);
    if (qty > 1) g('Total', 'Each', `${formatPence(subtotal - discount)} ÷ ${qty}, to the penny`, unit, { sub: true });
    g('Total', 'Sign total', qty > 1 ? `${qty} × ${formatPence(unit)}` : '', total, { total: true });

    return {
        errors, warnings, trace, qty,
        dev_w_mm: devW, dev_h_mm: devH, dev_area_m2: devArea,
        sheet_label: sheetLabel, sheets, sheet_price_pence: sheetPrice, sheet_fixed: sheetFixed,
        panel_joins: panelJoins, aperture_joins: apJoins, joint_hours: jointHours,
        letter_count: letterCount, total_leds: totalLeds, transformer_count: trCount, transformer_name: trName,
        panel_pence: panelPence, finish_pence: finishPence, aperture_pence: apPence, aperture_led_pence: apLedPence,
        transformer_pence: trPence, materials_pence: materials, markup_pct: markupPct, markup_pence: markup,
        letters_pence: lettersPence, illumination_pence: illumPence, labour_pence: labourPence,
        subtotal_pence: subtotal, discount_pence: discount, unit_pence: unit, total_pence: total,
    };
}

// ===========================================================================
// Pricing a job
// ===========================================================================

export interface ExtraResult extends Extra {
    /** Unit price the customer sees — after markup when it applies. */
    sell_unit_pence: number;
    line_pence: number;
}

export interface JobResult {
    signs: { sign: CalcSign; r: SignResult }[];
    extras: ExtraResult[];
    signs_pence: number;
    extras_pence: number;
    net_pence: number;
    vat_pence: number;
    gross_pence: number;
    error_count: number;
}

export function priceExtra(e: Extra, b: PriceBook): ExtraResult {
    const unit = Math.max(0, e.unit_cost_pence || 0);
    const sell = e.markup ? Math.round(unit * (1 + b.settings.markup_pct / 100)) : unit;
    return { ...e, sell_unit_pence: sell, line_pence: Math.round(sell * Math.max(0, e.qty || 0)) };
}

export function priceJob(job: CalcJob, b: PriceBook): JobResult {
    const signs = job.signs.map((sign) => ({ sign, r: priceSign(sign, b) }));
    const extras = job.extras.map((e) => priceExtra(e, b));
    const signsPence = signs.reduce((a, x) => a + x.r.total_pence, 0);
    const extrasPence = extras.reduce((a, x) => a + x.line_pence, 0);
    const net = signsPence + extrasPence;
    const vat = Math.round((net * b.settings.vat_pct) / 100);
    return {
        signs,
        extras,
        signs_pence: signsPence,
        extras_pence: extrasPence,
        net_pence: net,
        vat_pence: vat,
        gross_pence: net + vat,
        error_count: signs.reduce((a, x) => a + x.r.errors.length, 0),
    };
}

/** One line of plain-English spec per sign, for the quote and the artwork skeleton. */
export function signSpec(sign: CalcSign, b: PriceBook): string[] {
    const spec: string[] = [];
    const finish = b.panel_finishes.find((f) => f.id === sign.panel.finish_id);
    if (sign.panel.width_mm > 0 && sign.panel.height_mm > 0) {
        spec.push(
            `${mm(sign.panel.width_mm)} × ${mm(sign.panel.height_mm)}mm ${sign.panel.material.toLowerCase()} tray, ${mm(sign.panel.returns_mm)}mm returns${
                finish && finish.cost_per_m2_pence > 0 ? `, ${finish.name.toLowerCase()}` : ''
            }`
        );
    }
    if (sign.aperture.on && sign.aperture.width_mm > 0) {
        spec.push(`${mm(sign.aperture.width_mm)} × ${mm(sign.aperture.height_mm)}mm ${sign.aperture.material.toLowerCase()} illuminated aperture`);
    }
    for (const set of sign.letter_sets) {
        if (!(set.qty > 0)) continue;
        const type = b.letter_types.find((t) => t.id === set.type_id);
        const fin = type?.finishes.find((f) => f.id === set.finish_id);
        spec.push(`${set.qty} × ${mm(set.height_mm)}mm ${type?.name.toLowerCase() ?? 'letters'} letters, ${fin?.name.toLowerCase() ?? ''}${set.illuminated ? ', illuminated' : ''}`);
    }
    return spec;
}
