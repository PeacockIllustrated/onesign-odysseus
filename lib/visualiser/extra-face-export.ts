/**
 * Extra metal faces → nest SVG (one material, cut files for the acrylic nester).
 *
 * "Send metal faces to nester" hands the nester ONE SVG of the brass (or other
 * metal) faces: each letter's outer outline plus its counters, all as separate
 * `<path>` elements under a single material-named group (e.g. `BRASS_FACES`).
 * The nester re-reads the counters as holes via even-odd containment — the same
 * contract the built-up-returns FACES group uses (returns-export.ts).
 *
 * True mm (1 user unit = 1 mm) so any CAM import reads real size. DOM-free
 * string building, so it's unit-testable alongside the geometry engines.
 */

import type { ExtraFacePiece, FaceMaterial, FlatPath } from './types';
import { FACE_MATERIALS } from './extra-face';

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

/** Material key → group id, e.g. 'brass' → 'BRASS_FACES'. */
export function faceGroupId(material: FaceMaterial): string {
    return `${material.toUpperCase()}_FACES`;
}

export interface ExtraFaceNestSvgInput {
    pieces: ExtraFacePiece[];
    material: FaceMaterial;
    /** File comment, e.g. "ACME — brass faces". */
    title: string;
}

/**
 * Build the nest SVG for a set of single-material extra-face pieces. Returns
 * an empty-but-valid SVG string when there are no pieces (callers guard before
 * sending, but this keeps it total).
 */
export function buildExtraFaceNestSvg({
    pieces,
    material,
    title,
}: ExtraFaceNestSvgInput): string {
    const spec = FACE_MATERIALS[material];

    // Every ring (outer outlines + counters) contributes to the bbox.
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
        `<!-- ${esc(title)} — Onesign Odysseus extra faces (${esc(spec.label)}). 1 unit = 1 mm. Outer outlines + counters; counters re-read as holes. -->`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="${f(minX)} ${f(minY)} ${W} ${H}">`,
        `  <g id="${faceGroupId(material)}">`,
        ...els,
        '  </g>',
        '</svg>',
        '',
    ].join('\n');
}
