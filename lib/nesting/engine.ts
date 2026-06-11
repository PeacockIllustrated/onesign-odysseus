/**
 * The nesting engine — multi-sheet bottom-left-fill over a raster grid.
 *
 * How a piece is placed:
 *   - Every allowed rotation of every piece is prepared once: rotate, snap
 *     the bounding box to (0,0), rasterise conservatively (raster.ts), and
 *     dilate a copy by the full gap. The dilated mask is the "footprint":
 *     a piece may sit at (x, y) iff its footprint overlaps no already-placed
 *     piece's SOLID mask — which guarantees ≥ gap clearance pairwise.
 *   - Placement scans rows top-to-bottom (bottom-left-fill in y-down
 *     coords); per row, each orientation sweeps x left-to-right using the
 *     occupancy's interval lists, skipping ahead past whole blocking
 *     intervals instead of stepping cell by cell. First feasible row wins;
 *     within a row the smallest x (across orientations) wins.
 *   - A piece that fits nowhere on existing sheets opens the next sheet,
 *     up to config.maxSheets. A piece that cannot fit an EMPTY sheet in any
 *     rotation is reported as unplaceable.
 *
 * Because the occupancy stores solid masks with their real holes (when
 * hole-nesting is on), the row scan finds positions INSIDE the cut-out
 * counters of bigger letters for free — that's where the material win is.
 *
 * "Most efficient" is heuristic (true optimal nesting is NP-hard): after
 * the first greedy pass (pieces by area, descending) an improvement loop
 * mutates the insertion order with a seeded RNG and keeps the best layout.
 * The generator yields every improvement so the UI can show
 * best-so-far live; the worker (or a main-thread fallback) drives it.
 *
 * DOM-free: runs in a Web Worker and in Vitest's node environment.
 */

import { transformClusterRings } from './geom';
import { dilateMask, rasterizeRings, runsFromMask } from './raster';
import type {
    NestConfig,
    NestPiece,
    NestProgress,
    NestSolution,
    Placement,
    SheetStats,
} from './types';

interface Orientation {
    rotationDeg: number;
    wMm: number;
    hMm: number;
    wCells: number;
    hCells: number;
    /** Un-dilated runs — written into the occupancy once placed. */
    solidRuns: number[][];
    /** Gap-dilated runs — collision-tested while searching. */
    dilatedRuns: number[][];
    /** Dilation radius in cells; the dilated origin is offset (-d, -d). */
    dilCells: number;
    /** Per-member bbox-min offset within the oriented unit (for placement). */
    members: { pieceId: string; offX: number; offY: number }[];
}

/**
 * A placement unit: one free piece, or several pieces "kept together" as a
 * rigid cluster. The packer treats it as a single body; on placement it
 * expands to one Placement per member piece.
 */
interface PrepUnit {
    unitId: string;
    pieceIds: string[];
    areaMm2: number;
    orientations: Orientation[];
}

