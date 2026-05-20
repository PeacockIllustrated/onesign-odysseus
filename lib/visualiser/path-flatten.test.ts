import { describe, it, expect } from 'vitest';
import { parsePathData } from './svg-import';

describe('parsePathData — accurate adaptive flattening', () => {
    it('a straight cubic does NOT get over-sampled (adaptive, not fixed 24)', () => {
        // Control points collinear with the chord → effectively a line.
        const [sp] = parsePathData('M 0 0 C 10 0 20 0 30 0');
        expect(sp.pts.length).toBeLessThanOrEqual(3);
        expect(sp.pts[sp.pts.length - 1]).toEqual([30, 0]);
    });

    it('a curved cubic is finely subdivided (no visible faceting)', () => {
        const [sp] = parsePathData('M 0 0 C 0 100 100 100 100 0');
        // Far more than the old fixed 24 where curvature demands it.
        expect(sp.pts.length).toBeGreaterThan(24);
    });

    it('elliptical arc A is a TRUE arc, not a straight chord', () => {
        // Quarter circle r=100 centred at origin: (100,0) → (0,100).
        const [sp] = parsePathData('M 100 0 A 100 100 0 0 1 0 100');
        for (const [x, y] of sp.pts) {
            // Every flattened point lies on the circle within tolerance.
            expect(Math.hypot(x, y)).toBeCloseTo(100, 1);
        }
        const end = sp.pts[sp.pts.length - 1];
        expect(end[0]).toBeCloseTo(0, 3);
        expect(end[1]).toBeCloseTo(100, 3);
        // Old straight-line code put the midpoint ~29mm off the arc; this
        // would fail there. A real arc has many points.
        expect(sp.pts.length).toBeGreaterThan(8);
    });

    it('full circle via two arcs stays on radius', () => {
        const [sp] = parsePathData(
            'M 50 0 A 50 50 0 1 1 -50 0 A 50 50 0 1 1 50 0',
        );
        for (const [x, y] of sp.pts) {
            expect(Math.hypot(x, y)).toBeCloseTo(50, 1);
        }
    });

    it('smooth S reflects the previous control point and ends correctly', () => {
        const [sp] = parsePathData(
            'M 0 0 C 0 10 10 10 10 0 S 20 -10 20 0',
        );
        const end = sp.pts[sp.pts.length - 1];
        expect(end[0]).toBeCloseTo(20, 6);
        expect(end[1]).toBeCloseTo(0, 6);
        expect(sp.pts.length).toBeGreaterThan(10);
    });

    it('relative + absolute commands resolve to the same geometry', () => {
        const [abs] = parsePathData('M 10 10 L 20 10 L 20 20 Z');
        const [rel] = parsePathData('m 10 10 l 10 0 l 0 10 z');
        expect(abs.pts).toEqual(rel.pts);
        expect(abs.closed).toBe(true);
        expect(rel.closed).toBe(true);
    });

    it('auto-closes a near-closed path that omits Z (so it cuts as a hole)', () => {
        const [sp] = parsePathData('M 0 0 L 10 0 L 10 10 L 0 10 L 0 0');
        expect(sp.closed).toBe(true);
    });

    it('keeps a truly open path open', () => {
        const [sp] = parsePathData('M 0 0 L 10 0 L 10 10');
        expect(sp.closed).toBe(false);
    });
});
