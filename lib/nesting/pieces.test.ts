import { describe, expect, it } from 'vitest';
import { buildPieces, scalePieces } from './pieces';
import type { NestPath, Ring } from './types';

function square(x: number, y: number, size: number): Ring {
    return [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
    ];
}

function path(
    points: Ring,
    opts: Partial<Omit<NestPath, 'points'>> = {},
): NestPath {
    return { points, closed: true, sourceIndex: 0, ...opts };
}

describe('buildPieces', () => {
    it('welds an inner counter to its parent as a hole (the D rule)', () => {
        const { pieces } = buildPieces([
            path(square(0, 0, 100)),
            path(square(30, 30, 40)),
        ]);
        expect(pieces).toHaveLength(1);
        expect(pieces[0].holes).toHaveLength(1);
        expect(pieces[0].areaMm2).toBeCloseTo(100 * 100 - 40 * 40, 3);
        expect(pieces[0].widthMm).toBeCloseTo(100, 3);
    });

    it('splits disjoint contours into separate pieces', () => {
        const { pieces } = buildPieces([
            path(square(0, 0, 50)),
            path(square(100, 0, 50)),
        ]);
        expect(pieces).toHaveLength(2);
        expect(pieces[0].holes).toHaveLength(0);
        expect(pieces[1].holes).toHaveLength(0);
    });

    it('makes an island inside a hole its own piece again (depth 2)', () => {
        const { pieces } = buildPieces([
            path(square(0, 0, 100)), // outer
            path(square(20, 20, 60)), // hole
            path(square(40, 40, 20)), // island in the hole
        ]);
        expect(pieces).toHaveLength(2);
        const big = pieces.find((p) => p.holes.length === 1);
        const island = pieces.find((p) => p.holes.length === 0);
        expect(big).toBeDefined();
        expect(island).toBeDefined();
        expect(island!.widthMm).toBeCloseTo(20, 3);
    });

    it('ignores open paths with a warning', () => {
        const { pieces, warnings } = buildPieces([
            path(square(0, 0, 50)),
            {
                points: [
                    [0, 0],
                    [10, 10],
                    [20, 0],
                ],
                closed: false,
                sourceIndex: 1,
            },
        ]);
        expect(pieces).toHaveLength(1);
        expect(warnings.some((w) => w.includes('open path'))).toBe(true);
    });

    it('drops degenerate slivers with a warning', () => {
        const { pieces, warnings } = buildPieces([
            path(square(0, 0, 50)),
            path(square(60, 60, 0.1)), // 0.01mm² — noise
        ]);
        expect(pieces).toHaveLength(1);
        expect(warnings.some((w) => w.includes('degenerate'))).toBe(true);
    });

    it('groups pieces by their SVG group label', () => {
        const { pieces, groups } = buildPieces([
            path(square(0, 0, 50), { groupLabel: 'RETAIL', sourceIndex: 0 }),
            path(square(60, 0, 50), { groupLabel: 'RETAIL', sourceIndex: 1 }),
            path(square(120, 0, 50), { sourceIndex: 2 }),
        ]);
        expect(pieces).toHaveLength(3);
        const retail = groups.find((g) => g.label === 'RETAIL');
        expect(retail).toBeDefined();
        expect(retail!.pieceIds).toHaveLength(2);
        // The ungrouped singleton becomes its own group named after the piece.
        const single = groups.find((g) => g.pieceIds.length === 1);
        expect(single).toBeDefined();
    });

    it('groups multiple pieces from one compound path together', () => {
        const { groups } = buildPieces([
            path(square(0, 0, 50), { sourceIndex: 7 }),
            path(square(60, 0, 50), { sourceIndex: 7 }),
        ]);
        expect(groups).toHaveLength(1);
        expect(groups[0].pieceIds).toHaveLength(2);
        expect(groups[0].label).toMatch(/Shape group/);
    });
});

describe('scalePieces', () => {
    it('scales rings, dims and area consistently', () => {
        const { pieces } = buildPieces([
            path(square(0, 0, 100)),
            path(square(30, 30, 40)),
        ]);
        const scaled = scalePieces(pieces, 2);
        expect(scaled[0].widthMm).toBeCloseTo(200, 6);
        expect(scaled[0].areaMm2).toBeCloseTo((100 * 100 - 40 * 40) * 4, 3);
        expect(scaled[0].outer[2][0]).toBeCloseTo(200, 6);
        expect(scaled[0].holes[0][0][0]).toBeCloseTo(60, 6);
    });
});
