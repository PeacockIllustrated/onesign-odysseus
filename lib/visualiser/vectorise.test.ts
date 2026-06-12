import { describe, it, expect } from 'vitest';
import { vectoriseColor } from './vectorise';

/** Left half red, right half blue, fully opaque. */
function twoTone(w: number, h: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
            const i = (y * w + x) * 4;
            if (x < w / 2) {
                rgba[i] = 230;
                rgba[i + 1] = 20;
                rgba[i + 2] = 20;
            } else {
                rgba[i] = 20;
                rgba[i + 1] = 20;
                rgba[i + 2] = 230;
            }
            rgba[i + 3] = 255;
        }
    return rgba;
}

describe('vectoriseColor', () => {
    it('emits one stacked, evenodd layer per colour', () => {
        const res = vectoriseColor(twoTone(16, 16), 16, 16, {
            maxColors: 2,
            minAreaPx: 1,
        });
        expect(res).not.toBeNull();
        expect(res!.colorCount).toBe(2);
        expect(res!.svg).toContain('fill-rule="evenodd"');
        expect(res!.svg).toContain('viewBox="0 0 16 16"');
        const fills = [...res!.svg.matchAll(/fill="(#[0-9a-f]{6})"/g)].map(
            (m) => m[1],
        );
        expect(new Set(fills).size).toBe(2);
    });

    it('traces a colour counter as a hole (background layer has 2 loops)', () => {
        // Blue field with a small red centre: the blue (dominant) layer wraps
        // the red, so it traces as an outer loop + an inner hole.
        const w = 12;
        const h = 12;
        const rgba = new Uint8ClampedArray(w * h * 4);
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                rgba[i + 3] = 255;
                const inner = x >= 4 && x < 8 && y >= 4 && y < 8;
                rgba[i] = inner ? 230 : 20;
                rgba[i + 1] = 20;
                rgba[i + 2] = inner ? 20 : 230;
            }
        const res = vectoriseColor(rgba, w, h, { maxColors: 2, minAreaPx: 1 });
        expect(res).not.toBeNull();
        expect(res!.colorCount).toBe(2);
        // layers[0] = dominant blue background, with the red counter as a hole.
        expect(res!.layers[0].loopCount).toBeGreaterThanOrEqual(2);
    });

    it('returns null for a fully transparent image', () => {
        const rgba = new Uint8ClampedArray(8 * 8 * 4); // all zero = transparent
        expect(vectoriseColor(rgba, 8, 8, { maxColors: 4 })).toBeNull();
    });
});
