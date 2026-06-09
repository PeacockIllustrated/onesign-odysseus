import { describe, it, expect } from 'vitest';
import {
    pathLengthMm,
    measureNeon,
    totalLengthMm,
    colourBreakdown,
    parseCssColor,
    colourKey,
    transformerCount,
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

describe('parseCssColor', () => {
    it('parses 6- and 3-digit hex', () => {
        expect(parseCssColor('#ff2d95')).toEqual([255, 45, 149]);
        expect(parseCssColor('#f00')).toEqual([255, 0, 0]);
        expect(parseCssColor('00ff00')).toEqual([0, 255, 0]); // no leading #
    });
    it('parses rgb() with numbers and percentages', () => {
        expect(parseCssColor('rgb(255,0,0)')).toEqual([255, 0, 0]);
        expect(parseCssColor('rgb(100%, 0%, 0%)')).toEqual([255, 0, 0]);
        expect(parseCssColor('rgba(0,128,255,0.5)')).toEqual([0, 128, 255]);
    });
    it('clamps out-of-range channels', () => {
        expect(parseCssColor('rgb(300,-5,0)')).toEqual([255, 0, 0]);
    });
    it('resolves common named colours', () => {
        expect(parseCssColor('red')).toEqual([255, 0, 0]);
        expect(parseCssColor('Cyan')).toEqual([0, 255, 255]);
    });
    it('returns null for unresolvable / none / gradients', () => {
        expect(parseCssColor(undefined)).toBeNull();
        expect(parseCssColor('none')).toBeNull();
        expect(parseCssColor('url(#grad)')).toBeNull();
        expect(parseCssColor('chartreuse')).toBeNull(); // not in the basic table
    });
});

describe('colourKey + breakdown canonicalisation', () => {
    it('collapses equivalent colour notations to one key', () => {
        expect(colourKey('#f00')).toBe(colourKey('#FF0000'));
        expect(colourKey('rgb(255,0,0)')).toBe(colourKey('#ff0000'));
        expect(colourKey('red')).toBe('#ff0000');
    });
    it('groups #f00 / #ff0000 / rgb(255,0,0) as one order line', () => {
        const run = (stroke: string): FlatPath & { stroke?: string } => ({
            closed: true,
            stroke,
            points: [
                [0, 0],
                [50, 0],
                [50, 50],
                [0, 50],
            ],
        });
        const els = measureNeon([
            run('#f00'),
            run('#ff0000'),
            run('rgb(255,0,0)'),
        ]);
        const bd = colourBreakdown(els);
        expect(bd).toHaveLength(1);
        expect(bd[0].runs).toBe(3);
    });
});

describe('transformerCount', () => {
    it('is zero with no neon', () => {
        expect(transformerCount(0)).toBe(0);
    });
    it('one transformer up to the per-transformer limit', () => {
        expect(transformerCount(5000)).toBe(1); // 5 m
        expect(transformerCount(10000)).toBe(1); // exactly 10 m
    });
    it('adds another transformer past each limit', () => {
        expect(transformerCount(10001)).toBe(2); // just over 10 m
        expect(transformerCount(25000)).toBe(3); // 25 m → 3
    });
    it('respects a custom metres-per-transformer', () => {
        expect(transformerCount(25000, 5)).toBe(5); // 25 m at 5 m each
        expect(transformerCount(9000, 0)).toBe(1); // bad input falls back to default 10 m
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
