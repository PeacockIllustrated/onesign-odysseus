import { describe, it, expect } from 'vitest';
import { computeVectorise, type VectoriseParams } from './vectorise-run';

const base: VectoriseParams = {
    mode: 'silhouette',
    smoothing: 40,
    minAreaPx: 1,
    threshold: 128,
    invert: false,
    blurRadius: 0,
    maxColors: 6,
};

function blackSquare(w: number, h: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(w * h * 4);
    rgba.fill(255);
    for (let y = 4; y < 8; y++)
        for (let x = 4; x < 8; x++) {
            const i = (y * w + x) * 4;
            rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
        }
    return rgba;
}

function twoTone(w: number, h: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            const left = x < w / 2;
            rgba[i] = left ? 230 : 20;
            rgba[i + 1] = 20;
            rgba[i + 2] = left ? 20 : 230;
            rgba[i + 3] = 255;
        }
    return rgba;
}

describe('computeVectorise', () => {
    it('silhouette → one black layer carrying the threshold', () => {
        const out = computeVectorise(blackSquare(12, 12), 12, 12, base);
        expect(out).not.toBeNull();
        expect(out!.mode).toBe('silhouette');
        expect(out!.colorCount).toBe(1);
        expect(out!.palette).toEqual(['#000000']);
        expect(typeof out!.threshold).toBe('number');
        expect(out!.svg).toContain('<path');
    });

    it('colour → a palette with no threshold', () => {
        const out = computeVectorise(twoTone(16, 16), 16, 16, {
            ...base,
            mode: 'color',
            maxColors: 2,
        });
        expect(out).not.toBeNull();
        expect(out!.mode).toBe('color');
        expect(out!.colorCount).toBe(2);
        expect(out!.palette).toHaveLength(2);
        expect(out!.threshold).toBeNull();
    });

    it('returns null when nothing traces', () => {
        const blank = new Uint8ClampedArray(8 * 8 * 4);
        blank.fill(255); // all white → no dark silhouette
        expect(computeVectorise(blank, 8, 8, base)).toBeNull();
    });
});
