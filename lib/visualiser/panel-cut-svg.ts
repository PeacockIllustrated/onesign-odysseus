/**
 * Unfolded aluminium-tray CUT drawing for the production pack.
 *
 * The tray is a folded sheet-metal part; its works drawing is the flat
 * DEVELOPMENT — the cruciform blank (face + return flaps + lips) with the
 * apertures / push-through holes / fixings cut through it and the bend lines
 * marked. This renders that blank as a filled SVG (the panel colour, holes
 * punched even-odd) so it prints in colour like the rest of the pack — the same
 * geometry the reference/production PDFs draw, mirrored here as a vector the
 * pack can embed.
 *
 * Pure + DOM-free (matches the PDF's section layout: segments/folds are local
 * to each section and offset by layoutOriginXMm; the cut holes are already in
 * global layout coords). Unit-tested.
 */

import { outlinePerimeter } from './geometry';
import { contrastingBackground } from './piece-display';
import type { FlatPath, SectionedExport } from './types';

export interface PanelCutSvg {
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

function ringD(points: Array<[number, number]>, dx = 0): string {
    if (points.length < 2) return '';
    const [first, ...rest] = points;
    return (
        `M ${f(first[0] + dx)} ${f(first[1])} ` +
        rest.map(([x, y]) => `L ${f(x + dx)} ${f(y)}`).join(' ') +
        ' Z'
    );
}

/**
 * Build the unfolded tray blank. `holesBySection[i]` is every ring cut through
 * section i's face (apertures + their counters/islands + push-through keyline +
 * fixings + cable holes), in global layout coords. They go into one compound
 * path with the blank perimeter and are filled even-odd, so a counter nested
 * inside its letter reads as a SOLID island (panel that the machine cuts first
 * and leaves in place), while top-level rings read as holes.
 */
export function buildPanelDevelopmentSvg(input: {
    sectionExport: SectionedExport;
    holesBySection: FlatPath[][];
    panelColor: string;
    title?: string;
}): PanelCutSvg {
    const { sectionExport, holesBySection, panelColor } = input;

    // Tight bounds over every section blank (segments + ox) and every hole.
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    };
    sectionExport.sections.forEach((section) => {
        const ox = section.layoutOriginXMm;
        for (const seg of section.development.segments) {
            grow(seg.xMm + ox, seg.yMm);
            grow(seg.xMm + ox + seg.wMm, seg.yMm + seg.hMm);
        }
    });
    holesBySection.forEach((list) => {
        for (const p of list ?? []) for (const [x, y] of p.points) grow(x, y);
    });
    if (!Number.isFinite(minX)) {
        minX = 0; minY = 0; maxX = 1; maxY = 1;
    }
    const pad = 14;
    const vx = minX - pad;
    const vy = minY - pad;
    const vw = Math.max(1, maxX - minX + pad * 2);
    const vh = Math.max(1, maxY - minY + pad * 2);

    const cut = '#2b2f33';
    const fold = '#c0392b';
    const els: string[] = [
        `  <rect x="${f(vx)}" y="${f(vy)}" width="${f(vw)}" height="${f(vh)}" fill="${esc(contrastingBackground(panelColor))}"/>`,
    ];

    sectionExport.sections.forEach((section, i) => {
        const ox = section.layoutOriginXMm;
        // Outer blank outline (cruciform). Fall back to the segment rects if the
        // perimeter can't be traced.
        const perimeter = outlinePerimeter(section.development);
        let outerD = '';
        if (perimeter && perimeter.points.length >= 3) {
            outerD = ringD(perimeter.points, ox);
        } else {
            outerD = section.development.segments
                .map((seg) =>
                    ringD(
                        [
                            [seg.xMm, seg.yMm],
                            [seg.xMm + seg.wMm, seg.yMm],
                            [seg.xMm + seg.wMm, seg.yMm + seg.hMm],
                            [seg.xMm, seg.yMm + seg.hMm],
                        ],
                        ox,
                    ),
                )
                .join(' ');
        }
        // Holes are already global → no ox.
        const holeD = (holesBySection[i] ?? [])
            .filter((p) => p.points.length >= 3)
            .map((p) => ringD(p.points))
            .join(' ');

        // Filled blank, apertures punched even-odd, cut line on top.
        els.push(
            `  <path d="${outerD}${holeD ? ' ' + holeD : ''}" fill="${esc(panelColor)}" fill-rule="evenodd" stroke="${cut}" stroke-width="0.4"/>`,
        );

        // Bend lines — dashed, the way the shop reads a fold.
        for (const fl of section.development.foldLines) {
            els.push(
                `  <line x1="${f(fl.x1 + ox)}" y1="${f(fl.y1)}" x2="${f(fl.x2 + ox)}" y2="${f(fl.y2)}" stroke="${fold}" stroke-width="0.5" stroke-dasharray="6 4"/>`,
            );
        }
    });

    const svg = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        input.title ? `<!-- ${esc(input.title)} — unfolded tray blank. 1 unit = 1 mm. -->` : '',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${f(vw)}mm" height="${f(vh)}mm" viewBox="${f(vx)} ${f(vy)} ${f(vw)} ${f(vh)}">`,
        ...els,
        '</svg>',
        '',
    ]
        .filter(Boolean)
        .join('\n');

    return {
        svg,
        widthMm: Math.round(sectionExport.totalLayoutWMm || maxX - minX),
        heightMm: Math.round(sectionExport.totalLayoutHMm || maxY - minY),
    };
}
