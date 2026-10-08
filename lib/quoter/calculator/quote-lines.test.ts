import { describe, it, expect } from 'vitest';
import { buildQuoteLines, linesTotalPence } from './quote-lines';
import { defaultPriceBook } from './default-price-book';
import { blankSign, priceJob } from '../engine/panel-letters-v2';
import { GenericQuoteItemInputSchema } from '../types';
import type { CalcJob } from './types';

function job(): CalcJob {
    const b = defaultPriceBook();
    const a = blankSign(b, 1);
    a.qty = 3;
    a.hours = { router: 1.5, fabrication: 3, assembly: 1 };
    a.letter_sets = [{ type_id: 'komacel', finish_id: 'face-fitted', height_mm: 300, qty: 7, illuminated: true }];
    a.aperture = { on: true, material: 'Opal 10mm', width_mm: 900, height_mm: 300 };
    const c = blankSign(b, 2);
    c.hours = { fabrication: 2 };
    c.discount_pct = 7.5;
    return {
        signs: [a, c],
        extras: [
            { id: 'i', description: 'Installation', qty: 1, unit_cost_pence: 45000, markup: false },
            { id: 'h', description: 'Cherry picker', qty: 2.5, unit_cost_pence: 12345, markup: true },
            { id: 'z', description: 'Nothing', qty: 1, unit_cost_pence: 0, markup: false },
        ],
    };
}

describe('calculator job → quote lines', () => {
    const book = defaultPriceBook();
    const priced = priceJob(job(), book);
    const lines = buildQuoteLines(priced, book, 'stamp');

    it('totals exactly what the calculator says, to the penny', () => {
        expect(linesTotalPence(lines)).toBe(priced.net_pence);
    });

    it('makes one production line per sign and a service line per priced extra', () => {
        expect(lines.filter((l) => l.is_production_work).length).toBe(2);
        expect(lines.filter((l) => l.is_production_work === false).length).toBe(2);
    });

    it('sends a fractional extra across as one line at its total', () => {
        const cherry = lines.find((l) => l.part_label === 'Cherry picker')!;
        expect(cherry.quantity).toBe(1);
        expect(cherry.description).toMatch(/2.5 ×/);
    });

    it('carries tray, aperture and letters as artwork sub-items', () => {
        const names = lines[0].sub_items!.map((s) => s.name);
        expect(names).toEqual(['Tray', 'Illuminated aperture', 'Komacel letters, 300mm']);
    });

    it('every line passes the quote item schema', () => {
        for (const l of lines) expect(GenericQuoteItemInputSchema.safeParse(l).success).toBe(true);
    });
});
