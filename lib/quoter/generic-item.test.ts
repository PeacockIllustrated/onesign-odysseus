// lib/quoter/generic-item.test.ts
// Schema-level tests for GenericQuoteItemInputSchema — added by migration 041.

import { describe, it, expect } from 'vitest';
import {
    GenericQuoteItemInputSchema,
    QuoteSubItemInputSchema,
} from './types';

describe('GenericQuoteItemInputSchema', () => {
    it('accepts a minimal generic item (label + unit price)', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: 'Fitting',
            unit_price_pence: 38000,
        });
        expect(res.success).toBe(true);
    });

    it('accepts a full production-work item with sub-items', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: 'Main fascia panel',
            description: 'folded aluminium with acrylic + vinyl',
            component_type: 'panel',
            is_production_work: true,
            quantity: 1,
            unit_price_pence: 99100,
            discount_percent: 0,
            markup_percent: 10,
            lighting: 'internal led',
            spec_notes: 'RAL 8019 matte',
            sub_items: [
                {
                    name: 'QUEEN BEE letters',
                    material: '5mm rose-gold mirrored acrylic',
                    application_method: 'stuck to face',
                    finish: 'rose gold mirror',
                    width_mm: 1500,
                    height_mm: 280,
                    quantity: 1,
                },
                {
                    name: 'AESTHETICS & ACADEMY strapline',
                    material: 'white gloss vinyl',
                    application_method: 'weeded and applied',
                    quantity: 1,
                },
            ],
        });
        expect(res.success).toBe(true);
    });

    it('rejects empty part_label', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: '',
            unit_price_pence: 100,
        });
        expect(res.success).toBe(false);
    });

    it('rejects missing unit_price_pence', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: 'x',
        });
        expect(res.success).toBe(false);
    });

    it('rejects negative unit_price_pence', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: 'x',
            unit_price_pence: -1,
        });
        expect(res.success).toBe(false);
    });

    it('accepts zero unit_price_pence (free items)', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: 'free sample',
            unit_price_pence: 0,
        });
        expect(res.success).toBe(true);
    });

    it('rejects markup > 100', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: 'x',
            unit_price_pence: 100,
            markup_percent: 150,
        });
        expect(res.success).toBe(false);
    });

    it('rejects sub_items array longer than 20', () => {
        const res = GenericQuoteItemInputSchema.safeParse({
            part_label: 'x',
            unit_price_pence: 100,
            sub_items: Array.from({ length: 21 }, (_, i) => ({ name: `row ${i}` })),
        });
        expect(res.success).toBe(false);
    });
});

describe('QuoteSubItemInputSchema', () => {
    it('accepts an entirely empty row (designer fills in later)', () => {
        const res = QuoteSubItemInputSchema.safeParse({});
        expect(res.success).toBe(true);
    });

    it('rejects negative width', () => {
        const res = QuoteSubItemInputSchema.safeParse({ width_mm: -5 });
        expect(res.success).toBe(false);
    });

    it('rejects zero quantity', () => {
        const res = QuoteSubItemInputSchema.safeParse({ quantity: 0 });
        expect(res.success).toBe(false);
    });

    it('allows null dimensions (TBD in the quote)', () => {
        const res = QuoteSubItemInputSchema.safeParse({
            name: 'A',
            material: 'frosted vinyl',
            width_mm: null,
            height_mm: null,
        });
        expect(res.success).toBe(true);
    });
});
