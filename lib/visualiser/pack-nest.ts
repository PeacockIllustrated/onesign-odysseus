/**
 * Inline nesting for the production pack — packs a material's pieces onto a
 * panel and renders the packed result as a FILLED drawing (material colour,
 * counters punched), cropped to the smallest panel that holds them with a 5mm
 * border. This is the pack's cut-layout drawing (run on the spot if the
 * operator hasn't sent it to the nester yet), NOT the hairline CAM file the
 * nester page produces.
 *
 * Wraps the same engine the nester page uses (`nestOnce` — a single fast greedy
 * pack). Pure + framework-neutral (the engine is DOM-free) so it's
 * unit-testable; the export bar calls it client-side behind a "Nesting…"
 * status.
 */

import { nestOnce } from '@/lib/nesting/engine';
import { placedPieceRings, ringsToPathData } from '@/lib/nesting/geom';
import type { SheetExportInput } from '@/lib/nesting/svg-export';
import type { NestConfig, NestPiece, Placement, Ring } from '@/lib/nesting/types';
import type { FlatPath } from './types';

export interface NestablePieceInput {
    path: FlatPath;
    holes?: FlatPath[];
}

export interface NestedSheet {
    svg: string;
    widthMm: number;
    heightMm: number;
}

export interface NestedSheets {
    sheets: NestedSheet[];
    sheetCount: number;
    unplaced: number;
}

/** Margin nested INTO the panel edge / the crop border around the result. */
const EDGE_BORDER_MM = 5;

/**
 * Pack config: smallest panel (we crop the result tight), 15° rotation steps,
 * 5mm gap between pieces, 5mm edge border. The working sheet is generous so a
 * normal letter set packs onto one panel; the drawing is then cropped to the
 * pieces.
 */
export const DEFAULT_PACK_NEST_CONFIG: NestConfig = {
    sheetWidthMm: 2440,
    sheetHeightMm: 1220,
    marginMm: EDGE_BORDER_MM,
    gapMm: 5,
    rotationStepDeg: 15,
    allowHoleNesting: false,
    resolutionMm: 3,
    maxSheets: 6,
};

function f(n: number): string {
    const s = n.toFixed(2);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function ringPts(points: Array<[number, number]>): Ring {
    const out = points.map(([x, y]) => [x, y] as [number, number]);
    if (out.length > 1) {
        const a = out[0];
        const b = out[out.length - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) out.pop();
    }
    return out;
}

function shoelace(points: Ring): number {
    let a = 0;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        a += points[j][0] * points[i][1] - points[i][0] * points[j][1];
    }
    return Math.abs(a) / 2;
}

function bboxOf(rings: Ring[]) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const r of rings) {
        for (const [x, y] of r) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    return { minX, minY, maxX, maxY };
}

function toNestPiece(piece: NestablePieceInput, i: number, groupId: string): NestPiece {
    const outer = ringPts(piece.path.points);
    const holes = (piece.holes ?? []).map((h) => ringPts(h.points));
    const bb = bboxOf([outer]);
    return {
        id: `${groupId}-${i}`,
        label: `${groupId}-${i + 1}`,
        groupId,
        outer,
        holes,
        areaMm2: Math.max(1, shoelace(outer)),
        widthMm: Math.max(1, bb.maxX - bb.minX),
        heightMm: Math.max(1, bb.maxY - bb.minY),
    };
}

/** Render one packed sheet FILLED + cropped to the smallest panel + 5mm border. */
function renderSheet(
    nestPieces: NestPiece[],
    placements: Placement[],
    fill: string,
    title: string,
): NestedSheet | null {
    const byId = new Map(nestPieces.map((p) => [p.id, p]));
    const placed: { outer: Ring; holes: Ring[] }[] = [];
    for (const pl of placements) {
        const piece = byId.get(pl.pieceId);
        if (!piece) continue;
        placed.push(placedPieceRings(piece, pl));
    }
    if (placed.length === 0) return null;

    const all: Ring[] = placed.flatMap((p) => [p.outer, ...p.holes]);
    const bb = bboxOf(all);
    if (!Number.isFinite(bb.minX)) return null;
    // Smallest panel = content bbox + the 5mm edge border on every side.
    const x = bb.minX - EDGE_BORDER_MM;
    const y = bb.minY - EDGE_BORDER_MM;
    const w = bb.maxX - bb.minX + EDGE_BORDER_MM * 2;
    const h = bb.maxY - bb.minY + EDGE_BORDER_MM * 2;

    const body = placed
        .map((p) => ringsToPathData([p.outer, ...p.holes]))
        .filter(Boolean)
        .map(
            (d) =>
                `  <path d="${d}" fill="${esc(fill)}" fill-rule="evenodd" stroke="${esc(fill)}" stroke-width="0.25"/>`,
        );

    const svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<!-- ${esc(title)} — Onesign Odysseus nested panel. 1 unit = 1 mm. -->`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}">`,
        // Smallest-panel boundary.
        `  <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="none" stroke="#9aa3a8" stroke-width="0.5"/>`,
        ...body,
        '</svg>',
        '',
    ].join('\n');

    return { svg, widthMm: Math.round(w), heightMm: Math.round(h) };
}

