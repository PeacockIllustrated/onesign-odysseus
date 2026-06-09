import { describe, it, expect } from 'vitest';
import { splitPanels } from './split';

describe('splitPanels — centred-full-panel rule', () => {
    it('no split when within sheet width', () => {
        const r = splitPanels(2000, 2990);
        expect(r.wasSplit).toBe(false);
        expect(r.sections).toEqual([2000]);
        expect(r.seamXsMm).toEqual([]);
        expect(r.centreIndex).toBe(0);
    });

    it('exactly at the limit is still a single panel', () => {
        const r = splitPanels(2990, 2990);
        expect(r.wasSplit).toBe(false);
        expect(r.sections).toEqual([2990]);
    });

    it('4000mm: full 2990 centre + equal sides', () => {
        const r = splitPanels(4000, 2990);
        expect(r.wasSplit).toBe(true);
        expect(r.sections).toEqual([505, 2990, 505]);
        expect(r.sections[r.centreIndex]).toBe(2990);
        expect(r.seamXsMm).toEqual([505, 3495]);
        // sections sum back to the face width
        expect(r.sections.reduce((a, b) => a + b, 0)).toBe(4000);
    });

    it('very wide sign keeps an odd count and a full centre panel', () => {
        const r = splitPanels(9000, 2990);
        expect(r.wasSplit).toBe(true);
        expect(r.sections.length % 2).toBe(1);
        expect(r.sections[r.centreIndex]).toBe(2990);
        // side panels are equal and within the sheet
        const sides = r.sections.filter((_, i) => i !== r.centreIndex);
        expect(new Set(sides).size).toBe(1);
        expect(Math.max(...r.sections)).toBeLessThanOrEqual(2990);
        expect(r.sections.reduce((a, b) => a + b, 0)).toBeCloseTo(9000, 3);
    });

    it('seam count is sections − 1', () => {
        const r = splitPanels(9000, 2990);
        expect(r.seamXsMm.length).toBe(r.sections.length - 1);
    });

    it('forces odd count when the naive ceil is even', () => {
        // 5000 / 2990 -> ceil 2 (even) -> must become 3 with a centre panel
        const r = splitPanels(5000, 2990);
        expect(r.sections.length).toBe(3);
        expect(r.sections[r.centreIndex]).toBe(2990);
        expect(r.sections).toEqual([1005, 2990, 1005]);
    });

    it('centre override: 4000 mm fascia + 2500 mm centre off-cut', () => {
        const r = splitPanels(4000, 2990, 2500);
        expect(r.wasSplit).toBe(true);
        expect(r.sections).toEqual([750, 2500, 750]);
        expect(r.sections[r.centreIndex]).toBe(2500);
        expect(r.sections.reduce((a, b) => a + b, 0)).toBe(4000);
    });

    it('centre override grows side count when sides would exceed sheet', () => {
        // 9000 mm fascia, 1000 mm centre — sides would be 4000 each at n=3.
        // Bumps to n=5: sides = 2000 each.
        const r = splitPanels(9000, 2990, 1000);
        expect(r.sections.length).toBe(5);
        expect(r.sections[r.centreIndex]).toBe(1000);
        expect(Math.max(...r.sections)).toBeLessThanOrEqual(2990);
        expect(r.sections.reduce((a, b) => a + b, 0)).toBeCloseTo(9000, 3);
    });

    it('centre override is ignored when larger than the sheet limit', () => {
        const r = splitPanels(4000, 2990, 3500);
        // Falls back to the default 2990 centre.
        expect(r.sections).toEqual([505, 2990, 505]);
    });

    it('centre override is ignored when the sign fits one sheet', () => {
        const r = splitPanels(2000, 2990, 1500);
        expect(r.wasSplit).toBe(false);
        expect(r.sections).toEqual([2000]);
    });
});
