/**
 * Shaped (contour-cut) neon backboard geometry.
 *
 * The plain backboard is just the artwork bounding box grown by a uniform
 * padding (a rectangle). A *shaped* backboard instead follows the silhouette
 * of the whole design: every neon run is buffered outward by the tube radius
 * plus the chosen padding, and all of those buffers are unioned into one (or
 * more) filled outline(s) — the acrylic the manufacturer cuts to shape.
 *
 * Because the runs are buffered *together*, separate letters/strokes form
 * their own islands at a small padding and merge into a single blob as the
 * padding grows — which is exactly the dial a fabricator wants (tight contour
 * cut vs. one welded panel). Interior counters (the hole of an O/A) are filled
 * so the result reads as a solid mounting panel rather than a donut.
 *
 * Pure + unit-tested; no DOM, no THREE. The flattened run polylines come from
 * `measureNeon`, already in millimetres in the same space as the artwork bbox.
 */

import polygonClipping, {
    type MultiPolygon,
    type Polygon,
    type Ring,
} from 'polygon-clipping';
import type { NeonElement } from './neon';

/** Neon-flex core radius (mm). The shaped board hugs the tube edge + padding. */
export const NEON_TUBE_MM = 5;

export interface ShapedBackboard {
    /**
     * Filled silhouette outlines (outer boundaries only — counters filled),
     * in mm in the same space as the artwork bbox. One ring per island.
     */
    rings: Array<Array<[number, number]>>;
    /** Bounding box of the whole board in mm (null when there's nothing to cut). */
    bbox: { minX: number; minY: number; maxX: number; maxY: number } | null;
    /** Total cut area of the (hole-filled) silhouette in mm². */
    areaMm2: number;
}

export interface ShapedBackboardOptions {
    /** Neon-flex core radius (mm); defaults to {@link NEON_TUBE_MM}. */
    tubeRadiusMm?: number;
    /**
     * Edge-smoothing level (0–{@link MAX_SHAPED_SMOOTHING}). Each level is a
     * Chaikin corner-cutting pass that rounds the faceted buffer outline; 0
     * leaves the raw silhouette untouched.
     */
    smoothing?: number;
}

/** Highest smoothing level (Chaikin passes) {@link buildShapedBackboard} applies. */
export const MAX_SHAPED_SMOOTHING = 4;

const EMPTY: ShapedBackboard = { rings: [], bbox: null, areaMm2: 0 };

/** Vertices used to approximate each round join/cap. */
const CIRCLE_SEGS = 12;

/** Ceiling on vertices per ring while smoothing, so a pass can't explode it. */
const SMOOTH_MAX_POINTS = 2400;

/**
 * Snap to a 0.01 mm grid. polygon-clipping's sweep line throws ("Unable to
 * find segment … in SweepLine tree") on the near-coincident vertices these
 * overlapping circles/quads produce at full float precision; snapping makes
 * coincident points exactly equal and the union robust. 0.01 mm is far finer
 * than any board tolerance.
 */
function snap(n: number): number {
    return Math.round(n * 100) / 100;
}

function circlePoly(cx: number, cy: number, r: number): Polygon {
    const ring: Ring = [];
    for (let i = 0; i < CIRCLE_SEGS; i++) {
        const t = (i / CIRCLE_SEGS) * Math.PI * 2;
        ring.push([snap(cx + Math.cos(t) * r), snap(cy + Math.sin(t) * r)]);
    }
    ring.push([ring[0][0], ring[0][1]]);
    return [ring];
}

/** A rectangle of half-width `r` straddling the segment a→b (round joins added separately). */
function segmentQuad(
    a: [number, number],
    b: [number, number],
    r: number,
): Polygon | null {
    let ux = b[0] - a[0];
    let uy = b[1] - a[1];
    const L = Math.hypot(ux, uy);
    if (L < 1e-6) return null;
    ux /= L;
    uy /= L;
    const nx = -uy * r;
    const ny = ux * r;
    const ring: Ring = [
        [snap(a[0] + nx), snap(a[1] + ny)],
        [snap(b[0] + nx), snap(b[1] + ny)],
        [snap(b[0] - nx), snap(b[1] - ny)],
        [snap(a[0] - nx), snap(a[1] - ny)],
        [snap(a[0] + nx), snap(a[1] + ny)],
    ];
    return [ring];
}

/** Drop points closer than `minGap` to the previous kept point (endpoints stay). */
function decimate(
    pts: Array<[number, number]>,
    minGap: number,
): Array<[number, number]> {
    if (pts.length <= 2) return pts.slice();
    const out: Array<[number, number]> = [pts[0]];
    for (let i = 1; i < pts.length - 1; i++) {
        const last = out[out.length - 1];
        if (Math.hypot(pts[i][0] - last[0], pts[i][1] - last[1]) >= minGap) {
            out.push(pts[i]);
        }
    }
    out.push(pts[pts.length - 1]);
    return out;
}

function ringArea(ring: Ring): number {
    let s = 0;
    for (let i = 0; i < ring.length - 1; i++) {
        s += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
    }
    return s / 2;
}

/** Append the first point to close a ring (matches polygon-clipping output). */
function closeRing(pts: Array<[number, number]>): Array<[number, number]> {
    if (pts.length === 0) return pts;
    return [...pts, [pts[0][0], pts[0][1]]];
}

