import { describe, it, expect } from 'vitest';
import {
    blankSign,
    nestPlans,
    normaliseSign,
    parsePriceBook,
    priceExtra,
    priceJob,
    priceSign,
    resolveBand,
    validatePriceBook,
} from './panel-letters-v2';
import { defaultPriceBook } from '../calculator/default-price-book';
import { CalcSignSchema, type CalcSign, type PriceBook } from '../calculator/types';

const book = () => defaultPriceBook();

/** Mak's default test sign: 1750 × 750 tray, 50mm returns, powder coated, 4 hrs labour. */
function sign(over: (s: CalcSign) => void = () => {}, b: PriceBook = book()): CalcSign {
    const s = blankSign(b, 1);
    s.hours = { router: 1, fabrication: 2, assembly: 1, vinyl: 0, print: 0 };
    over(s);
    return s;
}

const set = (type_id: string, finish_id: string, height_mm: number, qty: number, illuminated = false) => ({
    type_id,
    finish_id,
    height_mm,
    qty,
    illuminated,
});

describe('parity with the original calculator', () => {
    // Totals from Mak's standalone tool (price book v1.1) for the same signs.
    // v2 rounds each line to the penny, so it may differ by a few pence — never more.
    const cases: [string, (s: CalcSign) => void, number][] = [
        ['default tray', () => {}, 45051],
        ['4100 × 600 tray', (s) => { s.panel.width_mm = 4100; s.panel.height_mm = 600; }, 64518],
        ['lit komacel + acrylic', (s) => {
            s.letter_sets = [set('komacel', 'face-fitted', 300, 8, true), set('acrylic', 'rim-return', 150, 12)];
        }, 163594],
        ['aperture + lit fabricated', (s) => {
            s.aperture = { on: true, material: 'Opal 10mm', width_mm: 1300, height_mm: 500 };
            s.letter_sets = [set('fabricated', 'wet-paint', 450, 6, true)];
        }, 174034],
        ['between bands', (s) => { s.letter_sets = [set('fabricated', 'unfinished', 510, 3)]; }, 76566],
    ];
    for (const [name, mut, expected] of cases) {
        it(name, () => {
            const r = priceSign(sign(mut), book());
            expect(r.errors).toEqual([]);
            expect(Math.abs(r.total_pence - expected)).toBeLessThanOrEqual(3);
        });
    }
});

describe('cutting plans', () => {
    it('strips a long tray down one sheet instead of gridding it', () => {
        // 4100 × 600 with 50mm returns develops to 4200 × 700: one 3000 × 1500
        // sheet, two strips stacked, one join.
        const r = priceSign(sign((s) => { s.panel.width_mm = 4100; s.panel.height_mm = 600; }), book());
        expect(r.sheets).toBe(1);
        expect(r.panel_joins).toBe(1);
        expect(r.sheet_label).toBe('3,000 × 1,500');
    });

    it('splits a run into equal pieces, never a sliver', () => {
        const plan = nestPlans(3100, 1400, 3000, 1500).find((p) => p.pieces === 2)!;
        expect(plan.piece_len).toBe(1550);
    });

    it('packs short panels along the sheet as well as down it', () => {
        // 600 × 400: 4 along a 2440 sheet, 3 down 1220 = 12 per sheet.
        const best = Math.max(...nestPlans(600, 400, 2440, 1220).map((p) => p.per_sheet));
        expect(best).toBe(12);
    });

    it('returns no plans for a zero size rather than a nonsense one', () => {
        expect(nestPlans(0, 0, 2440, 1220)).toEqual([]);
    });
});

