/**
 * Filled "display" drawings for the production pack — what each piece actually
 * LOOKS like, not the hairline CAM cut path. Renders the material shapes FILLED
 * in their real material colour (the same colour the backshop reads off), with
 * counters punched out (even-odd) and a contrasting background so a light fill
 * (white/opal/brass) still reads when printed on white paper.
 *
 * Pure + framework-neutral (no DOM) so it's unit-testable. True mm (1 user unit
 * = 1 mm); callers feed the dimensions straight into the pack's technical block
 * so the print view draws sensible overall dimension lines.
 */

import type { FlatPath } from './types';

export interface DisplayPiece {
    path: FlatPath;
    holes?: FlatPath[];
}

export interface DisplayLayer {
    pieces: DisplayPiece[];
    /** Fill colour (hex) — the material colour. */
    fill: string;
}

export interface FilledSvg {
    svg: string;
    widthMm: number;
    heightMm: number;
}

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

/** Relative luminance (0 dark … 1 light) of a #rrggbb / #rgb colour. */
export function luminance(hex: string): number {
    const h = hex.replace('#', '').trim();
    const full =
        h.length === 3
            ? h.split('').map((c) => c + c).join('')
            : h.padEnd(6, '0').slice(0, 6);
    const r = parseInt(full.slice(0, 2), 16) / 255;
    const g = parseInt(full.slice(2, 4), 16) / 255;
    const b = parseInt(full.slice(4, 6), 16) / 255;
    // Perceptual weights — good enough for a contrast decision.
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** A background that contrasts with the fill so it always reads on paper. */
export function contrastingBackground(fill: string): string {
    return luminance(fill) > 0.62 ? '#262b30' : '#f4f6f7';
}

function ringD(points: Array<[number, number]>): string {
    if (points.length < 2) return '';
    const [first, ...rest] = points;
    return (
        `M ${f(first[0])} ${f(first[1])} ` +
        rest.map(([x, y]) => `L ${f(x)} ${f(y)}`).join(' ') +
        ' Z'
    );
}

/** One piece → a compound path (outer + counters) punched even-odd. */
function pieceD(piece: DisplayPiece): string {
    const outer = ringD(piece.path.points);
    const holes = (piece.holes ?? []).map((h) => ringD(h.points)).filter(Boolean);
    return [outer, ...holes].filter(Boolean).join(' ');
}

function bboxOfLayers(layers: DisplayLayer[]) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const layer of layers) {
        for (const piece of layer.pieces) {
            for (const ring of [piece.path, ...(piece.holes ?? [])]) {
                for (const [x, y] of ring.points) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return { minX, minY, maxX, maxY };
}

/**
 * Render a set of material layers as a filled, on-brand drawing. The first
 * layer's fill drives the auto background unless `background` is given (e.g. the
 * panel colour for a whole-sign face). Hairline same-tone stroke keeps thin
 * shapes from disappearing.
 */
export function buildFilledSvg(input: {
    layers: DisplayLayer[];
    /** Explicit background; omit for an auto contrast pick. `null` = none. */
    background?: string | null;
    padMm?: number;
    title?: string;
}): FilledSvg {
    const layers = input.layers.filter((l) => l.pieces.length > 0);
    const bb = bboxOfLayers(layers);
    const pad = input.padMm ?? 12;
    const x = bb.minX - pad;
    const y = bb.minY - pad;
    const w = Math.max(1, bb.maxX - bb.minX + pad * 2);
    const h = Math.max(1, bb.maxY - bb.minY + pad * 2);

    const bg =
        input.background === undefined
            ? contrastingBackground(layers[0]?.fill ?? '#888888')
            : input.background;

    const els: string[] = [];
    if (bg) {
        els.push(
            `  <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${esc(bg)}"/>`,
        );
    }
    for (const layer of layers) {
        for (const piece of layer.pieces) {
            const d = pieceD(piece);
            if (!d) continue;
            els.push(
                `  <path d="${d}" fill="${esc(layer.fill)}" fill-rule="evenodd" stroke="${esc(layer.fill)}" stroke-width="0.25"/>`,
            );
        }
    }

    const svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        input.title ? `<!-- ${esc(input.title)} -->` : '',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w)}mm" height="${f(h)}mm" viewBox="${f(x)} ${f(y)} ${f(w)} ${f(h)}">`,
        ...els,
        '</svg>',
        '',
    ]
        .filter(Boolean)
        .join('\n');

    return {
        svg,
        widthMm: Math.round(bb.maxX - bb.minX),
        heightMm: Math.round(bb.maxY - bb.minY),
    };
}

/**
 * A single filled rectangle — the opal backing sheet's cut blank. Sized to the
 * lit area plus a margin so the diffuser overlaps every illuminated piece.
 */
export function buildRectSvg(input: {
    widthMm: number;
    heightMm: number;
    fill?: string;
    title?: string;
}): FilledSvg {
    const w = Math.max(1, input.widthMm);
    const h = Math.max(1, input.heightMm);
    const fill = input.fill ?? '#eef2f0';
    const pad = 10;
    const svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        input.title ? `<!-- ${esc(input.title)} -->` : '',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${f(w + pad * 2)}mm" height="${f(h + pad * 2)}mm" viewBox="0 0 ${f(w + pad * 2)} ${f(h + pad * 2)}">`,
        `  <rect x="${f(pad)}" y="${f(pad)}" width="${f(w)}" height="${f(h)}" fill="${esc(fill)}" stroke="#9aa3a8" stroke-width="0.5"/>`,
        '</svg>',
        '',
    ]
        .filter(Boolean)
        .join('\n');
    return { svg, widthMm: Math.round(w), heightMm: Math.round(h) };
}
