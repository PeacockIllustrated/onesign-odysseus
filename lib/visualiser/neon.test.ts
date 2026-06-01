import { describe, it, expect } from 'vitest';
import {
    pathLengthMm,
    measureNeon,
    totalLengthMm,
    colourBreakdown,
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

describe('colourBreakdown', () => {
    const run = (
        stroke: string | undefined,
        s: number,
    ): FlatPath & { stroke?: string } => ({
        closed: true,
        stroke,
        points: [
            [0, 0],
            [s, 0],
            [s, s],
            [0, s],
        ],
    });

    it('groups runs by colour and totals each, longest first', () => {
        const els = measureNeon([
            run('#ff0000', 50), // 200mm red
            run('#00ff00', 100), // 400mm green
            run('#ff0000', 50), // 200mm red
        ]);
        const bd = colourBreakdown(els);
        expect(bd).toHaveLength(2);
        // Green (400mm) sorts before red (2×200=400)… tie — assert contents.
        const red = bd.find((b) => b.color === '#ff0000')!;
        const green = bd.find((b) => b.color === '#00ff00')!;
        expect(red.runs).toBe(2);
        expect(red.lengthMm).toBeCloseTo(400, 6);
        expect(green.runs).toBe(1);
        expect(green.lengthMm).toBeCloseTo(400, 6);
    });

    it('is case-insensitive on the colour key', () => {
        const els = measureNeon([run('#FF0000', 50), run('#ff0000', 50)]);
        expect(colourBreakdown(els)).toHaveLength(1);
    });

    it('buckets uncoloured runs together', () => {
        const els = measureNeon([run(undefined, 50), run(undefined, 50)]);
        const bd = colourBreakdown(els);
        expect(bd).toHaveLength(1);
        expect(bd[0].color).toBeUndefined();
        expect(bd[0].runs).toBe(2);
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
