import { describe, expect, it } from 'vitest';
import { nestOnce, runNest } from './engine';
import { placedPieceRings, ringsBBox } from './geom';
import { DEFAULT_NEST_CONFIG, type NestConfig, type NestPiece, type Ring } from './types';

function square(x: number, y: number, size: number): Ring {
    return [
        [x, y],
        [x + size, y],
        [x + size, y + size],
        [x, y + size],
    ];
}

function rect(w: number, h: number): Ring {
    return [
        [0, 0],
        [w, 0],
        [w, h],
        [0, h],
    ];
}

let pieceN = 0;
function piece(outer: Ring, holes: Ring[] = []): NestPiece {
    pieceN++;
    const bb = ringsBBox([outer]);
    let area = 0;
    // shoelace |area| for outer; subtract holes
    const sh = (r: Ring) => {
        let s = 0;
        for (let i = 0; i < r.length; i++) {
            const [x1, y1] = r[i];
            const [x2, y2] = r[(i + 1) % r.length];
            s += x1 * y2 - x2 * y1;
        }
        return Math.abs(s / 2);
    };
    area = sh(outer);
    for (const h of holes) area -= sh(h);
    return {
        id: `p${pieceN}`,
        label: `Piece ${pieceN}`,
        groupId: 'g1',
        outer,
        holes,
        areaMm2: area,
        widthMm: bb.maxX - bb.minX,
        heightMm: bb.maxY - bb.minY,
    };
}

function cfg(overrides: Partial<NestConfig>): NestConfig {
    return { ...DEFAULT_NEST_CONFIG, ...overrides };
}

/** Axis-aligned placed bounding box of a piece (rotation-aware). */
function placedBBox(p: NestPiece, pl: { xMm: number; yMm: number; rotationDeg: number }) {
    const rings = placedPieceRings(p, pl);
    return ringsBBox([rings.outer]);
}

describe('nestOnce — core invariants', () => {
    it('places axis-aligned squares with at least the configured gap', () => {
        const config = cfg({
            sheetWidthMm: 250,
            sheetHeightMm: 250,
            marginMm: 10,
            gapMm: 5,
            rotationStepDeg: 0,
            allowHoleNesting: false,
        });
        const ps = [piece(rect(100, 100)), piece(rect(100, 100))];
        const sol = nestOnce(ps, config);
        expect(sol.placements).toHaveLength(2);
        expect(sol.unplacedPieceIds).toHaveLength(0);
        expect(sol.sheets).toHaveLength(1);

        const boxes = sol.placements.map((pl) =>
            placedBBox(ps.find((p) => p.id === pl.pieceId)!, pl),
        );
        // Margin respected on every side.
        for (const b of boxes) {
            expect(b.minX).toBeGreaterThanOrEqual(config.marginMm - 1e-6);
            expect(b.minY).toBeGreaterThanOrEqual(config.marginMm - 1e-6);
            expect(b.maxX).toBeLessThanOrEqual(config.sheetWidthMm - config.marginMm + 1e-6);
            expect(b.maxY).toBeLessThanOrEqual(config.sheetHeightMm - config.marginMm + 1e-6);
        }
        // Pairwise separation ≥ gap on at least one axis.
        const [a, b] = boxes;
        const gapX = Math.max(a.minX - b.maxX, b.minX - a.maxX);
        const gapY = Math.max(a.minY - b.maxY, b.minY - a.maxY);
        expect(Math.max(gapX, gapY)).toBeGreaterThanOrEqual(config.gapMm - 1e-6);
    });

    it('lets pieces touch when the gap is zero', () => {
        const config = cfg({
            sheetWidthMm: 250,
            sheetHeightMm: 130,
            marginMm: 10,
            gapMm: 0,
            rotationStepDeg: 0,
        });
        const ps = [piece(rect(100, 100)), piece(rect(100, 100))];
        const sol = nestOnce(ps, config);
        expect(sol.placements).toHaveLength(2);
        expect(sol.sheets).toHaveLength(1);
    });

    it('overflows to a second sheet when the first is full', () => {
        const config = cfg({
            sheetWidthMm: 120,
            sheetHeightMm: 120,
            marginMm: 10,
            gapMm: 3,
            rotationStepDeg: 0,
        });
        const ps = [piece(rect(100, 100)), piece(rect(100, 100))];
        const sol = nestOnce(ps, config);
        expect(sol.placements).toHaveLength(2);
        expect(sol.sheets).toHaveLength(2);
        expect(new Set(sol.placements.map((p) => p.sheetIndex))).toEqual(
            new Set([0, 1]),
        );
    });

    it('reports pieces that cannot fit any sheet', () => {
        const config = cfg({
            sheetWidthMm: 200,
            sheetHeightMm: 200,
            marginMm: 10,
            rotationStepDeg: 0,
        });
        const sol = nestOnce([piece(rect(300, 100))], config);
        expect(sol.placements).toHaveLength(0);
        expect(sol.unplacedPieceIds).toHaveLength(1);
    });

    it('rescues an oversized piece by rotating it when rotation is on', () => {
        const config = cfg({
            sheetWidthMm: 120,
            sheetHeightMm: 320,
            marginMm: 10,
            gapMm: 3,
            rotationStepDeg: 90,
        });
        const sol = nestOnce([piece(rect(300, 100))], config);
        expect(sol.placements).toHaveLength(1);
        expect(sol.placements[0].rotationDeg % 180).toBe(90);
    });

    it('nests a small piece inside a counter when allowed', () => {
        // Sheet is too tight to fit the small piece NEXT to the big one, so
        // the only home is inside the big piece's 100mm hole.
        const config = cfg({
            sheetWidthMm: 230,
            sheetHeightMm: 230,
            marginMm: 10,
            gapMm: 5,
            rotationStepDeg: 0,
            allowHoleNesting: true,
            maxSheets: 1,
        });
        const big = piece(rect(200, 200), [square(50, 50, 100)]);
        const small = piece(rect(50, 50));
        const sol = nestOnce([big, small], config);
        expect(sol.placements).toHaveLength(2);

        const bigPl = sol.placements.find((p) => p.pieceId === big.id)!;
        const smallPl = sol.placements.find((p) => p.pieceId === small.id)!;
        const smallBox = placedBBox(small, smallPl);
        // The hole sits 50..150 inside the big piece.
        const holeMinX = bigPl.xMm + 50;
        const holeMinY = bigPl.yMm + 50;
        expect(smallBox.minX).toBeGreaterThanOrEqual(holeMinX + config.gapMm - 1e-6);
        expect(smallBox.minY).toBeGreaterThanOrEqual(holeMinY + config.gapMm - 1e-6);
        expect(smallBox.maxX).toBeLessThanOrEqual(holeMinX + 100 - config.gapMm + 1e-6);
        expect(smallBox.maxY).toBeLessThanOrEqual(holeMinY + 100 - config.gapMm + 1e-6);
    });

    it('refuses counter-nesting when the toggle is off', () => {
        const config = cfg({
            sheetWidthMm: 230,
            sheetHeightMm: 230,
            marginMm: 10,
            gapMm: 5,
            rotationStepDeg: 0,
            allowHoleNesting: false,
            maxSheets: 2,
        });
        const big = piece(rect(200, 200), [square(50, 50, 100)]);
        const small = piece(rect(50, 50));
        const sol = nestOnce([big, small], config);
        const smallPl = sol.placements.find((p) => p.pieceId === small.id);
        expect(smallPl).toBeDefined();
        // No room beside the big piece on a 230 sheet → it must overflow.
        expect(smallPl!.sheetIndex).toBe(1);
    });

    it('returns an empty solution for no pieces', () => {
        const sol = nestOnce([], cfg({}));
        expect(sol.placements).toHaveLength(0);
        expect(sol.sheets).toHaveLength(0);
    });
});

