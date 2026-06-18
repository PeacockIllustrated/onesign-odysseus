import { describe, it, expect } from 'vitest';
import { buildKeyline, mergeKeyline } from './svg-import';
import type { FlatPath } from './types';

/** A closed rectangle ring (points listed CCW; closing point added). */
function rect(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    ccw = true,
): FlatPath {
    const pts: Array<[number, number]> = ccw
        ? [
              [x0, y0],
              [x1, y0],
              [x1, y1],
              [x0, y1],
          ]
        : [
              [x0, y0],
              [x0, y1],
              [x1, y1],
              [x1, y0],
          ];
    pts.push([pts[0][0], pts[0][1]]);
    return { closed: true, points: pts };
}

function area(p: FlatPath): number {
    let a = 0;
    const r = p.points;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
        a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    }
    return Math.abs(a) / 2;
}

function bbox(p: FlatPath) {
    const xs = p.points.map((q) => q[0]);
    const ys = p.points.map((q) => q[1]);
    return {
        minX: Math.min(...xs),
        maxX: Math.max(...xs),
        minY: Math.min(...ys),
        maxY: Math.max(...ys),
    };
}

describe('buildKeyline — Illustrator-style Offset Path', () => {
    // 100×100 square centred at origin (closing point duplicated).
    const square: FlatPath = {
        closed: true,
        points: [
            [-50, -50],
            [50, -50],
            [50, 50],
            [-50, 50],
            [-50, -50],
        ],
    };

    it('moves every edge exactly the offset distance (mitred corners)', () => {
        const [out] = buildKeyline([square], 10);
        const b = bbox(out);
        // Each edge pushed out 10mm → 120×120 about the origin.
        expect(b.minX).toBeCloseTo(-60, 6);
        expect(b.maxX).toBeCloseTo(60, 6);
        expect(b.minY).toBeCloseTo(-60, 6);
        expect(b.maxY).toBeCloseTo(60, 6);
    });

    it('a 90° corner stays a sharp mitre (no bevel within miter limit)', () => {
        const [out] = buildKeyline([square], 10);
        // 4 corners + closing duplicate = 5 points (bevel would add more).
        expect(out.points.length).toBe(5);
        expect(out.closed).toBe(true);
    });

    it('offset scales linearly with the keyline value', () => {
        const [a] = buildKeyline([square], 25);
        const b = bbox(a);
        expect(b.maxX - b.minX).toBeCloseTo(150, 6); // 100 + 2×25
    });

    it('returns nothing for a zero/negative offset', () => {
        expect(buildKeyline([square], 0)).toEqual([]);
        expect(buildKeyline([square], -5)).toEqual([]);
    });

    it('ignores open paths (a keyline needs a closed cut)', () => {
        const open: FlatPath = {
            closed: false,
            points: [
                [0, 0],
                [10, 0],
                [10, 10],
            ],
        };
        expect(buildKeyline([open], 5)).toEqual([]);
    });

    it('produces a valid, non-self-intersecting cut at concave corners / narrow gaps', () => {
        // A U-channel with a 10mm-wide slot. Offsetting 8mm outward makes the
        // two slot walls collide — a naive miter offset folds back and crosses
        // itself there, which CAM software refuses or mis-cuts. The keyline
        // must come out as a clean, simple closed cut.
        const u: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [100, 0],
                [100, 80],
                [55, 80],
                [55, 20],
                [45, 20],
                [45, 80],
                [0, 80],
                [0, 0],
            ],
        };

        const out = buildKeyline([u], 8);
        expect(out.length).toBeGreaterThanOrEqual(1);
        for (const ring of out) {
            expect(ring.closed).toBe(true);
            expect(ring.points.length).toBeGreaterThanOrEqual(4);
            // THE invariant the machine needs: the cut path is simple — no edge
            // crosses another.
            expect(selfIntersects(ring.points)).toBe(false);
        }
        // …and the keyline encloses the source (offset outward).
        const ob = bbox(out[0]);
        const sb = bbox(u);
        expect(ob.minX).toBeLessThanOrEqual(sb.minX + 1e-6);
        expect(ob.maxX).toBeGreaterThanOrEqual(sb.maxX - 1e-6);
        expect(ob.minY).toBeLessThanOrEqual(sb.minY + 1e-6);
        expect(ob.maxY).toBeGreaterThanOrEqual(sb.maxY - 1e-6);
    });
    it('despikes a near-zero-width needle in the source before offsetting', () => {
        // A box with a tall, near-zero-width whisker stabbing off the top edge —
        // the classic stray-anchor artifact. The offset would thicken it into a
        // real spur; it must be cleaned away first.
        const box: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [100, 0],
                [100, 60],
                [55, 60],
                [55, 90], // whisker tip, 30mm out
                [55.001, 60], // …and straight back (≈0 width)
                [0, 60],
                [0, 0],
            ],
        };
        const out = buildKeyline([box], 5);
        expect(out.length).toBeGreaterThanOrEqual(1);
        for (const ring of out) expect(selfIntersects(ring.points)).toBe(false);
        // The whisker is gone — the keyline tops out near the box edge
        // (60 + 5 offset ≈ 65), not at the whisker tip (~90 + 5).
        const topY = Math.max(...out.flatMap((r) => r.points.map((p) => p[1])));
        expect(topY).toBeLessThan(75);
    });

    it('does not facet a finely-curved outline (despike keeps curve points)', () => {
        // A near-circular outline, finely sampled (2° per segment). The old
        // despike culled "collinear" curve points within 0.03mm — but a gentle
        // curve's sagitta here (~0.008mm) is under that, so it would coarsen the
        // smooth circle into a faceted polygon. The keyline must keep the curve.
        const R = 50;
        const N = 180;
        const pts: Array<[number, number]> = [];
        for (let i = 0; i < N; i++) {
            const t = (i / N) * Math.PI * 2;
            pts.push([R * Math.cos(t), R * Math.sin(t)]);
        }
        pts.push([pts[0][0], pts[0][1]]);
        const circle: FlatPath = { closed: true, points: pts };
        const [out] = buildKeyline([circle], 5);
        // Convex circle → the outward offset never self-intersects, so it passes
        // straight through; every source vertex must survive. A facet-prone
        // despike would crush the count well below the source resolution.
        expect(out.points.length).toBeGreaterThan(N * 0.9);
    });

    it('keeps a genuine sharp corner (only degenerate slivers are removed)', () => {
        // A 30° arrow point is a real feature, not a sliver — it must survive.
        const arrow: FlatPath = {
            closed: true,
            points: [
                [0, 0],
                [120, 30], // sharp tip (~30° interior angle)
                [0, 60],
                [0, 0],
            ],
        };
        const [out] = buildKeyline([arrow], 4);
        const b = bbox(out);
        // The tip is preserved → the keyline still reaches well past x=120.
        expect(b.maxX).toBeGreaterThan(120);
    });
});

