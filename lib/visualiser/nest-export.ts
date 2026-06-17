/**
 * Generic "pieces → nest SVG" builder (shared by the extra-face + acrylic
 * hand-offs).
 *
 * A nest is ONE material's worth of cut pieces: each piece's outer outline plus
 * its counters, all as separate `<path>` elements under a single named group
 * (e.g. `ACRYLIC` / `BRASS_FACES`). The acrylic nester re-reads the counters as
 * holes via even-odd containment — the same contract the built-up-returns FACES
 * group uses. True mm (1 user unit = 1 mm). DOM-free string building, so it's
 * unit-testable alongside the geometry engines.
 */

import type { FlatPath } from './types';

function f(n: number): string {
    const s = n.toFixed(3);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function pathD(p: FlatPath): string {
    const pts = p.points;
    if (pts.length < 2) return '';
    const [first, ...rest] = pts;
    return (
        `M ${f(first[0])} ${f(first[1])} ` +
        rest.map(([x, y]) => `L ${f(x)} ${f(y)}`).join(' ') +
        (p.closed ? ' Z' : '')
    );
}

/** A cut piece: an outer outline plus any counters (cut as holes). */
export interface NestablePiece {
    path: FlatPath;
    holes?: FlatPath[];
}

/**
 * Build a true-mm nest SVG for one material's pieces under a named group.
 * Returns an empty-but-valid SVG when there are no pieces (callers guard before
 * sending, but this keeps it total).
 */
export function buildNestSvg(
    pieces: NestablePiece[],
    groupId: string,
    title: string,
): string {
    const rings: FlatPath[] = [];
    for (const piece of pieces) {
        rings.push(piece.path);
        for (const h of piece.holes ?? []) rings.push(h);
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const r of rings) {
        for (const [x, y] of r.points) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (!isFinite(minX)) {
        minX = 0;
        minY = 0;
        maxX = 1;
        maxY = 1;
    }

    const W = Math.max(1, Math.ceil(maxX - minX));
    const H = Math.max(1, Math.ceil(maxY - minY));

    const els = rings
        .map((r) => pathD(r))
        .filter((d) => d.length > 0)
        .map(
            (d) =>
                `    <path d="${d}" fill="none" stroke="#000000" stroke-width="0.1"/>`,
        );

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<!-- ${esc(title)} — Onesign Odysseus nest. 1 unit = 1 mm. ${esc(groupId)}: outer outlines + counters; counters re-read as holes. -->`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="${f(minX)} ${f(minY)} ${W} ${H}">`,
        `  <g id="${esc(groupId)}">`,
        ...els,
        '  </g>',
        '</svg>',
        '',
    ].join('\n');
}
