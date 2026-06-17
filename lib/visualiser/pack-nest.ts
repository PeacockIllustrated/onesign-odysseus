/**
 * Inline nesting for the production pack — packs a material's pieces onto a
 * sheet and renders the packed sheet as a cut file, WITHOUT the nesting page or
 * a Web Worker. The pack's "cut file" per piece is the real nested sheet (run
 * on the spot if the operator hasn't sent it to the nester yet).
 *
 * Wraps the same engine the nester page uses (`nestOnce` — a single fast greedy
 * pack) + `buildSheetSvg`. Pure + framework-neutral (the engine is DOM-free) so
 * it's unit-testable; the export bar calls it client-side behind a "Nesting…"
 * status.
 */

import { nestOnce } from '@/lib/nesting/engine';
import { buildSheetSvg } from '@/lib/nesting/svg-export';
import type { NestConfig, NestPiece, Placement } from '@/lib/nesting/types';
import type { FlatPath } from './types';

export interface NestablePieceInput {
    path: FlatPath;
    holes?: FlatPath[];
}

export interface NestedSheets {
    /** One cut-file SVG per packed sheet (true mm). */
    sheets: string[];
    sheetCount: number;
    unplaced: number;
}

/** Default acrylic sheet — overridable per material (brass, etc.). */
export const DEFAULT_PACK_NEST_CONFIG: NestConfig = {
    sheetWidthMm: 2440,
    sheetHeightMm: 1220,
    marginMm: 10,
    gapMm: 6,
    rotationStepDeg: 90,
    allowHoleNesting: false,
    resolutionMm: 3,
    maxSheets: 6,
};

function ring(points: Array<[number, number]>): [number, number][] {
    const out = points.map(([x, y]) => [x, y] as [number, number]);
    // Drop a duplicated closing vertex — the engine works on open rings.
    if (out.length > 1) {
        const a = out[0];
        const b = out[out.length - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
    }
    return out;
}

function shoelace(points: [number, number][]): number {
    let a = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        a += points[j][0] * points[i][1] - points[i][0] * points[j][1];
    }
    return Math.abs(a) / 2;
}

function bbox(points: [number, number][]) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    }
    return { w: maxX - minX, h: maxY - minY };
}

function toNestPiece(piece: NestablePieceInput, i: number, groupId: string): NestPiece {
    const outer = ring(piece.path.points);
    const holes = (piece.holes ?? []).map((h) => ring(h.points));
    const b = bbox(outer);
    return {
        id: `${groupId}-${i}`,
        label: `${groupId}-${i + 1}`,
        groupId,
        outer,
        holes,
        areaMm2: Math.max(1, shoelace(outer)),
        widthMm: Math.max(1, b.w),
        heightMm: Math.max(1, b.h),
    };
}

/**
 * Pack the pieces onto sheets and return one cut-file SVG per sheet. Returns
 * `sheets: []` when there's nothing to nest, so callers can fall back to the
 * un-nested filled display.
 */
export function buildNestedSheets(
    pieces: NestablePieceInput[],
    opts: { label: string; title: string; config?: Partial<NestConfig> },
): NestedSheets {
    if (pieces.length === 0) return { sheets: [], sheetCount: 0, unplaced: 0 };
    const config: NestConfig = { ...DEFAULT_PACK_NEST_CONFIG, ...opts.config };
    const nestPieces = pieces.map((p, i) => toNestPiece(p, i, opts.label));

    const solution = nestOnce(nestPieces, config);

    // Group placements by sheet, in order.
    const bySheet = new Map<number, Placement[]>();
    for (const pl of solution.placements) {
        (bySheet.get(pl.sheetIndex) ?? bySheet.set(pl.sheetIndex, []).get(pl.sheetIndex)!).push(pl);
    }
    const sheetIndices = [...bySheet.keys()].sort((a, b) => a - b);
    const total = sheetIndices.length;
    const sheets = sheetIndices.map((idx) =>
        buildSheetSvg({
            pieces: nestPieces,
            placements: bySheet.get(idx)!,
            config,
            title:
                total > 1
                    ? `${opts.title} — sheet ${idx + 1} of ${total}`
                    : opts.title,
        }),
    );

    return {
        sheets,
        sheetCount: total,
        unplaced: solution.unplacedPieceIds.length,
    };
}
