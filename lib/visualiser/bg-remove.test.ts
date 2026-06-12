import { describe, it, expect } from 'vitest';
import { removeBackground, sampleColor } from './bg-remove';

const BLUE: [number, number, number, number] = [20, 20, 230, 255];
const RED: [number, number, number, number] = [230, 20, 20, 255];

function fill(w: number, h: number, px: [number, number, number, number]) {
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) rgba.set(px, i * 4);
    return rgba;
}
function setPx(
    rgba: Uint8ClampedArray,
    w: number,
    x: number,
    y: number,
    px: [number, number, number, number],
) {
    rgba.set(px, (y * w + x) * 4);
}
const alpha = (rgba: Uint8ClampedArray, w: number, x: number, y: number) =>
    rgba[(y * w + x) * 4 + 3];

/** Blue 5×5 with a red 3×3 centre and a single blue pixel inside it (a counter). */
function blueFrameRedCentre() {
    const w = 5;
    const h = 5;
    const rgba = fill(w, h, BLUE);
    for (let y = 1; y <= 3; y++)
        for (let x = 1; x <= 3; x++) setPx(rgba, w, x, y, RED);
    setPx(rgba, w, 2, 2, BLUE); // blue counter, surrounded by red
    return { rgba, w, h };
}

describe('removeBackground', () => {
    it('contiguous flood clears the surround but keeps an enclosed counter', () => {
        const { rgba, w, h } = blueFrameRedCentre();
        const out = removeBackground(rgba, w, h, {
            color: [20, 20, 230],
            tolerance: 20,
            contiguous: true,
            seed: [0, 0],
        });
        expect(alpha(out, w, 0, 0)).toBe(0); // border frame removed
        expect(alpha(out, w, 2, 2)).toBe(255); // enclosed blue counter survives
        expect(alpha(out, w, 1, 1)).toBe(255); // red untouched
        // input not mutated
        expect(alpha(rgba, w, 0, 0)).toBe(255);
    });

    it('global removal knocks the colour out everywhere (counter too)', () => {
        const { rgba, w, h } = blueFrameRedCentre();
        const out = removeBackground(rgba, w, h, {
            color: [20, 20, 230],
            tolerance: 20,
            contiguous: false,
        });
        expect(alpha(out, w, 0, 0)).toBe(0);
        expect(alpha(out, w, 2, 2)).toBe(0); // enclosed blue cleared globally
        expect(alpha(out, w, 1, 1)).toBe(255); // red kept
    });

    it('tolerance catches near-colour pixels (anti-aliased edges)', () => {
        const w = 3;
        const h = 1;
        const rgba = fill(w, h, RED);
        setPx(rgba, w, 0, 0, [20, 20, 230, 255]); // exact blue
        setPx(rgba, w, 1, 0, [40, 35, 215, 255]); // near blue
        const out = removeBackground(rgba, w, h, {
            color: [20, 20, 230],
            tolerance: 30,
            contiguous: false,
        });
        expect(alpha(out, w, 0, 0)).toBe(0);
        expect(alpha(out, w, 1, 0)).toBe(0); // within tolerance
        expect(alpha(out, w, 2, 0)).toBe(255); // red, far away
    });

    it('contiguous with no seed floods from the border', () => {
        const { rgba, w, h } = blueFrameRedCentre();
        const out = removeBackground(rgba, w, h, {
            color: [20, 20, 230],
            tolerance: 20,
            contiguous: true,
        });
        expect(alpha(out, w, 0, 0)).toBe(0);
        expect(alpha(out, w, 2, 2)).toBe(255); // still enclosed
    });

    it('sampleColor reads a pixel (clamped to bounds)', () => {
        const { rgba, w, h } = blueFrameRedCentre();
        expect(sampleColor(rgba, w, h, 1, 1)).toEqual([230, 20, 20]);
        expect(sampleColor(rgba, w, h, 999, 999)).toEqual([20, 20, 230]);
    });
});