/** Deterministic PRNG so a given seed always reproduces the same layout. */
function mulberry32(seed: number): () => number {
    let a = seed >>> 0;
    return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

function rotationAngles(stepDeg: number): number[] {
    if (stepDeg <= 0) return [0];
    const out: number[] = [];
    for (let a = 0; a < 360; a += stepDeg) out.push(a);
    return out;
}

/** Group pieces into placement units, preserving input order of first sight. */
function buildUnits(
    pieces: NestPiece[],
): { unitId: string; members: NestPiece[] }[] {
    const order: string[] = [];
    const byKey = new Map<string, NestPiece[]>();
    for (const p of pieces) {
        const key = p.clusterId ? `c:${p.clusterId}` : `s:${p.id}`;
        let arr = byKey.get(key);
        if (!arr) {
            arr = [];
            byKey.set(key, arr);
            order.push(key);
        }
        arr.push(p);
    }
    return order.map((key) => {
        const members = byKey.get(key)!;
        return { unitId: members[0].clusterId ?? members[0].id, members };
    });
}

function prepare(
    pieces: NestPiece[],
    config: NestConfig,
    usableCols: number,
    usableRows: number,
): { prepped: PrepUnit[]; unplacedPieceIds: string[] } {
    const res = config.resolutionMm;
    const dil = config.gapMm > 0 ? Math.ceil(config.gapMm / res) : 0;
    const angles = rotationAngles(config.rotationStepDeg);
    const prepped: PrepUnit[] = [];
    const unplacedPieceIds: string[] = [];

    for (const unit of buildUnits(pieces)) {
        const orientations: Orientation[] = [];
        for (const deg of angles) {
            const o = transformClusterRings(unit.members, deg);
            const wCells = Math.max(1, Math.ceil(o.widthMm / res - 1e-9));
            const hCells = Math.max(1, Math.ceil(o.heightMm / res - 1e-9));
            if (wCells > usableCols || hCells > usableRows) continue;
            const rings = config.allowHoleNesting ? o.rings : o.outers;
            const solid = rasterizeRings(rings, o.widthMm, o.heightMm, res);
            const solidRuns = runsFromMask(solid);
            const dilatedRuns =
                dil > 0 ? runsFromMask(dilateMask(solid, dil)) : solidRuns;
            orientations.push({
                rotationDeg: deg,
                wMm: o.widthMm,
                hMm: o.heightMm,
                wCells,
                hCells,
                solidRuns,
                dilatedRuns,
                dilCells: dil,
                members: o.members,
            });
        }
        if (orientations.length === 0) {
            // The unit doesn't fit an empty sheet in any rotation.
            unplacedPieceIds.push(...unit.members.map((m) => m.id));
        } else {
            prepped.push({
                unitId: unit.unitId,
                pieceIds: unit.members.map((m) => m.id),
                areaMm2: unit.members.reduce((a, m) => a + m.areaMm2, 0),
                orientations,
            });
        }
    }
    return { prepped, unplacedPieceIds };
}

/**
 * One sheet's occupancy: per row, a flat sorted list of disjoint half-open
 * cell intervals [s0, e0, s1, e1, …] of SOLID (un-dilated) placed material.
 */
type OccRows = number[][];

function newSheet(usableRows: number): OccRows {
    const rows: OccRows = new Array(usableRows);
    for (let i = 0; i < usableRows; i++) rows[i] = [];
    return rows;
}

/** End of the first interval intersecting [a, b), or -1. */
function firstHitEnd(row: number[], a: number, b: number): number {
    const n = row.length >> 1;
    let lo = 0;
    let hi = n;
    // First interval whose end > a.
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (row[2 * mid + 1] > a) hi = mid;
        else lo = mid + 1;
    }
    if (lo < n && row[2 * lo] < b) return row[2 * lo + 1];
    return -1;
}

/** Insert [s, e) into a row, merging overlapping/touching intervals. */
function insertRun(row: number[], s: number, e: number): void {
    if (e <= s) return;
    const n = row.length >> 1;
    let lo = 0;
    let hi = n;
    while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (row[2 * mid + 1] >= s) hi = mid;
        else lo = mid + 1;
    }
    // Intervals from lo onward may overlap/touch [s, e).
    let mergedS = s;
    let mergedE = e;
    let last = lo;
    while (last < n && row[2 * last] <= mergedE) {
        mergedS = Math.min(mergedS, row[2 * last]);
        mergedE = Math.max(mergedE, row[2 * last + 1]);
        last++;
    }
    row.splice(2 * lo, 2 * (last - lo), mergedS, mergedE);
}

/**
 * Smallest feasible x for orientation `o` on row `y`, or -1. Sweeps left to
 * right; every collision jumps x forward so the colliding run clears the
 * blocking interval — never cell-by-cell stepping.
 */
function feasibleX(
    occ: OccRows,
    o: Orientation,
    y: number,
    usableCols: number,
    usableRows: number,
): number {
    const maxX = usableCols - o.wCells;
    if (maxX < 0) return -1;
    const g = o.dilCells;
    const dRows = o.dilatedRuns;
    let x = 0;
    outer: while (x <= maxX) {
        for (let rd = 0; rd < dRows.length; rd++) {
            const occY = y - g + rd;
            if (occY < 0 || occY >= usableRows) continue;
            const row = occ[occY];
            if (row.length === 0) continue;
            const runs = dRows[rd];
            for (let k = 0; k < runs.length; k += 2) {
                const rawA = x - g + runs[k];
                const rawB = x - g + runs[k + 1];
                const a = rawA < 0 ? 0 : rawA;
                const b = rawB > usableCols ? usableCols : rawB;
                if (a >= b) continue;
                const hitEnd = firstHitEnd(row, a, b);
                if (hitEnd >= 0) {
                    // Jump so THIS run starts just past the blocking interval.
                    const push = hitEnd - rawA;
                    x += push > 1 ? push : 1;
                    continue outer;
                }
            }
        }
        return x;
    }
    return -1;
}

