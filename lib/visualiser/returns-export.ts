/**
 * Built-up returns → combined nest SVG (faces + return strips, one file).
 *
 * Faces and returns are always cut from the same brass, so "Send to nester"
 * hands the acrylic nester ONE SVG carrying both: the letter faces (with their
 * counters, which the nester re-reads as holes) under a `FACES` group, and one
 * rectangle per welded return strip (developed length × build-up depth) under
 * a `RETURNS` group. The two groups give the nester clean, hoverable section
 * labels while every piece still packs freely on the sheet.
 *
 * The strips are tiled in shelves strictly BELOW the faces' bounding box so no
 * rectangle ever sits inside a face outline — otherwise the nester's
 * even-odd containment would mistake it for a counter/hole. True mm
 * (1 user unit = 1 mm) so any CAM import reads real size. DOM-free string
 * building, so it's unit-testable.
 */

import type { ReturnsAnalysis, Pt } from './returns';

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

function pathD(points: Pt[], closed: boolean): string {
    if (points.length < 2) return '';
    const [first, ...rest] = points;
    return (
        `M ${f(first[0])} ${f(first[1])} ` +
        rest.map(([x, y]) => `L ${f(x)} ${f(y)}`).join(' ') +
        (closed ? ' Z' : '')
    );
}

export interface ReturnsNestSvgInput {
    analysis: ReturnsAnalysis;
    /** Build-up depth = the flat width of every return strip (mm). */
    returnDepthMm: number;
    /** File comment, e.g. "ACME — faces + returns". */
    title: string;
}

export function buildReturnsNestSvg({
    analysis,
    returnDepthMm,
    title,
}: ReturnsNestSvgInput): string {
    const fb = analysis.bbox;
    const depth = Math.max(1, returnDepthMm);

    const faceEls = analysis.contours
        .map((c) => pathD(c.points, c.closed))
        .filter((d) => d.length > 0)
        .map(
            (d) =>
                `    <path d="${d}" fill="none" stroke="#000000" stroke-width="0.1"/>`,
        );

    // One rectangle per welded strip, tiled in shelves under the faces.
    const strips = analysis.contours.flatMap((c) => c.strips);
    const gap = Math.max(5, depth * 0.4);
    const rowWidth = Math.max(fb.maxX - fb.minX, 1200);
    let x = fb.minX;
    let y = fb.maxY + gap * 2;
    let contentMaxX = fb.maxX;
    let contentMaxY = y;
    const rectEls: string[] = [];
    for (const s of strips) {
        const w = Math.max(1, s.lengthMm);
        if (x > fb.minX && x + w > fb.minX + rowWidth) {
            x = fb.minX;
            y += depth + gap;
        }
        rectEls.push(
            `    <rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(depth)}" fill="none" stroke="#000000" stroke-width="0.1"/>`,
        );
        x += w + gap;
        contentMaxX = Math.max(contentMaxX, x);
        contentMaxY = Math.max(contentMaxY, y + depth);
    }

    const minX = fb.minX;
    const minY = fb.minY;
    const W = Math.max(1, Math.ceil(contentMaxX - minX));
    const H = Math.max(1, Math.ceil(contentMaxY - minY));

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<!-- ${esc(title)} — Onesign Odysseus built-up returns. 1 unit = 1 mm. FACES = letter faces; RETURNS = side-wall strips (length × ${f(depth)} mm depth). -->`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="${W}mm" height="${H}mm" viewBox="${f(minX)} ${f(minY)} ${W} ${H}">`,
        '  <g id="FACES">',
        ...faceEls,
        '  </g>',
        '  <g id="RETURNS">',
        ...rectEls,
        '  </g>',
        '</svg>',
        '',
    ].join('\n');
}
