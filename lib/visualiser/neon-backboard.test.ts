import { describe, it, expect } from 'vitest';
import { buildShapedBackboard, NEON_TUBE_MM } from './neon-backboard';
import type { NeonElement } from './neon';

/** Minimal NeonElement — buildShapedBackboard only reads points + closed. */
function run(points: Array<[number, number]>, closed = false): NeonElement {
    return {
        index: 1,
        lengthMm: 0,
        closed,
        centroid: [0, 0],
        bbox: { minX: 0, minY: 0, maxX: 0, maxY: 0 },
        points,
    };
}

describe('buildShapedBackboard', () => {
    it('returns nothing for no runs', () => {
        const board = buildShapedBackboard([], 30);
        expect(board.rings).toEqual([]);
        expect(board.bbox).toBeNull();
        expect(board.areaMm2).toBe(0);
    });

    it('buffers a single run into one rounded island', () => {
        // 100mm horizontal run, padding 0 → buffer radius = tube radius.
        const board = buildShapedBackboard(
            [run([[0, 0], [100, 0]])],
            0,
        );
        expect(board.rings).toHaveLength(1);
        const r = NEON_TUBE_MM;
        // Stadium extent: x ∈ [-r, 100+r], y ∈ [-r, r].
        expect(board.bbox!.minX).toBeCloseTo(-r, 1);
        expect(board.bbox!.maxX).toBeCloseTo(100 + r, 1);
        expect(board.bbox!.minY).toBeCloseTo(-r, 1);
        expect(board.bbox!.maxY).toBeCloseTo(r, 1);
        // Area ≈ rectangle (100×2r) + end caps; comfortably above the bare core.
        expect(board.areaMm2).toBeGreaterThan(100 * 2 * r);
        expect(board.areaMm2).toBeLessThan(100 * 2 * r + Math.PI * r * r + 50);
    });

    it('grows the board by padding beyond the neon', () => {
        const tight = buildShapedBackboard([run([[0, 0], [100, 0]])], 0);
        const padded = buildShapedBackboard([run([[0, 0], [100, 0]])], 40);
        expect(padded.areaMm2).toBeGreaterThan(tight.areaMm2);
        // Padding clears the tube edge, so the half-height grows by ~padding.
        expect(padded.bbox!.maxY).toBeCloseTo(NEON_TUBE_MM + 40, 1);
    });

    it('keeps far-apart runs as separate islands, then merges them as padding grows', () => {
        const runs = [
            run([[0, 0], [100, 0]]),
            run([[0, 500], [100, 500]]),
        ];
        // Small padding → the two runs stay apart (two islands).
        expect(buildShapedBackboard(runs, 0).rings).toHaveLength(2);
        // Large padding bridges the 500mm gap (radius > half the gap) → one blob.
        expect(buildShapedBackboard(runs, 300).rings).toHaveLength(1);
    });

    it('wraps a closed contour', () => {
        const square = run(
            [
                [0, 0],
                [100, 0],
                [100, 100],
                [0, 100],
            ],
            true,
        );
        const board = buildShapedBackboard([square], 10);
        expect(board.rings.length).toBeGreaterThanOrEqual(1);
        // The buffer reaches outside the 0–100 box by tube radius + padding.
        expect(board.bbox!.minX).toBeLessThan(0);
        expect(board.bbox!.maxX).toBeGreaterThan(100);
        expect(board.areaMm2).toBeGreaterThan(0);
    });
});
