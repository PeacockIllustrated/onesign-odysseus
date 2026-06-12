/**
 * Built-up letter RETURN take-off.
 *
 * Fabricated (built-up) brass letters are made of a flat cut FACE plus
 * "returns" — strips of brass bent on edge and welded round the letter to form
 * its depth/wall. A strip bends smoothly round gentle curves, but at a sharp
 * corner you stop the strip and weld a fresh one on; a run longer than the
 * stock strip also needs a welded butt-join. Returns wrap the outer edge AND
 * every inner counter (the islands of A, O, e, R…).
 *
 * This module turns the flattened SVG contours (mm) from `importSvg` into that
 * take-off: per contour it walks the path, breaks it into welded strips at
 * sharp corners + the stock length, and totals the linear metres of return to
 * cut. Pure + unit tested; no DOM, no rendering. The drawing/PDF/nest-handoff
 * layers consume `ReturnsAnalysis`.
 *
 * "Length" reuses the neon run-length geometry (`pathLengthMm`); counters are
 * identified with the same even-odd rule the rest of the visualiser uses
 * (`detectInnerCounters`).
 */

import type { FlatPath } from './types';
import { pathLengthMm } from './neon';
import { detectInnerCounters } from './svg-import';

export type Pt = [number, number];

export interface ReturnsConfig {
    /** Letter build-up depth — the FLAT width of every return strip (mm). */
    returnDepthMm: number;
    /** Brass strip gauge (mm). Carried for the spec sheet / ordering. */
    materialThicknessMm: number;
    /**
     * Corner threshold: a vertex whose turn (exterior angle) is at least this
     * many degrees is a hard break — the strip ends and a new one is welded on.
     * Gentle curves (finely flattened, tiny per-vertex turns) bend straight
     * through. 30° suits typical signage letters.
     */
    breakAngleDeg: number;
    /** Max usable length of one brass strip (mm). Longer runs get butt-welds. */
    stockLengthMm: number;
}

export const DEFAULT_RETURNS_CONFIG: ReturnsConfig = {
    returnDepthMm: 50,
    materialThicknessMm: 1.5,
    breakAngleDeg: 30,
    stockLengthMm: 2500,
};

/** Why a strip ends where it does — drives the weld callouts. */
export type StripEndReason = 'corner' | 'stock' | 'closing';

export interface ReturnStrip {
    /** 1-based index within its contour. */
    index: number;
    /** Developed (bent) length of this strip in mm. */
    lengthMm: number;
    endReason: StripEndReason;
}

export interface Bbox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface ReturnContour {
    /** 1-based label across the whole analysis (reading order). */
    index: number;
    /** Outer letter edge vs an inner counter (island). Both get returns. */
    kind: 'outer' | 'counter';
    closed: boolean;
    /** Total run length of this contour (= total return strip for it), mm. */
    perimeterMm: number;
    strips: ReturnStrip[];
    /** Strip-to-strip welds (corner breaks + stock joins + the closing weld). */
    weldCount: number;
    /** Points (mm) where a weld falls — for marking the drawing. */
    weldPoints: Pt[];
    /** Sharp-corner vertices (mm) — a subset of weldPoints, for emphasis. */
    corners: Pt[];
    /** The contour polyline (mm) — drawn by the preview / PDF / nest faces. */
    points: Pt[];
    centroid: Pt;
    bbox: Bbox;
}

export interface ReturnsAnalysis {
    contours: ReturnContour[];
    /** Sum of every contour perimeter — the linear metres of return to cut. */
    totalReturnLengthMm: number;
    stripCount: number;
    weldCount: number;
    /** Number of letter faces = outer contours (counters are holes, not faces). */
    faceCount: number;
    bbox: Bbox;
}

// ---------------------------------------------------------------------------
// Geometry helpers (local + pure)
// ---------------------------------------------------------------------------

/** Drop the duplicated closing point and consecutive near-coincident points. */
function dedupe(points: Pt[], eps = 1e-3): Pt[] {
    const out: Pt[] = [];
    for (const p of points) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push([p[0], p[1]]);
    }
    while (
        out.length > 1 &&
        Math.hypot(
            out[0][0] - out[out.length - 1][0],
            out[0][1] - out[out.length - 1][1],
        ) <= eps
    ) {
        out.pop();
    }
    return out;
}

