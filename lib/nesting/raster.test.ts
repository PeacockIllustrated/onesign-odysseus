import { describe, expect, it } from 'vitest';
import {
    dilateMask,
    createMask,
    getBit,
    maskPopCount,
    rasterizeRings,
    runsFromMask,
    setBit,
} from './raster';
import type { Ring } from './types';

function square(x: number, y: number, size: number): Ring {
    return [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
    ];
}

describe('rasterizeRings', () => {
    it('fills a full square completely at 1mm resolution', () => {
        const mask = rasterizeRings([square(0, 0, 10)], 10, 10, 1);
        expect(mask.wCells).toBe(10);
        expect(mask.hCells).toBe(10);
        expect(maskPopCount(mask)).toBe(100);
    });

    it('clears hole interiors but keeps hole boundaries (conservative)', () => {
        const mask = rasterizeRings(
            [square(0, 0, 10), square(3, 3, 4)],
            10,
            10,
            1,
        );
        // Hole interior cells (4..6 in both axes) are clear…
        expect(getBit(mask, 5, 5)).toBe(false);
        expect(getBit(mask, 4, 6)).toBe(false);
        // …the hole boundary cells stay marked (cells the outline passes through)…
        expect(getBit(mask, 3, 3)).toBe(true);
        // …and the solid frame is intact.
        expect(getBit(mask, 0, 0)).toBe(true);
        expect(getBit(mask, 9, 9)).toBe(true);
        expect(maskPopCount(mask)).toBe(100 - 9);
    });

    it('treats holes as solid when they are not passed (hole-nesting off)', () => {
        const mask = rasterizeRings([square(0, 0, 10)], 10, 10, 1);
        expect(getBit(mask, 5, 5)).toBe(true);
    });

    it('over-covers rather than under-covers on fractional sizes', () => {
        const mask = rasterizeRings([square(0, 0, 10.4)], 10.4, 10.4, 1);
        expect(mask.wCells).toBe(11);
        // The boundary pass must mark the partial edge cells.
        expect(getBit(mask, 10, 5)).toBe(true);
        expect(getBit(mask, 5, 10)).toBe(true);
    });
});

describe('dilateMask', () => {
    it('grows a single cell into a disc of the right radius', () => {
        const mask = createMask(1, 1);
        setBit(mask, 0, 0);
        const out = dilateMask(mask, 2);
        expect(out.wCells).toBe(5);
        expect(out.hCells).toBe(5);
        // Disc: cells with dx² + dy² ≤ 4 → 13 cells.
        expect(maskPopCount(out)).toBe(13);
        expect(getBit(out, 2, 0)).toBe(true); // straight up
        expect(getBit(out, 0, 0)).toBe(false); // corner, √8 > 2
    });

    it('returns the input untouched for radius 0', () => {
        const mask = createMask(3, 3);
        setBit(mask, 1, 1);
        expect(dilateMask(mask, 0)).toBe(mask);
    });
});

describe('runsFromMask', () => {
    it('extracts half-open runs per row, including word-boundary spans', () => {
        const mask = createMask(70, 2);
        setBit(mask, 2, 0);
        setBit(mask, 3, 0);
        setBit(mask, 4, 0);
        setBit(mask, 7, 0);
        // A run crossing the 32-bit word boundary.
        for (let x = 30; x < 40; x++) setBit(mask, x, 1);
        const rows = runsFromMask(mask);
        expect(rows[0]).toEqual([2, 5, 7, 8]);
        expect(rows[1]).toEqual([30, 40]);
    });

    it('handles full rows', () => {
        const mask = createMask(40, 1);
        for (let x = 0; x < 40; x++) setBit(mask, x, 0);
        expect(runsFromMask(mask)[0]).toEqual([0, 40]);
    });
});