interface FoundSpot {
    x: number;
    y: number;
    o: Orientation;
}

function findPlacement(
    occ: OccRows,
    prep: PrepUnit,
    usableCols: number,
    usableRows: number,
): FoundSpot | null {
    for (let y = 0; y < usableRows; y++) {
        let best: FoundSpot | null = null;
        for (const o of prep.orientations) {
            if (y + o.hCells > usableRows) continue;
            const x = feasibleX(occ, o, y, usableCols, usableRows);
            if (x >= 0 && (best === null || x < best.x)) best = { x, y, o };
        }
        if (best) return best;
    }
    return null;
}

function writePlacement(occ: OccRows, spot: FoundSpot, usableRows: number): void {
    const rows = spot.o.solidRuns;
    for (let r = 0; r < rows.length; r++) {
        const occY = spot.y + r;
        if (occY < 0 || occY >= usableRows) continue;
        const runs = rows[r];
        for (let k = 0; k < runs.length; k += 2) {
            insertRun(occ[occY], spot.x + runs[k], spot.x + runs[k + 1]);
        }
    }
}

function pack(
    order: PrepUnit[],
    config: NestConfig,
    usableCols: number,
    usableRows: number,
    alwaysUnplaced: string[],
): NestSolution {
    const res = config.resolutionMm;
    const placements: Placement[] = [];
    const sheetOccs: OccRows[] = [];
    // Per-sheet extents + areas for stats/score.
    const ext: Array<{
        minX: number;
        minY: number;
        maxX: number;
        maxY: number;
        area: number;
        count: number;
    }> = [];
    const overflow: string[] = [];

    for (const prep of order) {
        let spot: FoundSpot | null = null;
        let sheetIndex = -1;
        for (let s = 0; s < sheetOccs.length; s++) {
            spot = findPlacement(sheetOccs[s], prep, usableCols, usableRows);
            if (spot) {
                sheetIndex = s;
                break;
            }
        }
        if (!spot) {
            if (sheetOccs.length >= config.maxSheets) {
                overflow.push(...prep.pieceIds);
                continue;
            }
            sheetOccs.push(newSheet(usableRows));
            ext.push({
                minX: Infinity,
                minY: Infinity,
                maxX: -Infinity,
                maxY: -Infinity,
                area: 0,
                count: 0,
            });
            sheetIndex = sheetOccs.length - 1;
            spot = findPlacement(sheetOccs[sheetIndex], prep, usableCols, usableRows);
            if (!spot) {
                // Cannot happen: prepare() proved an orientation fits an
                // empty sheet. Defensive all the same.
                overflow.push(...prep.pieceIds);
                continue;
            }
        }
        writePlacement(sheetOccs[sheetIndex], spot, usableRows);
        const unitXMm = config.marginMm + spot.x * res;
        const unitYMm = config.marginMm + spot.y * res;
        // Expand the unit into one placement per member; a member's bbox-min
        // lands at the unit origin plus its offset within the oriented unit.
        for (const m of spot.o.members) {
            placements.push({
                pieceId: m.pieceId,
                sheetIndex,
                xMm: unitXMm + m.offX,
                yMm: unitYMm + m.offY,
                rotationDeg: spot.o.rotationDeg,
            });
        }
        const e = ext[sheetIndex];
        e.minX = Math.min(e.minX, unitXMm);
        e.minY = Math.min(e.minY, unitYMm);
        e.maxX = Math.max(e.maxX, unitXMm + spot.o.wMm);
        e.maxY = Math.max(e.maxY, unitYMm + spot.o.hMm);
        e.area += prep.areaMm2;
        e.count += spot.o.members.length;
    }

    const sheetArea = config.sheetWidthMm * config.sheetHeightMm;
    const sheets: SheetStats[] = ext.map((e, i) => ({
        index: i,
        pieceCount: e.count,
        utilisation: sheetArea > 0 ? e.area / sheetArea : 0,
        usedWidthMm: e.count > 0 ? e.maxX - e.minX : 0,
        usedHeightMm: e.count > 0 ? e.maxY - e.minY : 0,
    }));

    // Score: fewer sheets first, then the smallest footprint on the LAST
    // sheet (keeps the biggest single off-cut usable), then total height as
    // a mild tie-break so flatter packs win.
    const last = ext[ext.length - 1];
    const lastFootprint =
        last && last.count > 0
            ? (last.maxX - last.minX) * (last.maxY - last.minY)
            : 0;
    let heightSum = 0;
    for (const e of ext) heightSum += e.count > 0 ? e.maxY : 0;
    const score =
        (sheetOccs.length > 0 ? sheetOccs.length - 1 : 0) * sheetArea +
        lastFootprint +
        heightSum * 1e-6 +
        overflow.length * sheetArea * 1000;

    return {
        placements,
        sheets,
        unplacedPieceIds: [...alwaysUnplaced, ...overflow],
        iteration: 0,
        score,
    };
}

