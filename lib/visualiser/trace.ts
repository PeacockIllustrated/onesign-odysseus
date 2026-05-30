/**
 * Raster → SVG silhouette tracer.
 *
 * A deliberately simple, dependency-free image tracer for *ballparking*
 * signage ideas in the builder — drop a PNG/JPG, get rough vector
 * outlines that feed straight into the existing `importSvg` pipeline.
 *
 * It is NOT a production cut path. The output is a threshold silhouette
 * (one shape, optional counters as holes), smoothed with Douglas–
 * Peucker. Great for high-contrast logos and lettering; poor for
 * photos. Anything destined for the cutter should still be a clean,
 * designer-approved vector — the trace is a concept aid.
 *
 * Pipeline:
 *   1. buildMask  — luminance/alpha threshold → binary inside/outside.
 *   2. traceMask  — walk pixel-boundary edges into closed loops (outer
 *                   contours + hole contours), then simplify each.
 *   3. loopsToSvg — emit one <path> per loop. The visualiser's
 *                   nesting logic turns enclosed loops into counters.
 *
 * All functions are pure and take raw RGBA + dimensions (no ImageData /
 * canvas), so they unit-test in plain node.
 */

export interface TraceOptions {
    /** Luminance cutoff 0..255. Pixels darker than this are "inside"
     *  (unless inverted). Default 128. */
    threshold?: number;
    /** Trace the LIGHT regions instead of the dark ones. Default false. */
    invert?: boolean;
    /** 0..100 — higher drops more detail (rougher, fewer points).
     *  Maps to the Douglas–Peucker epsilon. Default 40. */
    smoothing?: number;
    /** Loops with absolute area below this (px²) are dropped as specks.
     *  Default 24. */
    minAreaPx?: number;
}

/** Map smoothing 0..100 → DP epsilon in pixels (~0.5 fine … ~6 rough). */
function smoothingToEpsilon(smoothing: number): number {
    const s = Math.max(0, Math.min(100, smoothing));
    return 0.5 + (s / 100) * 5.5;
}

/**
 * Binary inside/outside mask. A pixel is "inside" (1) when it's
 * sufficiently opaque AND on the chosen side of the luminance cutoff.
 * Transparent pixels are always outside, so logos on a transparent
 * background trace by their alpha silhouette.
 */
export function buildMask(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    opts: { threshold?: number; invert?: boolean } = {},
): Uint8Array {
    const threshold = opts.threshold ?? 128;
    const invert = opts.invert ?? false;
    const mask = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        const a = rgba[i * 4 + 3];
        if (a < 128) continue; // transparent → outside
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const dark = lum <= threshold;
        mask[i] = (invert ? !dark : dark) ? 1 : 0;
    }
    return mask;
}

type Pt = [number, number];

/**
 * Trace the mask boundary into closed loops. Each filled pixel
 * contributes its boundary edges (the sides facing an empty neighbour)
 * as directed unit segments; the segments chain head-to-tail into
 * closed loops — outer contours one way, holes the other. The result
 * is a staircase polygon per loop, then collinear-merged + DP-
 * simplified, and specks dropped by area.
 */
export function traceMask(
    mask: Uint8Array,
    w: number,
    h: number,
    opts: { smoothing?: number; minAreaPx?: number } = {},
): Pt[][] {
    const eps = smoothingToEpsilon(opts.smoothing ?? 40);
    const minArea = opts.minAreaPx ?? 24;
    const at = (x: number, y: number): number =>
        x < 0 || y < 0 || x >= w || y >= h ? 0 : mask[y * w + x];

    // Grid corners are indexed 0..w / 0..h. Segments are stored as
    // directed edges keyed by their start corner so the stitcher can
    // follow head-to-tail.
    const key = (x: number, y: number) => y * (w + 1) + x;
    const segA: number[] = []; // start key
    const segBx: number[] = [];
    const segBy: number[] = [];
    const segAx: number[] = [];
    const segAy: number[] = [];
    const startMap = new Map<number, number[]>();
    const addSeg = (ax: number, ay: number, bx: number, by: number) => {
        const idx = segA.length;
        segA.push(key(ax, ay));
        segAx.push(ax);
        segAy.push(ay);
        segBx.push(bx);
        segBy.push(by);
        const k = key(ax, ay);
        const list = startMap.get(k);
        if (list) list.push(idx);
        else startMap.set(k, [idx]);
    };

    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            if (!at(x, y)) continue;
            // Edges face empty neighbours; directions chosen so the
            // four edges of an isolated pixel form one consistent loop.
            if (!at(x, y - 1)) addSeg(x, y, x + 1, y); // top →
            if (!at(x + 1, y)) addSeg(x + 1, y, x + 1, y + 1); // right ↓
            if (!at(x, y + 1)) addSeg(x + 1, y + 1, x, y + 1); // bottom ←
            if (!at(x - 1, y)) addSeg(x, y + 1, x, y); // left ↑
        }
    }

    const used = new Array(segA.length).fill(false);
    const loops: Pt[][] = [];
    for (let i = 0; i < segA.length; i++) {
        if (used[i]) continue;
        const loop: Pt[] = [];
        let cur = i;
        const startKey = segA[i];
        let guard = 0;
        while (cur !== -1 && !used[cur] && guard++ < segA.length + 8) {
            used[cur] = true;
            loop.push([segAx[cur], segAy[cur]]);
            const endKey = key(segBx[cur], segBy[cur]);
            if (endKey === startKey) break; // closed
            const cands = startMap.get(endKey);
            let next = -1;
            if (cands) {
                for (const c of cands) {
                    if (!used[c]) {
                        next = c;
                        break;
                    }
                }
            }
            cur = next;
        }
        if (loop.length < 4) continue;
        const simplified = simplifyClosed(mergeCollinear(loop), eps);
        if (simplified.length < 3) continue;
        if (Math.abs(polygonArea(simplified)) < minArea) continue;
        loops.push(simplified);
    }
    return loops;
}

