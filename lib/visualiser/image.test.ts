import { describe, it, expect } from 'vitest';
import { findContentBounds } from './image';

/** Build a WxH RGBA buffer, fill with bg, then paint a solid rect of fg. */
function makeImage(
    w: number,
    h: number,
    bg: [number, number, number, number],
    rect: { x: number; y: number; w: number; h: number } | null,
    fg: [number, number, number, number] = [0, 0, 0, 255],
): Uint8ClampedArray {
    const data = new Uint8ClampedArray(w * h * 4);
    for (let i = 0; i < w * h; i++) {
        data[i * 4] = bg[0];
        data[i * 4 + 1] = bg[1];
        data[i * 4 + 2] = bg[2];
        data[i * 4 + 3] = bg[3];
    }
    if (rect) {
        for (let y = rect.y; y < rect.y + rect.h; y++) {
            for (let x = rect.x; x < rect.x + rect.w; x++) {
                const i = (y * w + x) * 4;
                data[i] = fg[0];
                data[i + 1] = fg[1];
                data[i + 2] = fg[2];
                data[i + 3] = fg[3];
            }
        }
    }
    return data;
}

const WHITE: [number, number, number, number] = [255, 255, 255, 255];
const TRANSPARENT: [number, number, number, number] = [0, 0, 0, 0];

describe('findContentBounds', () => {
    it('finds a dark rect on a white background', () => {
        const data = makeImage(20, 20, WHITE, { x: 5, y: 6, w: 8, h: 4 });
        expect(findContentBounds(data, 20, 20)).toEqual({
            x: 5,
            y: 6,
            w: 8,
            h: 4,
        });
    });

    it('finds content on a transparent background via alpha', () => {
        const data = makeImage(16, 16, TRANSPARENT, { x: 3, y: 3, w: 6, h: 6 });
        expect(findContentBounds(data, 16, 16)).toEqual({
            x: 3,
            y: 3,
            w: 6,
            h: 6,
        });
    });

    it('returns null for a uniform image (nothing to crop)', () => {
        const data = makeImage(12, 12, WHITE, null);
        expect(findContentBounds(data, 12, 12)).toBeNull();
    });

    it('returns null when content already fills the frame', () => {
        const data = makeImage(10, 10, WHITE, { x: 0, y: 0, w: 10, h: 10 });
        expect(findContentBounds(data, 10, 10)).toBeNull();
    });

    it('ignores faint noise within tolerance of the background', () => {
        // A near-white pixel (within tolerance) must not widen the bounds.
        const data = makeImage(20, 20, WHITE, { x: 8, y: 8, w: 3, h: 3 });
        const i = (2 * 20 + 2) * 4;
        data[i] = 250;
        data[i + 1] = 250;
        data[i + 2] = 250; // distance 15 < tol 28
        expect(findContentBounds(data, 20, 20)).toEqual({
            x: 8,
            y: 8,
            w: 3,
            h: 3,
        });
    });

    it('guards against malformed input', () => {
        expect(findContentBounds(new Uint8ClampedArray(0), 0, 0)).toBeNull();
        expect(
            findContentBounds(new Uint8ClampedArray(4), 10, 10),
        ).toBeNull();
    });
});