interface NestResult {
    nestPieces: NestPiece[];
    bySheet: Map<number, Placement[]>;
    sheetIndices: number[];
    config: NestConfig;
    unplaced: number;
}

/** Shared nesting — used by both the filled pack drawing + the CAM cut file. */
function nestFor(
    pieces: NestablePieceInput[],
    opts: { label: string; config?: Partial<NestConfig> },
): NestResult | null {
    if (pieces.length === 0) return null;
    const config: NestConfig = { ...DEFAULT_PACK_NEST_CONFIG, ...opts.config };
    const nestPieces = pieces.map((p, i) => toNestPiece(p, i, opts.label));
    const solution = nestOnce(nestPieces, config);
    const bySheet = new Map<number, Placement[]>();
    for (const pl of solution.placements) {
        (bySheet.get(pl.sheetIndex) ?? bySheet.set(pl.sheetIndex, []).get(pl.sheetIndex)!).push(pl);
    }
    return {
        nestPieces,
        bySheet,
        sheetIndices: [...bySheet.keys()].sort((a, b) => a - b),
        config,
        unplaced: solution.unplacedPieceIds.length,
    };
}

/**
 * Pack the pieces and return one FILLED, smallest-panel drawing per sheet (for
 * the printed pack). Returns `sheets: []` when there's nothing to nest.
 */
export function buildNestedSheets(
    pieces: NestablePieceInput[],
    opts: { label: string; title: string; fill: string; config?: Partial<NestConfig> },
): NestedSheets {
    const n = nestFor(pieces, opts);
    if (!n) return { sheets: [], sheetCount: 0, unplaced: 0 };
    const total = n.sheetIndices.length;
    const sheets: NestedSheet[] = [];
    n.sheetIndices.forEach((idx) => {
        const sheet = renderSheet(
            n.nestPieces,
            n.bySheet.get(idx)!,
            opts.fill,
            total > 1 ? `${opts.title} — panel ${idx + 1} of ${total}` : opts.title,
        );
        if (sheet) sheets.push(sheet);
    });
    return { sheets, sheetCount: sheets.length, unplaced: n.unplaced };
}

export interface NestedSheetGeometry {
    /** Input for buildSheetSvg / buildSheetDxf (the .svg + .dxf cut files). */
    input: SheetExportInput;
    /** Placed piece rings (outer + holes) — for the .pdf cut file. */
    cut: Ring[];
    /** The sheet boundary rectangle (reference). */
    boundary: Ring;
    widthMm: number;
    heightMm: number;
}

/**
 * Pack the pieces and return, per FULL sheet, everything needed to emit the CAM
 * cut file in every format: the buildSheetSvg/Dxf input plus the placed rings
 * (for the PDF). Used by the production-files .zip export. Returns no sheets
 * when there's nothing to nest.
 */
export function nestedSheetGeometry(
    pieces: NestablePieceInput[],
    opts: { label: string; title: string; config?: Partial<NestConfig> },
): { sheets: NestedSheetGeometry[]; unplaced: number } {
    const n = nestFor(pieces, opts);
    if (!n) return { sheets: [], unplaced: 0 };
    const W = n.config.sheetWidthMm;
    const H = n.config.sheetHeightMm;
    const boundary: Ring = [
        [0, 0],
        [W, 0],
        [W, H],
        [0, H],
    ];
    const byId = new Map(n.nestPieces.map((p) => [p.id, p]));
    const total = n.sheetIndices.length;
    const sheets = n.sheetIndices.map((idx) => {
        const placements = n.bySheet.get(idx)!;
        const cut: Ring[] = [];
        for (const pl of placements) {
            const piece = byId.get(pl.pieceId);
            if (!piece) continue;
            const r = placedPieceRings(piece, pl);
            cut.push(r.outer, ...r.holes);
        }
        return {
            input: {
                pieces: n.nestPieces,
                placements,
                config: n.config,
                title: total > 1 ? `${opts.title} — sheet ${idx + 1} of ${total}` : opts.title,
            },
            cut,
            boundary,
            widthMm: W,
            heightMm: H,
        };
    });
    return { sheets, unplaced: n.unplaced };
}
