/**
 * Nested-sheet → SVG cut file. TRUE mm: width/height carry mm units and the
 * viewBox is 1 user unit = 1 mm, so any cutter/CAM import reads real size.
 *
 * Layer convention (colour-mapped, like every sign-shop workflow):
 *   - black  #000000 — cut paths (pieces, holes included via even-odd)
 *   - blue   #0000ff — the sheet boundary, reference only, ignore on import
 *
 * Geometry is the same flattened polylines the engine nested — what you see
 * is exactly what cuts. DOM-free (string building only) so it's unit-tested.
 */

import { placedPieceRings, ringsToPathData } from './geom';
import type { NestConfig, NestPiece, Placement } from './types';

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export interface SheetExportInput {
    pieces: NestPiece[];
    /** Placements for ONE sheet (all the same sheetIndex). */
    placements: Placement[];
    config: NestConfig;
    /** Shown in the file comment, e.g. "workwear-fascia — sheet 1 of 2". */
    title: string;
}

export function buildSheetSvg(input: SheetExportInput): string {
    const { config, title } = input;
    const W = config.sheetWidthMm;
    const H = config.sheetHeightMm;
    const byId = new Map(input.pieces.map((p) => [p.id, p]));

    const body: string[] = [];
    for (const pl of input.placements) {
        const piece = byId.get(pl.pieceId);
        if (!piece) continue;
        const rings = placedPieceRings(piece, pl);
        const d = ringsToPathData([rings.outer, ...rings.holes]);
        if (!d) continue;
        body.push(
            `  <path data-piece="${esc(piece.label)}" d="${d}" fill="none" stroke="#000000" stroke-width="0.1" fill-rule="evenodd"/>`,
        );
    }

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<!-- ${esc(title)} — Onesign Odysseus nesting. 1 unit = 1 mm. Black = cut, blue = sheet boundary (reference). -->`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="0 0 ${W} ${H}">`,
        `  <rect x="0" y="0" width="${W}" height="${H}" fill="none" stroke="#0000ff" stroke-width="0.1"/>`,
        ...body,
        '</svg>',
        '',
    ].join('\n');
}