/** Proper self-intersection test — true if any two non-adjacent edges cross. */
function selfIntersects(pts: Array<[number, number]>): boolean {
    const n = pts.length;
    const m =
        n > 1 && pts[0][0] === pts[n - 1][0] && pts[0][1] === pts[n - 1][1]
            ? n - 1
            : n;
    if (m < 4) return false;
    const o = (
        a: [number, number],
        b: [number, number],
        c: [number, number],
    ) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const cross = (
        p1: [number, number],
        p2: [number, number],
        p3: [number, number],
        p4: [number, number],
    ) => {
        const d1 = o(p3, p4, p1);
        const d2 = o(p3, p4, p2);
        const d3 = o(p1, p2, p3);
        const d4 = o(p1, p2, p4);
        return (
            ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
            ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
        );
    };
    for (let i = 0; i < m; i++) {
        for (let j = i + 1; j < m; j++) {
            if (j === (i + 1) % m || (j + 1) % m === i) continue;
            if (cross(pts[i], pts[(i + 1) % m], pts[j], pts[(j + 1) % m])) {
                return true;
            }
        }
    }
    return false;
}

describe('mergeKeyline — weld overlapping keyline cuts', () => {
    it('merges two overlapping rings into one clean contour', () => {
        const a = rect(0, 0, 60, 60);
        const b = rect(40, 40, 100, 100);
        const out = mergeKeyline([a, b]);
        // Overlapping → a single welded outer contour, not two crossing cuts.
        expect(out.length).toBe(1);
        expect(out[0].closed).toBe(true);
    });

    it('leaves non-overlapping rings as separate contours', () => {
        const a = rect(0, 0, 30, 30);
        const b = rect(100, 100, 130, 130);
        const out = mergeKeyline([a, b]);
        expect(out.length).toBe(2);
    });

    it('preserves a counter (opposite-winding inner ring) as a hole', () => {
        const outer = rect(0, 0, 100, 100, true);
        const counter = rect(35, 35, 65, 65, false); // opposite winding = hole
        const out = mergeKeyline([outer, counter]);
        // Outer contour + the counter hole both survive as cut rings.
        expect(out.length).toBe(2);
        const areas = out.map(area).sort((x, y) => y - x);
        expect(areas[0]).toBeCloseTo(100 * 100, 0); // outer ring
        expect(areas[1]).toBeCloseTo(30 * 30, 0); // the counter hole ring
    });

    it('passes a single ring straight through', () => {
        const a = rect(0, 0, 50, 50);
        expect(mergeKeyline([a])).toEqual([a]);
    });
});
