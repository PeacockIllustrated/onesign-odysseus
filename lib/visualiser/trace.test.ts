import { describe, it, expect } from 'vitest';
import {
    buildMask,
    traceMask,
    traceToSvg,
    polygonArea,
} from './trace';

/** White, fully-opaque RGBA image of size w×h. */
function whiteImage(w: number, h: number): Uint8ClampedArray {
    const rgba = new Uint8ClampedArray(w * h * 4);
    rgba.fill(255);
    return rgba;
}

/** Paint pixels in [x0,x1)×[y0,y1) solid black. */
function fillBlack(
    rgba: Uint8ClampedArray,
    w: number,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
): void {
    for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
            const i = (y * w + x) * 4;
            rgba[i] = 0;
            rgba[i + 1] = 0;
            rgba[i + 2] = 0;
            rgba[i + 3] = 255;
        }
    }
}

describe('buildMask', () => {
    it('marks dark pixels as inside by default', () => {
        const w = 4;
        const h = 4;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 1, 1, 3, 3); // 2×2 dark block
        const mask = buildMask(rgba, w, h);
        const inside = mask.reduce((n, v) => n + v, 0);
        expect(inside).toBe(4);
        expect(mask[1 * w + 1]).toBe(1);
        expect(mask[0]).toBe(0);
    });

    it('inverts to trace the light regions', () => {
        const w = 4;
        const h = 4;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 1, 1, 3, 3);
        const mask = buildMask(rgba, w, h, { invert: true });
        const inside = mask.reduce((n, v) => n + v, 0);
        expect(inside).toBe(w * h - 4); // everything except the dark block
    });

    it('treats transparent pixels as outside', () => {
        const w = 2;
        const h = 1;
        const rgba = new Uint8ClampedArray(w * h * 4);
        // pixel 0: opaque black (inside), pixel 1: transparent black (out)
        rgba.set([0, 0, 0, 255], 0);
        rgba.set([0, 0, 0, 0], 4);
        const mask = buildMask(rgba, w, h);
        expect(mask[0]).toBe(1);
        expect(mask[1]).toBe(0);
    });
});

describe('traceMask', () => {
    it('traces a filled square as one loop with the right area', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8); // 4×4 block → area 16
        const mask = buildMask(rgba, w, h);
        const loops = traceMask(mask, w, h, { minAreaPx: 1 });
        expect(loops.length).toBe(1);
        expect(Math.abs(polygonArea(loops[0]))).toBeGreaterThanOrEqual(14);
        expect(Math.abs(polygonArea(loops[0]))).toBeLessThanOrEqual(18);
        // A square simplifies down to a handful of corners.
        expect(loops[0].length).toBeLessThanOrEqual(6);
    });

    it('traces a donut as two loops of opposite winding', () => {
        const w = 14;
        const h = 14;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 3, 3, 11, 11); // 8×8 outer (area 64)
        // Punch a 3×3 white hole in the middle (area 9). Low smoothing
        // so a small counter survives — large epsilon would (correctly)
        // erase tiny features.
        for (let y = 6; y < 9; y++)
            for (let x = 6; x < 9; x++) {
                const i = (y * w + x) * 4;
                rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
            }
        const mask = buildMask(rgba, w, h);
        const loops = traceMask(mask, w, h, { minAreaPx: 1, smoothing: 0 });
        expect(loops.length).toBe(2);
        const areas = loops.map((l) => polygonArea(l));
        // Outer and hole circulate in opposite directions.
        expect(Math.sign(areas[0])).not.toBe(Math.sign(areas[1]));
        const absAreas = areas.map(Math.abs).sort((a, b) => a - b);
        expect(absAreas[0]).toBeGreaterThanOrEqual(5); // hole ~9
        expect(absAreas[1]).toBeGreaterThanOrEqual(50); // outer ~64
    });

    it('drops specks below the minimum area', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8); // real shape, area 16
        fillBlack(rgba, w, 0, 0, 1, 1); // 1px speck, area 1
        const mask = buildMask(rgba, w, h);
        const loops = traceMask(mask, w, h); // default minAreaPx 24 drops both?
        // area-16 shape is below default 24 too — use a lower threshold to
        // keep the real shape but still drop the speck.
        const kept = traceMask(mask, w, h, { minAreaPx: 4 });
        expect(loops.length).toBe(0);
        expect(kept.length).toBe(1);
    });
});

describe('traceToSvg', () => {
    it('emits an SVG document with a path per loop', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8);
        const res = traceToSvg(rgba, w, h, { minAreaPx: 1 });
        expect(res).not.toBeNull();
        expect(res!.loopCount).toBe(1);
        expect(res!.svg).toContain('<svg');
        expect(res!.svg).toContain('viewBox="0 0 12 12"');
        expect(res!.svg).toContain('<path');
    });

    it('returns null for a blank image', () => {
        const w = 8;
        const h = 8;
        const rgba = whiteImage(w, h); // all white, nothing dark
        expect(traceToSvg(rgba, w, h)).toBeNull();
    });

    it('keeps a square faceted (corners → straight lines, no curves)', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8);
        const res = traceToSvg(rgba, w, h, { minAreaPx: 1 });
        expect(res).not.toBeNull();
        // 90° corners exceed the corner threshold → only straight segs.
        expect(res!.svg).toContain(' L ');
        expect(res!.svg).not.toContain(' C ');
    });

    it('emits bezier curves for a round shape', () => {
        const w = 40;
        const h = 40;
        const rgba = whiteImage(w, h);
        const cx = 20;
        const cy = 20;
        const radius = 14;
        for (let y = 0; y < h; y++)
            for (let x = 0; x < w; x++) {
                const dx = x + 0.5 - cx;
                const dy = y + 0.5 - cy;
                if (dx * dx + dy * dy <= radius * radius) {
                    const i = (y * w + x) * 4;
                    rgba[i] = rgba[i + 1] = rgba[i + 2] = 0;
                }
            }
        const res = traceToSvg(rgba, w, h, { minAreaPx: 4, smoothing: 60 });
        expect(res).not.toBeNull();
        expect(res!.loopCount).toBe(1);
        // A disc's gently-turning vertices flow as curves, not facets.
        expect(res!.svg).toContain(' C ');
    });
});
