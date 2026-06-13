/**
 * Wiring-diagram symbols (IEC 60617 / BS 3939 style), drawn from scratch.
 *
 * The IEC 60617 database artwork is copyright IEC, but the symbol *conventions*
 * (a supply block, a terminal, a junction, a fuse, an earth) are not — so these
 * are our own clean, themeable vector primitives in that style. Each symbol is
 * defined in its own little mm coordinate box; `drawSymbol` blits it to a jsPDF
 * doc at a position, scale and colour. The primitive list is pure data, so the
 * catalogue is Vitest-covered without touching jsPDF.
 */

import type { jsPDF } from 'jspdf';

export type SymPrim =
    | { k: 'line'; x1: number; y1: number; x2: number; y2: number }
    | { k: 'rect'; x: number; y: number; w: number; h: number; fill?: boolean }
    | { k: 'circle'; cx: number; cy: number; r: number; fill?: boolean }
    | { k: 'text'; x: number; y: number; t: string; size?: number; align?: 'left' | 'center' | 'right' };

export interface WiringSymbol {
    /** Canonical box size (mm at scale 1). */
    w: number;
    h: number;
    prims: SymPrim[];
}

export type SymbolName = 'terminal' | 'junction' | 'fuse' | 'earth' | 'mains';

/** The atomic symbols. Driver blocks are composed in the PDF (variable size +
 *  output count); these are the fixed glyphs. */
export const SYMBOLS: Record<SymbolName, WiringSymbol> = {
    // Open circle = an unconnected terminal / driver output.
    terminal: { w: 4, h: 4, prims: [{ k: 'circle', cx: 2, cy: 2, r: 1.6 }] },
    // Filled dot = a connected junction.
    junction: { w: 3, h: 3, prims: [{ k: 'circle', cx: 1.5, cy: 1.5, r: 1.2, fill: true }] },
    // Rectangle with a line through it = a fuse (BS 3939).
    fuse: {
        w: 10,
        h: 4,
        prims: [
            { k: 'rect', x: 0, y: 0, w: 10, h: 4 },
            { k: 'line', x1: 0, y1: 2, x2: 10, y2: 2 },
        ],
    },
    // Stem + three diminishing bars = protective earth.
    earth: {
        w: 8,
        h: 8,
        prims: [
            { k: 'line', x1: 4, y1: 0, x2: 4, y2: 4 },
            { k: 'line', x1: 0, y1: 4, x2: 8, y2: 4 },
            { k: 'line', x1: 1.5, y1: 6, x2: 6.5, y2: 6 },
            { k: 'line', x1: 3, y1: 8, x2: 5, y2: 8 },
        ],
    },
    // Boxed "230 V ~" = the mains supply entry.
    mains: {
        w: 16,
        h: 7,
        prims: [
            { k: 'rect', x: 0, y: 0, w: 16, h: 7 },
            { k: 'text', x: 8, y: 4.6, t: '230 V ~', size: 6, align: 'center' },
        ],
    },
};

/** A DC LED driver block: rounded rectangle with an AC~ / DC= divider and a
 *  label, plus the on-edge X positions (in the block's local box) of `outputs`
 *  output terminals along the bottom. */
export function driverBlock(
    w: number,
    h: number,
    outputs: number,
): { prims: SymPrim[]; outputXs: number[]; w: number; h: number } {
    const prims: SymPrim[] = [
        { k: 'rect', x: 0, y: 0, w, h },
        // AC ~ in (top-left) | DC = out (bottom), divider down the middle.
        { k: 'line', x1: w / 2, y1: 1.5, x2: w / 2, y2: h - 1.5 },
        { k: 'text', x: w / 4, y: h / 2 + 1, t: '~', size: 6, align: 'center' },
        { k: 'text', x: (3 * w) / 4, y: h / 2 + 1, t: '=', size: 6, align: 'center' },
    ];
    const n = Math.max(1, outputs);
    const outputXs: number[] = [];
    for (let i = 0; i < n; i++) outputXs.push(((i + 0.5) / n) * w);
    return { prims, outputXs, w, h };
}

/** Draw a symbol's primitives onto a jsPDF doc at (x, y), scaled, in `rgb`. */
export function drawSymbol(
    doc: jsPDF,
    sym: WiringSymbol | { prims: SymPrim[] },
    x: number,
    y: number,
    scale: number,
    rgb: [number, number, number],
): void {
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setFillColor(rgb[0], rgb[1], rgb[2]);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(0.3);
    for (const p of sym.prims) {
        if (p.k === 'line') {
            doc.line(x + p.x1 * scale, y + p.y1 * scale, x + p.x2 * scale, y + p.y2 * scale);
        } else if (p.k === 'rect') {
            doc.rect(x + p.x * scale, y + p.y * scale, p.w * scale, p.h * scale, p.fill ? 'F' : 'S');
        } else if (p.k === 'circle') {
            doc.circle(x + p.cx * scale, y + p.cy * scale, p.r * scale, p.fill ? 'F' : 'S');
        } else if (p.k === 'text') {
            doc.setFontSize(p.size ?? 4);
            doc.text(p.t, x + p.x * scale, y + p.y * scale, { align: p.align ?? 'left' });
        }
    }
}

/** Legend rows for the schedule page. */
export const WIRING_LEGEND: Array<{ name: SymbolName | 'driver' | 'conductor'; label: string }> = [
    { name: 'driver', label: 'LED driver' },
    { name: 'terminal', label: 'Output (≤5 A)' },
    { name: 'conductor', label: 'LV run' },
    { name: 'junction', label: 'Junction' },
    { name: 'mains', label: '230 V mains' },
    { name: 'fuse', label: 'Fuse' },
    { name: 'earth', label: 'Earth' },
];
