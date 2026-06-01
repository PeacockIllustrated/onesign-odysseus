import { describe, it, expect } from 'vitest';
import {
    pathLengthMm,
    measureNeon,
    totalLengthMm,
    formatMm,
    formatM,
} from './neon';
import type { FlatPath } from './types';

describe('pathLengthMm', () => {
    it('sums an open polyline', () => {
        const p: FlatPath = {
            closed: false,
            points: [
                [0, 0],
                [30, 0],
                [30, 40],
            ],
        };
        expect(pathLengthMm(p)).toBeCloseTo(70, 6); // 30 + 40
    });

    it('adds the closing segment for a closed contour', () => {
        // 100×100 square WITHOUT a repeated closing point → perimeter 400.
        const sq: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
            ],
        };
        expect(pathLengthMm(sq)).toBeCloseTo(400, 6);
    });

    it('does not double-count when the closing point is already repeated', () => {
        const sq: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
                [0, 0],
            ],
        };
        expect(pathLengthMm(sq)).toBeCloseTo(400, 6);
    });

    it('open square (no closing segment) is only the three drawn sides', () => {
        const open: FlatPath = {
            closed: false,
            points: [
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
            ],
        };
        expect(pathLengthMm(open)).toBeCloseTo(300, 6);
    });

    it('is zero for a single point', () => {
        expect(pathLengthMm({ closed: false, points: [[5, 5]] })).toBe(0);
    });
});

describe('measureNeon', () => {
    const square = (
        x: number,
        y: number,
        s: number,
    ): FlatPath => ({
        closed: true,
        points: [
            [x, y],
            [x + s, y],
            [x + s, y + s],
            [x, y + s],
        ],
    });

    it('measures + numbers each element in reading order (left to right)', () => {
        const els = measureNeon([square(200, 0, 50), square(0, 0, 50)]);
        expect(els).toHaveLength(2);
        // The left square (x=0) is numbered 1, the right (x=200) is 2.
        expect(els[0].index).toBe(1);
        expect(els[0].centroid[0]).toBeLessThan(els[1].centroid[0]);
        expect(els[0].lengthMm).toBeCloseTo(200, 6);
    });

    it('numbers top row before bottom row', () => {
        // Bottom-left, top-left — top (smaller y) should come first.
        const els = measureNeon([square(0, 500, 50), square(0, 0, 50)]);
        expect(els[0].centroid[1]).toBeLessThan(els[1].centroid[1]);
    });

    it('drops sub-threshold noise paths', () => {
        const tiny: FlatPath = {
            closed: false,
            points: [
                [0, 0],
                [0.2, 0],
            ],
        };
        expect(measureNeon([tiny, square(0, 0, 50)])).toHaveLength(1);
    });

    it('totals every run', () => {
        const els = measureNeon([square(0, 0, 50), square(200, 0, 50)]);
        expect(totalLengthMm(els)).toBeCloseTo(400, 6);
    });
});

describe('formatting', () => {
    it('formats mm with a thousands separator', () => {
        expect(formatMm(1234.6)).toBe('1,235 mm');
    });
    it('formats metres to 2dp', () => {
        expect(formatM(1234)).toBe('1.23 m');
    });
});
