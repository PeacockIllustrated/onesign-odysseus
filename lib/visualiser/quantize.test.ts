import { describe, it, expect } from 'vitest';
import { quantize, rgbToHex, TRANSPARENT } from './quantize';

type Px = [number, number, number, number];
const R: Px = [230, 20, 20, 255];
const B: Px = [20, 20, 230, 255];
const CLEAR: Px = [0, 0, 0, 0];

function rgbaFrom(pixels: Px[]): Uint8ClampedArray {
    const out = new Uint8ClampedArray(pixels.length * 4);
    pixels.forEach((p, i) => out.set(p, i * 4));
    return out;
}

describe('quantize', () => {
    it('separates two distinct colours', () => {
        const { palette, indices } = quantize(rgbaFrom([R, R, B, B]), 4, 1, {
            maxColors: 2,
        });
        expect(palette).toHaveLength(2);
        expect(palette.filter(([r, , b]) => r > 180 && b < 80)).toHaveLength(1);
        expect(palette.filter(([r, , b]) => b > 180 && r < 80)).toHaveLength(1);
        // the two reds share an index, distinct from the blues'.
        expect(indices[0]).toBe(indices[1]);
        expect(indices[2]).toBe(indices[3]);
        expect(indices[0]).not.toBe(indices[2]);
    });

    it('orders the palette by coverage (dominant colour first)', () => {
        // 6 red, 2 blue → k-means sharpens the imbalanced clusters cleanly.
        const { palette, counts } = quantize(
            rgbaFrom([R, R, R, R, R, R, B, B]),
            8,
            1,
            { maxColors: 2 },
        );
        expect(counts[0]).toBe(6);
        expect(palette[0][0]).toBeGreaterThan(180); // red dominant → first layer
        expect(palette[0][2]).toBeLessThan(80);
    });

    it('ignores transparent pixels', () => {
        const { palette, indices } = quantize(
            rgbaFrom([R, CLEAR, B, CLEAR]),
            4,
            1,
            { maxColors: 4 },
        );
        expect(palette).toHaveLength(2);
        expect(indices[1]).toBe(TRANSPARENT);
        expect(indices[3]).toBe(TRANSPARENT);
    });

    it('returns an empty palette for a fully transparent image', () => {
        const res = quantize(rgbaFrom([CLEAR, CLEAR, CLEAR]), 3, 1, {
            maxColors: 4,
        });
        expect(res.palette).toHaveLength(0);
        expect(res.indices.every((v) => v === TRANSPARENT)).toBe(true);
    });

    it('collapses a solid image to one colour, dropping empty centres', () => {
        const { palette, counts } = quantize(rgbaFrom([R, R, R, R]), 4, 1, {
            maxColors: 6,
        });
        expect(palette).toHaveLength(1);
        expect(counts[0]).toBe(4);
    });

    it('rgbToHex pads each channel', () => {
        expect(rgbToHex([0, 0, 0])).toBe('#000000');
        expect(rgbToHex([255, 16, 1])).toBe('#ff1001');
    });
});
