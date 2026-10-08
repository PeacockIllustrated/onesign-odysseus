import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { priceSign, blankSign } from './panel-letters-v2';
import { defaultPriceBook } from '../calculator/default-price-book';
import type { CalcSign } from '../calculator/types';

/**
 * v2 against Mak's original calculator, sign for sign.
 *
 * The audit fixes deliberately change some answers (batches share sheet,
 * aperture joins add fabrication time). Everything else must price the same
 * as the tool Mak built and trusts — so this drives both engines with the
 * same few hundred random signs, with v2 set to Mak's behaviour where the two
 * intentionally differ, and holds the totals to within a few pence (v2 rounds
 * each line to the penny; the original carried fractions of a penny).
 */

const require = createRequire(import.meta.url);
const mak = require('./__fixtures__/mak-calculator-v1.1.cjs');

// Deterministic PRNG, so a failure reproduces.
function rng(seed: number) {
    return () => {
        seed = (seed * 1664525 + 1013904223) % 4294967296;
        return seed / 4294967296;
    };
}

const LABOUR = [
    ['Router', 'router'],
    ['Fabrication', 'fabrication'],
    ['Assembly', 'assembly'],
    ['Vinyl', 'vinyl'],
    ['Digital printing', 'print'],
] as const;
const TYPES: [string, string, [string, string][]][] = [
    ['Fabricated', 'fabricated', [['Unfinished', 'unfinished'], ['Powder coated', 'powder'], ['Wet paint', 'wet-paint']]],
    ['Komacel', 'komacel', [['Unfinished', 'unfinished'], ['Face fitted', 'face-fitted'], ['Rim and return', 'rim-return']]],
    ['Acrylic', 'acrylic', [['Unfinished', 'unfinished'], ['Face fitted', 'face-fitted'], ['Rim and return', 'rim-return']]],
];

describe('parity with the original calculator over random signs', () => {
    const book = defaultPriceBook();
    // Mak's tool charged every sign in a batch its own sheet.
    book.settings.sheet_sharing = 'per_sign';
    // ...and marked aperture LEDs up with the materials (60%), not 300%.
    book.settings.aperture_led_markup_pct = 60;
    const makBook = mak.defaultPriceBook();
    const r = rng(20261008);
    const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)];
    const between = (a: number, b: number, step = 10) => a + Math.round((r() * (b - a)) / step) * step;

    for (let n = 0; n < 400; n++) {
        const w = between(300, 6000);
        const h = between(200, 1400);
        const ret = between(0, 120, 5);
        const qty = 1 + Math.floor(r() * 3);
        const powder = r() > 0.4;
        // Aperture kept within one sheet length: v2 charges aperture joins as
        // fabrication time on purpose, which the original did not.
        const ap = r() > 0.7 ? { w: between(200, 2400), h: between(150, 1100) } : null;
        const sets = Array.from({ length: Math.floor(r() * 3) }, () => {
            const [tName, tId, fins] = pick(TYPES);
            const [fName, fId] = pick(fins);
            return { tName, tId, fName, fId, height: between(50, 1200, 25), qty: Math.floor(r() * 15), lit: r() > 0.5 };
        });
        const hours = LABOUR.map(() => (r() > 0.5 ? Math.round(r() * 16) / 4 : 0));

        const makSign = {
            name: 'S', qty,
            panel: { material: 'Aluminium 2.5mm', width: w, height: h, returns: ret, finish: powder ? 'Powder coating' : 'None', sheetIndex: null },
            aperture: ap ? { on: true, material: 'Opal 10mm', width: ap.w, height: ap.h } : { on: false, material: 'Opal 10mm', width: 0, height: 0 },
            letterSets: sets.map((s) => ({ type: s.tName, finish: s.fName, height: s.height, qty: s.qty, illum: s.lit })),
            hours: Object.fromEntries(LABOUR.map(([name], i) => [name, hours[i]])),
            transformer: 'auto', markupPct: null,
        };

        const ours: CalcSign = blankSign(book, 1);
        ours.qty = qty;
        ours.panel = { material: 'Aluminium 2.5mm', width_mm: w, height_mm: h, returns_mm: ret, finish_id: powder ? 'powder' : 'none', sheet_id: null };
        ours.aperture = ap ? { on: true, material: 'Opal 10mm', width_mm: ap.w, height_mm: ap.h } : { on: false, material: 'Opal 10mm', width_mm: 0, height_mm: 0 };
        ours.letter_sets = sets.map((s) => ({ type_id: s.tId, finish_id: s.fId, height_mm: s.height, qty: s.qty, illuminated: s.lit }));
        ours.hours = Object.fromEntries(LABOUR.map(([, id], i) => [id, hours[i]]));
        // The original quoted zero-hour signs without complaint; v2 makes
        // that an explicit choice. Parity is about the money, so say so.
        ours.no_labour = true;

        it(`sign ${n}: ${w}×${h} r${ret} ×${qty}${ap ? ' +aperture' : ''}, ${sets.length} letter sets`, () => {
            const expected = Math.round(mak.costSign(makSign, makBook).total * 100);
            const got = priceSign(ours, book).total_pence;
            // Mak's letter prices carry fractions of a penny (£63.404); the
            // stored book rounds each to the penny, so a big batch of letters
            // drifts by a few pence. Never more than 0.05% of the sign.
            expect(Math.abs(got - expected)).toBeLessThanOrEqual(Math.max(6 * qty, expected * 0.0005));
        });
    }
});