/** Exterior turn angle at `cur` between edges prev→cur and cur→next (0..π). */
function turnAngle(prev: Pt, cur: Pt, next: Pt): number {
    const ax = cur[0] - prev[0];
    const ay = cur[1] - prev[1];
    const bx = next[0] - cur[0];
    const by = next[1] - cur[1];
    const la = Math.hypot(ax, ay);
    const lb = Math.hypot(bx, by);
    if (la < 1e-9 || lb < 1e-9) return 0;
    const dot = (ax * bx + ay * by) / (la * lb);
    const cross = (ax * by - ay * bx) / (la * lb);
    return Math.abs(Math.atan2(cross, Math.max(-1, Math.min(1, dot))));
}

function polylineLength(pts: Pt[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return len;
}

/** Point at developed arc-length `target` along a polyline run. */
function pointAtArcLength(run: Pt[], target: number): Pt {
    let acc = 0;
    for (let i = 1; i < run.length; i++) {
        const seg = Math.hypot(
            run[i][0] - run[i - 1][0],
            run[i][1] - run[i - 1][1],
        );
        if (acc + seg >= target) {
            const t = seg > 1e-9 ? (target - acc) / seg : 0;
            return [
                run[i - 1][0] + (run[i][0] - run[i - 1][0]) * t,
                run[i - 1][1] + (run[i][1] - run[i - 1][1]) * t,
            ];
        }
        acc += seg;
    }
    return run[run.length - 1];
}

function centroidOf(pts: Pt[]): Pt {
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

function bboxOf(pts: Pt[]): Bbox {
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
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
}

// ---------------------------------------------------------------------------
// Segmentation
// ---------------------------------------------------------------------------

interface ContourSegments {
    strips: ReturnStrip[];
    weldPoints: Pt[];
    corners: Pt[];
}

/** Subdivide one corner-bounded run into ≤ stock strips, collecting welds. */
function splitRun(
    run: Pt[],
    stockLengthMm: number,
    endReason: StripEndReason,
    out: { strips: Omit<ReturnStrip, 'index'>[]; weldPoints: Pt[] },
): void {
    const len = polylineLength(run);
    if (len <= 1e-9) return;
    const stock = stockLengthMm > 0 ? stockLengthMm : Infinity;
    const nSub = Math.max(1, Math.ceil(len / stock));
    const sub = len / nSub;
    for (let k = 0; k < nSub; k++) {
        const last = k === nSub - 1;
        out.strips.push({
            lengthMm: sub,
            // Intermediate sub-strips are stock butt-welds; the run's final
            // strip ends for the reason the run itself ends (corner / closing).
            endReason: last ? endReason : 'stock',
        });
        // A weld sits at every internal stock split (not at the run end — that
        // weld, if any, is owned by the corner/closing logic in the caller).
        if (!last) out.weldPoints.push(pointAtArcLength(run, sub * (k + 1)));
    }
}

/**
 * Break one contour into welded return strips. Closed contours are walked as a
 * cycle (corners cut it into runs; a corner-free loop is one strip closed with
 * a single weld). Open contours are walked end to end (the two ends are not
 * welds). Stock length subdivides any run that is too long.
 */
export function segmentContour(
    points: Pt[],
    closed: boolean,
    config: ReturnsConfig,
): ContourSegments {
    const ring = dedupe(points);
    const n = ring.length;
    if (n < 2) return { strips: [], weldPoints: [], corners: [] };

    const thr = (Math.max(0, config.breakAngleDeg) * Math.PI) / 180;
    const acc: { strips: Omit<ReturnStrip, 'index'>[]; weldPoints: Pt[] } = {
        strips: [],
        weldPoints: [],
    };
    const corners: Pt[] = [];

    if (closed && n >= 3) {
        // Corner vertices break the loop. Evaluate the turn at every vertex
        // (cyclic), so a sharp join at the start point is caught too.
        const cornerIdx: number[] = [];
        for (let i = 0; i < n; i++) {
            const prev = ring[(i - 1 + n) % n];
            const next = ring[(i + 1) % n];
            if (turnAngle(prev, ring[i], next) >= thr) {
                cornerIdx.push(i);
                corners.push([ring[i][0], ring[i][1]]);
            }
        }

        if (cornerIdx.length === 0) {
            // Smooth closed loop: one continuous strip bent right round, butt
            // welded where its two ends meet (+ stock joins if it's long).
            const loop = [...ring, ring[0]];
            splitRun(loop, config.stockLengthMm, 'closing', acc);
            // The closing weld where the loop's ends meet.
            acc.weldPoints.push([ring[0][0], ring[0][1]]);
        } else {
            // Each corner→next-corner arc is a run; every corner is a weld.
            for (let c = 0; c < cornerIdx.length; c++) {
                const start = cornerIdx[c];
                const end = cornerIdx[(c + 1) % cornerIdx.length];
                const run: Pt[] = [ring[start]];
                let i = start;
                while (i !== end) {
                    i = (i + 1) % n;
                    run.push(ring[i]);
                }
                splitRun(run, config.stockLengthMm, 'corner', acc);
                acc.weldPoints.push([ring[end][0], ring[end][1]]);
            }
        }
    } else {
        // Open contour: corners are interior vertices; the ends are free.
        const cornerIdx: number[] = [];
        for (let i = 1; i < n - 1; i++) {
            if (turnAngle(ring[i - 1], ring[i], ring[i + 1]) >= thr) {
                cornerIdx.push(i);
                corners.push([ring[i][0], ring[i][1]]);
            }
        }
        const cuts = [0, ...cornerIdx, n - 1];
        for (let c = 0; c < cuts.length - 1; c++) {
            const start = cuts[c];
            const end = cuts[c + 1];
            const run = ring.slice(start, end + 1);
            const isLastRun = c === cuts.length - 2;
            splitRun(run, config.stockLengthMm, 'corner', acc);
            // Interior corner = a weld; the final path end is not.
            if (!isLastRun) acc.weldPoints.push([ring[end][0], ring[end][1]]);
        }
    }

    return {
        strips: acc.strips.map((s, i) => ({ ...s, index: i + 1 })),
        weldPoints: acc.weldPoints,
        corners,
    };
}

// ---------------------------------------------------------------------------
// Analysis
// ---------------------------------------------------------------------------

/**
 * Measure returns for every contour, dropping degenerate ones, numbered in
 * reading order. Both outer edges and counters produce returns; `faceCount`
 * counts the outer contours (the actual letters).
 */
export function analyzeReturns(
    paths: FlatPath[],
    config: ReturnsConfig,
    minPerimeterMm = 1,
): ReturnsAnalysis {
    const counters = new Set(detectInnerCounters(paths));

    const measured = paths
        .map((p, i) => ({ p, i, perimeterMm: pathLengthMm(p) }))
        .filter((m) => m.perimeterMm >= minPerimeterMm && m.p.points.length >= 2);

    // Reading-order numbering: band by Y (rows), left-to-right within a row.
    const withCentroid = measured.map((m) => ({
        ...m,
        centroid: centroidOf(m.p.points),
        bbox: bboxOf(m.p.points),
    }));
    const heights = withCentroid
        .map((m) => m.bbox.maxY - m.bbox.minY)
        .sort((a, b) => a - b);
    const medianH = heights.length
        ? heights[Math.floor(heights.length / 2)]
        : 0;
    const band = Math.max(1, medianH * 0.5);
    withCentroid.sort((a, b) => {
        const dy = a.centroid[1] - b.centroid[1];
        if (Math.abs(dy) > band) return dy;
        return a.centroid[0] - b.centroid[0];
    });

    const contours: ReturnContour[] = withCentroid.map((m, idx) => {
        const seg = segmentContour(m.p.points, m.p.closed, config);
        return {
            index: idx + 1,
            kind: counters.has(m.i) ? 'counter' : 'outer',
            closed: m.p.closed,
            perimeterMm: m.perimeterMm,
            strips: seg.strips,
            weldCount: seg.weldPoints.length,
            weldPoints: seg.weldPoints,
            corners: seg.corners,
            points: m.p.points.map(([x, y]) => [x, y] as Pt),
            centroid: m.centroid,
            bbox: m.bbox,
        };
    });

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const c of contours) {
        minX = Math.min(minX, c.bbox.minX);
        minY = Math.min(minY, c.bbox.minY);
        maxX = Math.max(maxX, c.bbox.maxX);
        maxY = Math.max(maxY, c.bbox.maxY);
    }
    const bbox: Bbox = Number.isFinite(minX)
        ? { minX, minY, maxX, maxY }
        : { minX: 0, minY: 0, maxX: 0, maxY: 0 };

    return {
        contours,
        totalReturnLengthMm: contours.reduce((s, c) => s + c.perimeterMm, 0),
        stripCount: contours.reduce((s, c) => s + c.strips.length, 0),
        weldCount: contours.reduce((s, c) => s + c.weldCount, 0),
        faceCount: contours.filter((c) => c.kind === 'outer').length,
        bbox,
    };
}

// ---------------------------------------------------------------------------
// Formatting (shared with the UI / PDF)
// ---------------------------------------------------------------------------

/** "1,234 mm" — rounded to the nearest mm with a thousands separator. */
export function formatMm(mm: number): string {
    return `${Math.round(mm).toLocaleString('en-GB')} mm`;
}

/** "1.23 m" — two decimal places. */
export function formatM(mm: number): string {
    return `${(mm / 1000).toFixed(2)} m`;
}
