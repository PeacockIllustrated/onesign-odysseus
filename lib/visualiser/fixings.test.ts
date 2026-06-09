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
        expect(placeFixings([], 10)).toEqual([]);
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
        const out = placeFixings([sq], 10);
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
        const out = placeFixings([sq], 10);
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
        const out = placeFixings([sq], 10);
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
        const out = placeFixings([outer, hole], 10);
        expect(out.length).toBeGreaterThan(0);
        // None of the placed centres lies inside the counter.
        for (const f of out) {
            const c = centre(f);
            expect(pointInRing(c, hole.points)).toBe(false);
            expect(pointInRing(c, outer.points)).toBe(true);
        }
    });

    it('chunky letter gets at least 3 fixings (triangulation vs rotation)', () => {
        // Both dimensions large enough that a 2-fixing line would still
        // let the letter rotate around it.
        const chunky: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [220, 0],
                [220, 220],
                [0, 220],
                [0, 0],
            ],
        };
        const out = placeFixings([chunky], 10);
        expect(out.length).toBeGreaterThanOrEqual(3);
        // …and they're genuinely spread, not collinear.
        const centres = out.map(centre);
        const xs = centres.map((c) => c[0]);
        const ys = centres.map((c) => c[1]);
        const spreadX = Math.max(...xs) - Math.min(...xs);
        const spreadY = Math.max(...ys) - Math.min(...ys);
        expect(spreadX).toBeGreaterThan(60);
        expect(spreadY).toBeGreaterThan(60);
    });

    it('elongated letter: fixings span the long axis (physical support)', () => {
        // 50mm x 500mm — like an I, T stem, etc. Fixings must spread
        // along the long axis or the letter tips around a single anchor.
        const tall: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [50, 0],
                [50, 500],
                [0, 500],
                [0, 0],
            ],
        };
        const out = placeFixings([tall], 10);
        expect(out.length).toBeGreaterThanOrEqual(3);
        const ys = out.map(centre).map((c) => c[1]);
        const span = Math.max(...ys) - Math.min(...ys);
        // At least 60% of the letter's long-axis length is spanned.
        expect(span).toBeGreaterThan(500 * 0.6);
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
        const sparse = placeFixings([sq], 10, undefined, 0.5).length;
        const normal = placeFixings([sq], 10, undefined, 1.0).length;
        const dense = placeFixings([sq], 10, undefined, 2.0).length;
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
        const out = placeFixings([thin], 10);
        expect(out.length).toBeGreaterThanOrEqual(1);
    });

    // -----------------------------------------------------------------
    // Reference-based tests — these encode the Montserrat alphabet rules
    // (fixings at stroke tips / outer corners, not at stroke centres).
    // -----------------------------------------------------------------

    /** Count fixings whose centres lie within `r` mm of `pt`. */
    function nearCount(
        out: FlatPath[],
        pt: [number, number],
        r: number,
    ): number {
        let n = 0;
        for (const f of out) {
            const [cx, cy] = centre(f);
            if (Math.hypot(cx - pt[0], cy - pt[1]) <= r) n++;
        }
        return n;
    }

    it('I-stem (30 x 150): two fixings, one near top, one near bottom', () => {
        const I: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [30, 0],
                [30, 150],
                [0, 150],
                [0, 0],
            ],
        };
        const out = placeFixings([I], 10);
        expect(out.length).toBe(2);
        // One fixing in the top third, one in the bottom third.
        expect(nearCount(out, [15, 0], 60)).toBeGreaterThanOrEqual(1);
        expect(nearCount(out, [15, 150], 60)).toBeGreaterThanOrEqual(1);
    });

    it('T-shape: three fixings — left crossbar end, right crossbar end, bottom of stem', () => {
        // Crossbar 200 wide x 30 tall on top; stem 30 wide x 170 tall.
        const T: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [200, 0],
                [200, 30],
                [115, 30],
                [115, 200],
                [85, 200],
                [85, 30],
                [0, 30],
                [0, 0],
            ],
        };
        const out = placeFixings([T], 10);
        expect(out.length).toBeGreaterThanOrEqual(3);
        // Tips: top-left of crossbar, top-right of crossbar, bottom of stem.
        expect(nearCount(out, [0, 15], 45)).toBeGreaterThanOrEqual(1);
        expect(nearCount(out, [200, 15], 45)).toBeGreaterThanOrEqual(1);
        expect(nearCount(out, [100, 200], 45)).toBeGreaterThanOrEqual(1);
    });

    it('L-shape: three fixings — top of stem, two ends of the foot', () => {
        // Stem 30x200; foot extends right to x=150 at y=170..200.
        const L: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [30, 0],
                [30, 170],
                [150, 170],
                [150, 200],
                [0, 200],
                [0, 0],
            ],
        };
        const out = placeFixings([L], 10);
        expect(out.length).toBeGreaterThanOrEqual(3);
        // Top of stem, bottom-left corner of foot, bottom-right corner of foot.
        expect(nearCount(out, [15, 0], 45)).toBeGreaterThanOrEqual(1);
        expect(nearCount(out, [0, 185], 45)).toBeGreaterThanOrEqual(1);
        expect(nearCount(out, [150, 185], 45)).toBeGreaterThanOrEqual(1);
    });

    it('O-shape (smooth ring): four fixings spread around the ring', () => {
        // Outer circle r=100 (32-segment polygon), inner counter r=70.
        const circle = (r: number, cx = 0, cy = 0): Array<[number, number]> => {
            const pts: Array<[number, number]> = [];
            const n = 64;
            for (let i = 0; i <= n; i++) {
                const t = (i / n) * Math.PI * 2;
                pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
            }
            return pts;
        };
        const outer: FlatPath = { closed: true, points: circle(100) };
        const counter: FlatPath = { closed: true, points: circle(70) };
        const out = placeFixings([outer, counter], 10);
        expect(out.length).toBeGreaterThanOrEqual(3);
        expect(out.length).toBeLessThanOrEqual(6);
        // No two fixings sit in the same quadrant (well-spread around the ring).
        const quadrants = new Set<number>();
        for (const f of out) {
            const [cx, cy] = centre(f);
            const q = (cx >= 0 ? 1 : 0) + (cy >= 0 ? 2 : 0);
            quadrants.add(q);
        }
        expect(quadrants.size).toBeGreaterThanOrEqual(3);
    });
});
