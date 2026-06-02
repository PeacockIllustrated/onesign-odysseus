/**
 * Neon-flex run-length measurement.
 *
 * Neon flex is bought + bent by the metre, so a quote needs the total length
 * of LED neon for a design. The old workflow was: open the artwork in
 * Illustrator, select each path, read its length off the Object/Document Info
 * panel, and write each one down by hand. This module does that automatically:
 * given the flattened SVG polylines (mm) from `importSvg`, it computes the
 * run length of every path so the tool can annotate the artwork and total it.
 *
 * "Length" here is the geometric length of the path the neon follows — the
 * sum of its segment lengths, plus the closing segment for a closed contour
 * (a filled letter outline the neon traces all the way round). Pure + unit
 * tested; no DOM, no rendering.
 */

import type { FlatPath } from './types';

export interface NeonElement {
    /** 1-based label shown in the annotation + table. */
    index: number;
    /** Run length of this element in millimetres. */
    lengthMm: number;
    /** Closed contour (perimeter measured incl. the closing segment) vs open run. */
    closed: boolean;
    /** Geometric centre of the points — where the callout balloon sits. */
    centroid: [number, number];
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    points: Array<[number, number]>;
    /** Resolved source colour (stroke→fill) for the neon glow, if any. */
    stroke?: string;
}

/** Length of a single path in mm (adds the closing segment when closed). */
export function pathLengthMm(p: FlatPath): number {
    const pts = p.points;
    if (pts.length < 2) return 0;
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    if (p.closed) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        const gap = Math.hypot(b[0] - a[0], b[1] - a[1]);
        // Many closed paths already repeat the first point as the last; only
        // add the closing segment when there's a real gap to close.
        if (gap > 1e-6) len += gap;
    }
    return len;
}

function centroidOf(pts: Array<[number, number]>): [number, number] {
    // Closed contours arrive with the first point repeated as the last; drop
    // it so that vertex isn't double-weighted (which pulls the balloon off
    // centre on low-vertex shapes).
    let n = pts.length;
    if (n > 1) {
        const a = pts[0];
        const b = pts[n - 1];
        if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-6) n--;
    }
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
        x += pts[i][0];
        y += pts[i][1];
    }
    return [x / n, y / n];
}

function bboxOf(pts: Array<[number, number]>) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of pts) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
    }
    return { minX, minY, maxX, maxY };
}

/**
 * Measure every path, drop degenerate ones, and number them in reading order
 * (top rows first, left-to-right within a row). A path shorter than
 * `minLengthMm` is treated as noise from the flattener and skipped.
 */
export function measureNeon(
    paths: FlatPath[],
    minLengthMm = 1,
): NeonElement[] {
    const measured = paths
        .map((p) => {
            const lengthMm = pathLengthMm(p);
            return {
                lengthMm,
                closed: p.closed,
                centroid: centroidOf(p.points),
                bbox: bboxOf(p.points),
                points: p.points,
                stroke: p.stroke,
            };
        })
        .filter((m) => m.lengthMm >= minLengthMm && m.points.length >= 2);

    // Reading-order numbering: band by Y (rows) using half the median element
    // height as the tolerance, then sort left-to-right within each band.
    const heights = measured
        .map((m) => m.bbox.maxY - m.bbox.minY)
        .sort((a, b) => a - b);
    const medianH = heights.length
        ? heights[Math.floor(heights.length / 2)]
        : 0;
    const band = Math.max(1, medianH * 0.5);
    measured.sort((a, b) => {
        const dy = a.centroid[1] - b.centroid[1];
        if (Math.abs(dy) > band) return dy;
        return a.centroid[0] - b.centroid[0];
    });

    return measured.map((m, i) => ({ ...m, index: i + 1 }));
}

/** Total neon run length across every measured element, in mm. */
export function totalLengthMm(els: NeonElement[]): number {
    return els.reduce((sum, e) => sum + e.lengthMm, 0);
}

const NAMED_COLOURS: Record<string, [number, number, number]> = {
    black: [0, 0, 0],
    white: [255, 255, 255],
    red: [255, 0, 0],
    lime: [0, 255, 0],
    green: [0, 128, 0],
    blue: [0, 0, 255],
    yellow: [255, 255, 0],
    cyan: [0, 255, 255],
    aqua: [0, 255, 255],
    magenta: [255, 0, 255],
    fuchsia: [255, 0, 255],
    gray: [128, 128, 128],
    grey: [128, 128, 128],
    silver: [192, 192, 192],
    maroon: [128, 0, 0],
    olive: [128, 128, 0],
    navy: [0, 0, 128],
    teal: [0, 128, 128],
    purple: [128, 0, 128],
    orange: [255, 165, 0],
    pink: [255, 192, 203],
};

/**
 * Parse a CSS colour (hex #rgb/#rrggbb, rgb()/rgba() with numbers or %, or a
 * common named colour) to [r,g,b] 0–255. Returns null for anything it can't
 * resolve (gradients, currentColor, unknown names) so callers fall back. Shared
 * by the colour grouping and the PDF so they always agree.
 */
export function parseCssColor(
    c: string | undefined | null,
): [number, number, number] | null {
    if (!c) return null;
    const s = c.trim().toLowerCase();
    if (NAMED_COLOURS[s]) return NAMED_COLOURS[s];
    const hex = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/.exec(s);
    if (hex) {
        let h = hex[1];
        if (h.length === 3)
            h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
        return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16),
        ];
    }
    const rgb = /rgba?\(([^)]+)\)/.exec(s);
    if (rgb) {
        const parts = rgb[1]
            .split(',')
            .slice(0, 3)
            .map((p) => {
                const t = p.trim();
                const n = t.endsWith('%')
                    ? (parseFloat(t) * 255) / 100
                    : parseFloat(t);
                return Math.max(0, Math.min(255, Math.round(n)));
            });
        if (parts.length === 3 && parts.every((n) => Number.isFinite(n)))
            return parts as [number, number, number];
    }
    return null;
}

/** Canonical key for grouping colours: #rrggbb when parseable, else the raw lowercased string. */
export function colourKey(c: string | undefined): string {
    const rgb = parseCssColor(c);
    if (rgb)
        return (
            '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('')
        );
    return (c ?? '').trim().toLowerCase();
}

export interface ColourTotal {
    /** Source colour string (undefined when the SVG carried none). */
    color: string | undefined;
    runs: number;
    lengthMm: number;
}

/**
 * Group runs by colour and total each — neon flex is ordered per colour, so
 * this is the "how much of each colour to buy" breakdown. Sorted longest first;
 * runs with no SVG colour collapse into a single "not set" bucket.
 */
export function colourBreakdown(els: NeonElement[]): ColourTotal[] {
    const map = new Map<string, ColourTotal>();
    for (const e of els) {
        // Canonical key so #f00 / #ff0000 / rgb(255,0,0) / 'red' collapse into
        // one order line instead of several near-duplicate rows.
        const key = colourKey(e.stroke);
        const cur = map.get(key) ?? { color: e.stroke, runs: 0, lengthMm: 0 };
        cur.runs += 1;
        cur.lengthMm += e.lengthMm;
        map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.lengthMm - a.lengthMm);
}

/** "1,234 mm" — rounded to the nearest mm with a thousands separator. */
export function formatMm(mm: number): string {
    return `${Math.round(mm).toLocaleString('en-GB')} mm`;
}

/** "1.23 m" — two decimal places. */
export function formatM(mm: number): string {
    return `${(mm / 1000).toFixed(2)} m`;
}