/** Shoelace area (signed). */
export function polygonArea(pts: Pt[]): number {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        a += (pts[j][0] + pts[i][0]) * (pts[j][1] - pts[i][1]);
    }
    return a / 2;
}

/** Drop the middle of any three collinear points (staircase runs that
 *  happen to be straight). Keeps the staircase corners for DP to chew. */
function mergeCollinear(pts: Pt[]): Pt[] {
    const n = pts.length;
    if (n < 3) return pts;
    const out: Pt[] = [];
    for (let i = 0; i < n; i++) {
        const prev = out.length ? out[out.length - 1] : pts[(i - 1 + n) % n];
        const cur = pts[i];
        const next = pts[(i + 1) % n];
        const cross =
            (cur[0] - prev[0]) * (next[1] - prev[1]) -
            (cur[1] - prev[1]) * (next[0] - prev[0]);
        if (Math.abs(cross) > 1e-9) out.push(cur);
    }
    return out.length >= 3 ? out : pts;
}

/** Perpendicular distance from p to segment a–b. */
function perpDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

/** Douglas–Peucker on an open polyline. */
function douglasPeucker(pts: Pt[], eps: number): Pt[] {
    if (pts.length < 3) return pts.slice();
    let maxD = 0;
    let idx = 0;
    const a = pts[0];
    const b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) {
        const d = perpDist(pts[i], a, b);
        if (d > maxD) {
            maxD = d;
            idx = i;
        }
    }
    if (maxD <= eps) return [a, b];
    const left = douglasPeucker(pts.slice(0, idx + 1), eps);
    const right = douglasPeucker(pts.slice(idx), eps);
    return left.slice(0, -1).concat(right);
}

/** DP a closed loop by anchoring at the point farthest from the start,
 *  simplifying the two halves, and recombining. */
function simplifyClosed(loop: Pt[], eps: number): Pt[] {
    if (loop.length < 4) return loop;
    // Anchor at the most extreme point so the split is stable.
    let far = 0;
    let farD = -1;
    for (let i = 1; i < loop.length; i++) {
        const d =
            (loop[i][0] - loop[0][0]) ** 2 + (loop[i][1] - loop[0][1]) ** 2;
        if (d > farD) {
            farD = d;
            far = i;
        }
    }
    const a = loop.slice(0, far + 1);
    const b = loop.slice(far).concat([loop[0]]);
    const sa = douglasPeucker(a, eps);
    const sb = douglasPeucker(b, eps);
    // Recombine, dropping shared/duplicate endpoints.
    const out = sa.slice(0, -1).concat(sb.slice(0, -1));
    return out;
}

/** One `d` string for a closed loop (rounded to 0.1 px). */
function loopToPathD(loop: Pt[]): string {
    if (loop.length < 3) return '';
    const r = (n: number) => Math.round(n * 10) / 10;
    let d = `M ${r(loop[0][0])} ${r(loop[0][1])}`;
    for (let i = 1; i < loop.length; i++) d += ` L ${r(loop[i][0])} ${r(loop[i][1])}`;
    return d + ' Z';
}

/** Wrap loops as separate <path> elements in an SVG document. Separate
 *  paths (not one compound) so the visualiser's nesting logic can spot
 *  enclosed loops and treat them as counters. */
export function loopsToSvg(loops: Pt[][], w: number, h: number): string {
    const paths = loops
        .map((l) => loopToPathD(l))
        .filter(Boolean)
        .map(
            (d) =>
                `<path d="${d}" fill="#000000" stroke="none"/>`,
        )
        .join('');
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
        `width="${w}" height="${h}">${paths}</svg>`
    );
}

/** Full pipeline: raw RGBA → SVG string. Returns null when nothing
 *  traced (blank / fully-thresholded-out image). */
export function traceToSvg(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    opts: TraceOptions = {},
): { svg: string; loopCount: number; pointCount: number } | null {
    const mask = buildMask(rgba, w, h, opts);
    const loops = traceMask(mask, w, h, opts);
    if (loops.length === 0) return null;
    const pointCount = loops.reduce((n, l) => n + l.length, 0);
    return { svg: loopsToSvg(loops, w, h), loopCount: loops.length, pointCount };
}
