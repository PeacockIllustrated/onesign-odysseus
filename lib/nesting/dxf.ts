/**
 * Nested-sheet → DXF cut file (AutoCAD R12 dialect).
 *
 * R12 with classic POLYLINE/VERTEX/SEQEND entities is the most universally
 * readable flavour — LightBurn, SheetCam, Trotec JobControl and every CNC
 * post-processor accept it. Units are mm ($INSUNITS = 4) and, because DXF is
 * y-UP while our sheet space is SVG-style y-DOWN, every y is flipped against
 * the sheet height on the way out.
 *
 * Layers:
 *   - CUT   — every piece contour (outer + holes), closed polylines
 *   - SHEET — the sheet boundary rectangle, reference only
 *
 * DOM-free (string building only) so it's unit-tested.
 */

import { placedPieceRings } from './geom';
import type { Ring } from './types';
import type { SheetExportInput } from './svg-export';

function num(n: number): string {
    // Fixed decimals, trailing zeros trimmed — never exponential notation,
    // which some DXF readers reject.
    const s = n.toFixed(4);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function polyline(ring: Ring, layer: string, flipH: number, out: string[]): void {
    if (ring.length < 3) return;
    out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', '1');
    for (const [x, y] of ring) {
        out.push('0', 'VERTEX', '8', layer, '10', num(x), '20', num(flipH - y));
    }
    out.push('0', 'SEQEND');
}

export function buildSheetDxf(input: SheetExportInput): string {
    const { config } = input;
    const W = config.sheetWidthMm;
    const H = config.sheetHeightMm;
    const byId = new Map(input.pieces.map((p) => [p.id, p]));

    const lines: string[] = [
        // ---- header: version + mm units
        '0', 'SECTION', '2', 'HEADER',
        '9', '$ACADVER', '1', 'AC1009',
        '9', '$INSUNITS', '70', '4',
        '0', 'ENDSEC',
        // ---- layer table
        '0', 'SECTION', '2', 'TABLES',
        '0', 'TABLE', '2', 'LAYER', '70', '2',
        '0', 'LAYER', '2', 'CUT', '70', '0', '62', '7', '6', 'CONTINUOUS',
        '0', 'LAYER', '2', 'SHEET', '70', '0', '62', '5', '6', 'CONTINUOUS',
        '0', 'ENDTAB',
        '0', 'ENDSEC',
        // ---- entities
        '0', 'SECTION', '2', 'ENTITIES',
    ];

    // Sheet boundary (reference layer).
    polyline(
        [
            [0, 0],
            [W, 0],
            [W, H],
            [0, H],
        ],
        'SHEET',
        H,
        lines,
    );

    for (const pl of input.placements) {
        const piece = byId.get(pl.pieceId);
        if (!piece) continue;
        const rings = placedPieceRings(piece, pl);
        polyline(rings.outer, 'CUT', H, lines);
        for (const hole of rings.holes) polyline(hole, 'CUT', H, lines);
    }

    lines.push('0', 'ENDSEC', '0', 'EOF');
    return lines.join('\r\n') + '\r\n';
}
