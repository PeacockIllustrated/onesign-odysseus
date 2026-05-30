import { describe, it, expect } from 'vitest';
import {
    luminanceField,
    boxBlur,
    otsuThreshold,
    marchingSquares,
    simplifyLoops,
    polygonArea,
    traceToSvg,
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
    for (let y = y0; y < y1; y++)
        for (let x = x0; x < x1; x++) {
            const i = (y * w + x) * 4;
            rgba[i] = 0;
            rgba[i + 1] = 0;
            rgba[i + 2] = 0;
            rgba[i + 3] = 255;
        }
}

describe('luminanceField', () => {
    it('maps dark→low, light→high', () => {
        const w = 2;
        const h = 1;
        const rgba = new Uint8ClampedArray(w * h * 4);
        rgba.set([0, 0, 0, 255], 0); // black
        rgba.set([255, 255, 255, 255], 4); // white
        const f = luminanceField(rgba, w, h);
        expect(f[0]).toBeLessThan(10);
        expect(f[1]).toBeGreaterThan(245);
    });

    it('composites transparent pixels over the background', () => {
        const w = 1;
        const h = 1;
        const rgba = new Uint8ClampedArray([0, 0, 0, 0]); // transparent black
        // default trace (bg white) → transparent reads as light/outside
        expect(luminanceField(rgba, w, h, false)[0]).toBeGreaterThan(245);
        // inverted trace (bg black) → transparent reads as dark/outside
        expect(luminanceField(rgba, w, h, true)[0]).toBeLessThan(10);
    });
});

describe('otsuThreshold', () => {
    it('lands between two brightness populations', () => {
        const f = new Float32Array(200);
        f.fill(30, 0, 100);
        f.fill(220, 100, 200);
        const t = otsuThreshold(f);
        expect(t).toBeGreaterThan(30);
        expect(t).toBeLessThan(220);
    });
});

describe('boxBlur', () => {
    it('softens a hard step and preserves the mean', () => {
        const w = 4;
        const h = 1;
        const f = new Float32Array([0, 0, 255, 255]);
        const b = boxBlur(f, w, h, 1);
        // the values straddling the step move toward the middle
        expect(b[1]).toBeGreaterThan(0);
        expect(b[2]).toBeLessThan(255);
    });
});

describe('marchingSquares', () => {
    it('traces a filled square as one closed loop', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8);
        const field = luminanceField(rgba, w, h);
        const loops = marchingSquares(field, w, h, 128);
        expect(loops.length).toBe(1);
        const area = Math.abs(polygonArea(loops[0]));
        expect(area).toBeGreaterThanOrEqual(12);
        expect(area).toBeLessThanOrEqual(22);
    });

    it('traces a donut as two loops of opposite winding', () => {
        const w = 16;
        const h = 16;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 3, 3, 13, 13); // 10×10 outer
        // punch a 4×4 white hole
        for (let y = 6; y < 10; y++)
            for (let x = 6; x < 10; x++) {
                const i = (y * w + x) * 4;
                rgba[i] = rgba[i + 1] = rgba[i + 2] = 255;
            }
        const field = luminanceField(rgba, w, h);
        const loops = marchingSquares(field, w, h, 128);
        expect(loops.length).toBe(2);
        const areas = loops.map(polygonArea);
        expect(Math.sign(areas[0])).not.toBe(Math.sign(areas[1]));
    });

    it('closes shapes that touch the image border', () => {
        const w = 10;
        const h = 10;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 0, 0, 4, 4); // flush to top-left corner
        const field = luminanceField(rgba, w, h);
        const loops = marchingSquares(field, w, h, 128);
        expect(loops.length).toBe(1);
        expect(Math.abs(polygonArea(loops[0]))).toBeGreaterThan(8);
    });
});

describe('simplifyLoops', () => {
    it('drops specks below the minimum area', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8); // real shape
        fillBlack(rgba, w, 0, 0, 1, 1); // 1px speck
        const field = luminanceField(rgba, w, h);
        const raw = marchingSquares(field, w, h, 128);
        const kept = simplifyLoops(raw, { minAreaPx: 4 });
        expect(kept.length).toBe(1);
    });
});

describe('traceToSvg', () => {
    it('keeps a square faceted (no curves) and reports the threshold', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8);
        const res = traceToSvg(rgba, w, h, {
            threshold: 128,
            blurRadius: 0,
            minAreaPx: 1,
        });
        expect(res).not.toBeNull();
        expect(res!.loopCount).toBe(1);
        expect(res!.threshold).toBe(128);
        expect(res!.svg).toContain(' L ');
        expect(res!.svg).not.toContain(' C ');
    });

    it('emits bezier curves for a round shape', () => {
        const w = 44;
        const h = 44;
        const rgba = whiteImage(w, h);
        const cx = 22;
        const cy = 22;
        const radius = 15;
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
        expect(res!.svg).toContain(' C ');
    });

    it('auto-picks a threshold when none is given', () => {
        const w = 12;
        const h = 12;
        const rgba = whiteImage(w, h);
        fillBlack(rgba, w, 4, 4, 8, 8);
        const res = traceToSvg(rgba, w, h, { blurRadius: 0, minAreaPx: 1 });
        expect(res).not.toBeNull();
        expect(res!.threshold).toBeGreaterThan(0);
        expect(res!.threshold).toBeLessThan(255);
    });

    it('returns null for a blank image', () => {
        const w = 8;
        const h = 8;
        expect(traceToSvg(whiteImage(w, h), w, h)).toBeNull();
    });
});