describe('audit findings', () => {
    it('01 — changing letter type re-points the finish instead of pricing £0', () => {
        const b = book();
        const s = sign((x) => { x.letter_sets = [set('komacel', 'powder', 500, 8, true)]; });
        // Without repair the stale finish is a loud error, not a silent £0.
        const raw = priceSign(s, b);
        expect(raw.errors.some((e) => /finish/i.test(e))).toBe(true);
        // With repair (what the page does after every edit) it prices.
        const { sign: fixed, notes } = normaliseSign(s, b);
        expect(fixed.letter_sets[0].finish_id).toBe('unfinished');
        expect(notes.length).toBe(1);
        expect(priceSign(fixed, b).letters_pence).toBeGreaterThan(0);
    });

    it('02 — a batch of small signs shares sheet', () => {
        const small = (x: CalcSign) => { x.panel.width_mm = 500; x.panel.height_mm = 300; x.qty = 10; };
        const shared = priceSign(sign(small), book());
        expect(shared.sheets).toBe(1);
        expect(shared.panel_pence).toBe(6100);

        const b = book();
        b.settings.sheet_sharing = 'per_sign';
        const perSign = priceSign(sign(small, b), b);
        expect(perSign.sheets).toBe(10);
        expect(perSign.panel_pence).toBe(61000);
    });

    it('03 — renaming a labour rate keeps the hours', () => {
        const b = book();
        const before = priceSign(sign(), b).labour_pence;
        b.labour[1].name = 'Fab';
        expect(priceSign(sign(() => {}, b), b).labour_pence).toBe(before);
    });

    it('03 — hours on a removed rate are flagged, not dropped silently', () => {
        const b = book();
        b.labour = b.labour.filter((l) => l.id !== 'router');
        const r = priceSign(sign(), b);
        expect(r.warnings.some((w) => /removed from the price book/.test(w))).toBe(true);
    });

    it('04 — negative inputs are refused by the schema', () => {
        const s = sign();
        expect(CalcSignSchema.safeParse({ ...s, panel: { ...s.panel, returns_mm: -50 } }).success).toBe(false);
        expect(CalcSignSchema.safeParse({ ...s, hours: { router: -3 } }).success).toBe(false);
        expect(CalcSignSchema.safeParse({ ...s, letter_sets: [set('fabricated', 'powder', 500, -5)] }).success).toBe(false);
    });

    it('04 — and the engine never prices below zero even if one slips through', () => {
        const r = priceSign(sign((x) => { x.panel.returns_mm = -50; x.hours.router = -3; }), book());
        expect(r.total_pence).toBeGreaterThan(0);
        expect(r.dev_w_mm).toBe(1750);
    });

    it('05 — aperture LEDs are a material, marked up once', () => {
        const r = priceSign(sign((x) => {
            x.aperture = { on: true, material: 'Opal 10mm', width_mm: 1000, height_mm: 400 };
        }), book());
        expect(r.aperture_led_pence).toBe(10 * 29);
        expect(r.markup_pence).toBe(Math.round(r.materials_pence * 0.6));
    });

    it('06 / 07 — a book with no finishes or transformers is refused, and pricing does not throw', () => {
        const b = book();
        b.panel_finishes = [];
        b.transformers = [];
        const problems = validatePriceBook(b);
        expect(problems.some((p) => /finish/i.test(p))).toBe(true);
        expect(problems.some((p) => /transformer/i.test(p))).toBe(true);

        const lit = sign((x) => { x.letter_sets = [set('fabricated', 'powder', 300, 5, true)]; });
        expect(() => priceSign(lit, b)).not.toThrow();
        expect(priceSign(lit, b).errors.length).toBeGreaterThan(0);
    });

    it('08 — an extra quotes its sell price, so each × qty is the line', () => {
        const e = priceExtra({ id: 'x', description: 'Install', qty: 2, unit_cost_pence: 10000, markup: true }, book());
        expect(e.sell_unit_pence).toBe(16000);
        expect(e.line_pence).toBe(e.sell_unit_pence * 2);
    });

    it('12 — discount takes the whole sign, materials markup only materials', () => {
        const base = priceSign(sign(), book());
        const discounted = priceSign(sign((x) => { x.discount_pct = 10; }), book());
        expect(discounted.total_pence).toBe(base.total_pence - Math.round(base.subtotal_pence * 0.1));
    });

    it('14 — an aperture with no size asks for one instead of showing -1 joins', () => {
        const r = priceSign(sign((x) => { x.aperture.on = true; }), book());
        expect(r.errors.some((e) => /aperture size/.test(e))).toBe(true);
        expect(r.aperture_joins).toBe(0);
    });

    it('14 — aperture joins add fabrication time like panel joins', () => {
        const r = priceSign(sign((x) => {
            x.panel.width_mm = 3200; x.panel.height_mm = 600;
            x.aperture = { on: true, material: 'Opal 10mm', width_mm: 3000, height_mm: 500 };
        }), book());
        expect(r.aperture_joins).toBe(1);
        expect(r.joint_hours).toBe((r.panel_joins + 1) * 1.5);
    });

    it('15 — an older book picks up settings added since', () => {
        const b = book() as unknown as Record<string, unknown>;
        b.settings = { markup_pct: 55 };
        const parsed = parsePriceBook(b)!;
        expect(parsed.settings.markup_pct).toBe(55);
        expect(parsed.settings.sheet_sharing).toBe('batch');
        expect(parsed.settings.joint_allowance_hrs).toBe(1.5);
    });

    it('15 — the quote and the calculator always agree to the penny', () => {
        const job = {
            signs: [sign((x) => { x.qty = 3; x.letter_sets = [set('acrylic', 'face-fitted', 250, 7, true)]; })],
            extras: [{ id: 'e', description: 'Fit', qty: 1, unit_cost_pence: 33333, markup: true }],
        };
        const r = priceJob(job, book());
        const s = r.signs[0].r;
        expect(s.total_pence).toBe(s.unit_pence * 3);
        expect(r.net_pence).toBe(s.total_pence + r.extras[0].line_pence);
        expect(r.gross_pence).toBe(r.net_pence + Math.round(r.net_pence * 0.2));
    });
});

describe('letter heights', () => {
    const H = [50, 100, 150];
    it('rounds up by default', () => expect(resolveBand(60, H, 'roundup').band).toBe(100));
    it('can use the nearest band', () => expect(resolveBand(60, H, 'nearest').band).toBe(50));
    it('can refuse in-between heights', () => expect(resolveBand(60, H, 'block').i).toBe(-1));
    it('flags heights above the top band', () => expect(resolveBand(200, H, 'roundup').over).toBe(true));
});

describe('the shipped price book', () => {
    it('is valid', () => expect(validatePriceBook(book())).toEqual([]));
});
