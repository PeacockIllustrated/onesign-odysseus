import { describe, it, expect } from 'vitest';
import { buildKeyline } from './svg-import';
import type { FlatPath } from './types';

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

    it('strips spikes at concave corners / narrow gaps (no fold-backs)', () => {
        // A U-channel with a 10mm-wide slot. Offsetting 8mm outward makes
        // the two slot walls collide — the old code spiked here.
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
        const src = u.points.slice(0, -1);
        const distToRing = (p: number[]) => {
            let m = Infinity;
            for (let i = 0; i < src.length; i++) {
                const a = src[i];
                const b = src[(i + 1) % src.length];
                const dx = b[0] - a[0];
                const dy = b[1] - a[1];
                const l2 = dx * dx + dy * dy;
                let t =
                    l2 > 0
                        ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2
                        : 0;
                t = Math.max(0, Math.min(1, t));
                m = Math.min(
                    m,
                    Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy)),
                );
            }
            return m;
        };

        const [out] = buildKeyline([u], 8);
        expect(out.points.length).toBeGreaterThanOrEqual(4);
        // Every surviving point is clear of the source — no spike folded
        // back across the slot.
        for (const p of out.points) {
            expect(distToRing(p)).toBeGreaterThanOrEqual(8 * 0.5 - 1e-6);
        }
    });
});