function mutateOrder(order: PrepUnit[], rng: () => number): PrepUnit[] {
    const out = order.slice();
    if (out.length < 2) return out;
    const i = Math.floor(rng() * out.length);
    let j = Math.floor(rng() * out.length);
    if (j === i) j = (j + 1) % out.length;
    if (rng() < 0.5) {
        const t = out[i];
        out[i] = out[j];
        out[j] = t;
    } else {
        const [moved] = out.splice(i, 1);
        out.splice(j, 0, moved);
    }
    return out;
}

export interface NestRunOptions {
    iterations: number;
    seed: number;
}

/**
 * The full nesting run as a generator: yields the first greedy solution,
 * then every improvement plus per-iteration progress. Returns the best
 * solution found (or null when nothing was nestable).
 */
export function* runNest(
    pieces: NestPiece[],
    config: NestConfig,
    opts: NestRunOptions,
): Generator<NestProgress, NestSolution | null, void> {
    const res = config.resolutionMm;
    const usableCols = Math.floor(
        (config.sheetWidthMm - 2 * config.marginMm) / res,
    );
    const usableRows = Math.floor(
        (config.sheetHeightMm - 2 * config.marginMm) / res,
    );
    if (usableCols <= 0 || usableRows <= 0 || pieces.length === 0) {
        const empty: NestSolution = {
            placements: [],
            sheets: [],
            unplacedPieceIds: pieces.map((p) => p.id),
            iteration: 0,
            score: Number.MAX_VALUE,
        };
        yield { type: 'solution', solution: empty };
        return empty;
    }

    const { prepped, unplacedPieceIds } = prepare(
        pieces,
        config,
        usableCols,
        usableRows,
    );

    // First pass: biggest material first — the classic greedy order.
    const initial = prepped
        .slice()
        .sort(
            (a, b) =>
                b.areaMm2 - a.areaMm2 || a.unitId.localeCompare(b.unitId),
        );
    let bestOrder = initial;
    let best = pack(initial, config, usableCols, usableRows, unplacedPieceIds);
    best.iteration = 0;
    yield { type: 'solution', solution: best };

    const rng = mulberry32(opts.seed);
    for (let iter = 1; iter <= opts.iterations; iter++) {
        const order = mutateOrder(bestOrder, rng);
        const sol = pack(order, config, usableCols, usableRows, unplacedPieceIds);
        sol.iteration = iter;
        if (sol.score < best.score) {
            best = sol;
            bestOrder = order;
            yield { type: 'solution', solution: sol };
        }
        yield { type: 'progress', iteration: iter, totalIterations: opts.iterations };
    }
    return best;
}

/** Convenience for tests + synchronous callers: just the first greedy pack. */
export function nestOnce(pieces: NestPiece[], config: NestConfig): NestSolution {
    const gen = runNest(pieces, config, { iterations: 0, seed: 1 });
    let solution: NestSolution | null = null;
    for (const ev of gen) {
        if (ev.type === 'solution') solution = ev.solution;
    }
    return (
        solution ?? {
            placements: [],
            sheets: [],
            unplacedPieceIds: pieces.map((p) => p.id),
            iteration: 0,
            score: Number.MAX_VALUE,
        }
    );
}