/**
 * Chaikin corner-cutting on a closed ring (input/output both carry the
 * repeated closing point). Each pass replaces every vertex with two points
 * a quarter and three-quarters along its outgoing edge, converging on a
 * smooth quadratic B-spline — so the faceted buffer outline (12-gon caps,
 * decimated curves) rounds off into clean edges. Bounded by `maxPoints` so a
 * dense ring can't blow up.
 */
function chaikinClosed(
    ring: ReadonlyArray<readonly number[]>,
    iterations: number,
    maxPoints: number,
): Array<[number, number]> {
    // Drop the repeated closing point; Chaikin works on the unique loop.
    let pts: Array<[number, number]> = ring.map((p) => [p[0], p[1]]);
    if (pts.length > 1) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        if (a[0] === b[0] && a[1] === b[1]) pts = pts.slice(0, -1);
    }
    if (pts.length < 3) return closeRing(pts);

    for (let it = 0; it < iterations; it++) {
        if (pts.length * 2 > maxPoints) break;
        const n = pts.length;
        const out: Array<[number, number]> = [];
        for (let i = 0; i < n; i++) {
            const p = pts[i];
            const q = pts[(i + 1) % n];
            out.push([p[0] * 0.75 + q[0] * 0.25, p[1] * 0.75 + q[1] * 0.25]);
            out.push([p[0] * 0.25 + q[0] * 0.75, p[1] * 0.25 + q[1] * 0.75]);
        }
        pts = out;
    }
    return closeRing(pts);
}

/** Union a bag of polygons, returning null if the clipper throws. */
function unionOrNull(pieces: Polygon[]): MultiPolygon | null {
    if (pieces.length === 0) return [];
    try {
        return polygonClipping.union(pieces[0], ...pieces.slice(1));
    } catch {
        return null;
    }
}

/**
 * Build the shaped backboard for a set of measured neon runs.
 *
 * @param elements   measured runs (mm, artwork-bbox space)
 * @param paddingMm  margin BEYOND the neon tube edge (the "extra padding")
 * @param opts       tube radius + edge-smoothing level
 */
export function buildShapedBackboard(
    elements: NeonElement[],
    paddingMm: number,
    opts: ShapedBackboardOptions = {},
): ShapedBackboard {
    const tubeRadiusMm = opts.tubeRadiusMm ?? NEON_TUBE_MM;
    const smoothing = Math.max(
        0,
        Math.min(MAX_SHAPED_SMOOTHING, Math.round(opts.smoothing ?? 0)),
    );
    // Total buffer = tube half-width + margin. The board therefore clears the
    // tube by `paddingMm` at padding 0+ (not the centreline).
    const r = Math.max(0.1, tubeRadiusMm + Math.max(0, paddingMm));
    // Coarse following is fine for a board outline; keep the union cheap so the
    // padding slider stays responsive even on dense flattened artwork.
    const minGap = Math.max(1, r * 0.4);

    // Buffer pieces grouped per run, so the global union can fall back to a
    // per-run union if the clipper chokes (one bad glyph drops out instead of
    // blanking the whole board).
    const groups: Polygon[][] = [];
    for (const el of elements) {
        let pts = decimate(el.points, minGap);
        if (el.closed && pts.length > 1) {
            // Wrap the buffer all the way round a closed contour.
            const a = pts[0];
            const b = pts[pts.length - 1];
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-6) pts = [...pts, a];
        }
        const pieces: Polygon[] = [];
        if (pts.length === 1) {
            pieces.push(circlePoly(pts[0][0], pts[0][1], r));
        } else {
            for (let i = 1; i < pts.length; i++) {
                const quad = segmentQuad(pts[i - 1], pts[i], r);
                if (quad) pieces.push(quad);
                // Round join at the start vertex of this segment.
                pieces.push(circlePoly(pts[i - 1][0], pts[i - 1][1], r));
            }
            // Round cap at the final vertex.
            const tail = pts[pts.length - 1];
            pieces.push(circlePoly(tail[0], tail[1], r));
        }
        if (pieces.length > 0) groups.push(pieces);
    }

    if (groups.length === 0) return EMPTY;

    let geom = unionOrNull(groups.flat());
    if (!geom) {
        // Global union threw — union each run on its own and concat. Loses
        // cross-run merging but still draws a sensible (if slightly overlapping)
        // board rather than nothing.
        geom = [];
        for (const g of groups) {
            const part = unionOrNull(g);
            if (part) geom.push(...part);
        }
    }
    if (geom.length === 0) return EMPTY;

    const rings: Array<Array<[number, number]>> = [];
    let areaMm2 = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const poly of geom) {
        const outer = poly[0];
        if (!outer || outer.length < 4) continue;
        // Smooth the faceted outline; area/bbox are taken from the smoothed
        // ring so the reported cut size matches what's actually cut.
        const ring =
            smoothing > 0
                ? chaikinClosed(outer, smoothing, SMOOTH_MAX_POINTS)
                : outer.map(([x, y]) => [x, y] as [number, number]);
        rings.push(ring);
        areaMm2 += Math.abs(ringArea(ring)); // counters filled → outer only
        for (const [x, y] of ring) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }
    if (rings.length === 0) return EMPTY;
    return { rings, bbox: { minX, minY, maxX, maxY }, areaMm2 };
}
