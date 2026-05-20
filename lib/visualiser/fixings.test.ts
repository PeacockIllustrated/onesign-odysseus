import { describe, it, expect } from 'vitest';
import { placeFixings } from './geometry';
import type { FlatPath } from './types';

function centre(p: FlatPath): [number, number] {
    const cx = p.points.reduce((a, q) => a + q[0], 0) / p.points.length;
    const cy = p.points.reduce((a, q) => a + q[1], 0) / p.points.length;
    return [cx, cy];
}

function pointInRing(p: [number, number], ring: Array<[number, number]>): boolean {
    let inside = false;
    let j = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (
            yi > p[1] !== yj > p[1] &&
            p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi
        ) {
            inside = !inside;
        }
        j = i;
    }
    return inside;
}

describe('placeFixings — sensible stand-off hole placement', () => {
    it('empty input → no fixings', () => {
        expect(placeFixings([], 5)).toEqual([]);
    });

    it('zero / negative radius → no fixings', () => {
        const sq: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [400, 0],
                [400, 400],
                [0, 400],
                [0, 0],
            ],
        };
        expect(placeFixings([sq], 0)).toEqual([]);
        expect(placeFixings([sq], -3)).toEqual([]);
    });

    it('places multiple fixings inside a large square letter', () => {
        const sq: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [400, 0],
                [400, 400],
                [0, 400],
                [0, 0],
            ],
        };
        const out = placeFixings([sq], 5);
        expect(out.length).toBeGreaterThanOrEqual(3);
        // Every fixing centre lies inside the letter outline.
        for (const f of out) {
            const c = centre(f);
            expect(pointInRing(c, sq.points)).toBe(true);
        }
    });

    it('no two fixings line up vertically or horizontally', () => {
        const sq: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [400, 0],
                [400, 400],
                [0, 400],
                [0, 0],
            ],
        };
        const out = placeFixings([sq], 5);
        const centres = out.map(centre);
        for (let i = 0; i < centres.length; i++) {
            for (let j = i + 1; j < centres.length; j++) {
                const dx = Math.abs(centres[i][0] - centres[j][0]);
                const dy = Math.abs(centres[i][1] - centres[j][1]);
                // > 1mm offset in BOTH axes — the slight-offset principle.
                expect(dx).toBeGreaterThan(1);
                expect(dy).toBeGreaterThan(1);
            }
        }
    });

    it('respects minimum spacing between fixings', () => {
        const sq: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [600, 0],
                [600, 200],
                [0, 200],
                [0, 0],
            ],
        };
        const out = placeFixings([sq], 5);
        const centres = out.map(centre);
        // Minimum distance ≥ ~20mm (well above any sensible collision).
        for (let i = 0; i < centres.length; i++) {
            for (let j = i + 1; j < centres.length; j++) {
                const d = Math.hypot(
                    centres[i][0] - centres[j][0],
                    centres[i][1] - centres[j][1],
                );
                expect(d).toBeGreaterThan(20);
            }
        }
    });

    it('compound path (letter O): no fixings inside the counter (hole)', () => {
        const outer: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [400, 0],
                [400, 400],
                [0, 400],
                [0, 0],
            ],
        };
        const hole: FlatPath = {
            closed: true,
            points: [
                [120, 120],
                [280, 120],
                [280, 280],
                [120, 280],
                [120, 120],
            ],
        };
        const out = placeFixings([outer, hole], 5);
        expect(out.length).toBeGreaterThan(0);
        // None of the placed centres lies inside the counter.
        for (const f of out) {
            const c = centre(f);
            expect(pointInRing(c, hole.points)).toBe(false);
            expect(pointInRing(c, outer.points)).toBe(true);
        }
    });

    it('density factor scales the count: dense > normal > sparse', () => {
        const sq: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [600, 0],
                [600, 600],
                [0, 600],
                [0, 0],
            ],
        };
        const sparse = placeFixings([sq], 5, undefined, 0.5).length;
        const normal = placeFixings([sq], 5, undefined, 1.0).length;
        const dense = placeFixings([sq], 5, undefined, 2.0).length;
        expect(dense).toBeGreaterThan(normal);
        expect(normal).toBeGreaterThan(sparse);
    });

    it('per-letter guarantee: a thin letter still gets at least one fixing', () => {
        // Tall thin letter (50mm wide, 400mm tall) — too narrow for a grid
        // pass with default spacing, so the fallback must kick in.
        const thin: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [50, 0],
                [50, 400],
                [0, 400],
                [0, 0],
            ],
        };
        const out = placeFixings([thin], 5);
        expect(out.length).toBeGreaterThanOrEqual(1);
    });
});
