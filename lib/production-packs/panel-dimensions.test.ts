import { describe, it, expect } from 'vitest';
import { panelDimensionBreakdown } from './panel-dimensions';

const base = {
    faceWmm: 2400,
    faceHmm: 600,
    blankWmm: 2520,
    blankHmm: 760,
    returnDepthMm: 80,
    shadowGapMm: 0,
    materialLabel: 'Folded aluminium',
    gaugeMm: 3,
    colour: 'RAL 9005',
};

describe('panelDimensionBreakdown', () => {
    it('labels the face vs the unfolded blank distinctly and clearly', () => {
        const { specRows } = panelDimensionBreakdown(base);
        const face = specRows.find((r) => /face size/i.test(r.label));
        const blank = specRows.find((r) => /unfolded flat blank/i.test(r.label));
        expect(face?.value).toBe('2400 × 600 mm');
        expect(blank?.value).toBe('2520 × 760 mm');
        // The two are never the same row.
        expect(face).not.toBe(blank);
    });

    it('omits the shadow gap when there is none', () => {
        const { specRows, callouts } = panelDimensionBreakdown(base);
        expect(specRows.some((r) => /shadow/i.test(r.label))).toBe(false);
        expect(callouts.some((c) => /shadow gap/i.test(c))).toBe(false);
    });

    it('includes the shadow gap with its edges when present', () => {
        const { specRows, callouts } = panelDimensionBreakdown({
            ...base,
            shadowGapMm: 15,
            shadowGapEdges: { top: true, bottom: true },
        });
        const sg = specRows.find((r) => /shadow-gap lip/i.test(r.label));
        expect(sg?.value).toBe('15 mm');
        expect(sg?.label).toMatch(/top & bottom/);
        expect(callouts.some((c) => /15 mm lip folded in/i.test(c))).toBe(true);
    });

    it('explains each dimension in plain language', () => {
        const { callouts } = panelDimensionBreakdown(base);
        expect(callouts.some((c) => /visible front/i.test(c))).toBe(true);
        expect(callouts.some((c) => /cut flat from sheet/i.test(c))).toBe(true);
        expect(callouts.some((c) => /off the wall|deep box/i.test(c))).toBe(true);
    });

    it('shows the bend deduction (half the gauge) per fold', () => {
        const { specRows, callouts } = panelDimensionBreakdown({ ...base, gaugeMm: 3 });
        const bend = specRows.find((r) => /bend deduction/i.test(r.label));
        expect(bend?.value).toBe('1.5 mm'); // half of 3mm, no trailing zeros
        expect(callouts.some((c) => /each 90° fold takes 1.5 mm/i.test(c))).toBe(true);
    });

    it('shows the flat face (after deductions) when provided', () => {
        const { specRows, callouts } = panelDimensionBreakdown({
            ...base,
            faceFlatWmm: 2400,
            faceFlatHmm: 597,
        });
        const flat = specRows.find((r) => /flat face/i.test(r.label));
        expect(flat?.value).toBe('2400 × 597 mm');
        expect(callouts.some((c) => /develops to 2400 × 597 mm flat/i.test(c))).toBe(true);
    });

    it('drops the colour row when no finish is given', () => {
        const { specRows } = panelDimensionBreakdown({ ...base, colour: '' });
        expect(specRows.some((r) => r.label === 'Colour')).toBe(false);
    });
});