describe('nestOnce — clustering (keep together)', () => {
    it('keeps a clustered group on one sheet with relative layout preserved', () => {
        pieceN = 0;
        const a = piece(square(0, 0, 50));
        const b = piece(square(120, 0, 50)); // 120mm right of a in artwork space
        a.clusterId = 'c1';
        b.clusterId = 'c1';
        const config = cfg({
            sheetWidthMm: 400,
            sheetHeightMm: 200,
            marginMm: 10,
            gapMm: 3,
            rotationStepDeg: 0,
        });
        const sol = nestOnce([a, b], config);
        expect(sol.placements).toHaveLength(2);
        const pa = sol.placements.find((p) => p.pieceId === a.id)!;
        const pb = sol.placements.find((p) => p.pieceId === b.id)!;
        expect(pa.sheetIndex).toBe(pb.sheetIndex);
        expect(pa.rotationDeg).toBe(pb.rotationDeg);
        const ba = placedBBox(a, pa);
        const bb = placedBBox(b, pb);
        expect(bb.minX - ba.minX).toBeCloseTo(120, 6); // gap preserved
        expect(ba.minY).toBeCloseTo(bb.minY, 6); // still on the same baseline
    });

    it('forces a clustered pair onto the same sheet that free pieces would split', () => {
        pieceN = 0;
        // Sheet only ~one square tall; two free squares would overflow to 2
        // sheets. Clustered side-by-side they fit one sheet (wide, short).
        const a = piece(square(0, 0, 80));
        const b = piece(square(100, 0, 80));
        a.clusterId = 'g';
        b.clusterId = 'g';
        const config = cfg({
            sheetWidthMm: 400,
            sheetHeightMm: 100,
            marginMm: 5,
            gapMm: 2,
            rotationStepDeg: 0,
        });
        const sol = nestOnce([a, b], config);
        expect(sol.placements).toHaveLength(2);
        expect(sol.sheets).toHaveLength(1);
        expect(sol.placements[0].sheetIndex).toBe(sol.placements[1].sheetIndex);
    });
});

describe('runNest — improvement loop', () => {
    it('is deterministic for a given seed', () => {
        const config = cfg({
            sheetWidthMm: 400,
            sheetHeightMm: 300,
            marginMm: 10,
            gapMm: 3,
            rotationStepDeg: 90,
        });
        const make = () => {
            pieceN = 0;
            return [
                piece(rect(120, 80)),
                piece(rect(60, 140)),
                piece(rect(90, 90)),
                piece(rect(40, 40)),
                piece(rect(150, 30)),
            ];
        };
        const run = (ps: NestPiece[]) => {
            const gen = runNest(ps, config, { iterations: 6, seed: 1234 });
            let last = null;
            for (const ev of gen) {
                if (ev.type === 'solution') last = ev.solution;
            }
            return JSON.stringify(last?.placements);
        };
        expect(run(make())).toEqual(run(make()));
    });

    it('never yields a worse solution than the one before', () => {
        const config = cfg({
            sheetWidthMm: 400,
            sheetHeightMm: 300,
            marginMm: 10,
            gapMm: 3,
            rotationStepDeg: 0,
        });
        pieceN = 0;
        const ps = [
            piece(rect(120, 80)),
            piece(rect(60, 140)),
            piece(rect(90, 90)),
            piece(rect(40, 40)),
        ];
        const gen = runNest(ps, config, { iterations: 10, seed: 99 });
        let prevScore = Infinity;
        for (const ev of gen) {
            if (ev.type === 'solution') {
                expect(ev.solution.score).toBeLessThanOrEqual(prevScore);
                prevScore = ev.solution.score;
            }
        }
    });
});
