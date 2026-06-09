/**
 * Raster → SVG silhouette tracer.
 *
 * A dependency-free image tracer for *ballparking* signage ideas in the
 * builder — drop a PNG/JPG, get rough vector outlines that feed straight
 * into the existing `importSvg` pipeline. NOT a production cut path: the
 * output is a threshold silhouette (one shape, counters as holes) — a
 * concept aid. Anything destined for the cutter should still be a clean,
 * designer-approved vector.
 *
 * Quality pipeline:
 *   1. luminanceField — RGBA → luminance, alpha composited over the
 *      "outside" background, so transparent logos AND anti-aliased
 *      edges both become a smooth scalar field.
 *   2. boxBlur (optional) — knock back JPEG noise / aliasing.
 *   3. threshold — explicit, or Otsu auto.
 *   4. marchingSquares — trace the iso-contour at the threshold with
 *      linear interpolation, so contour vertices land at SUB-PIXEL
 *      positions on the true edge (not a 90° pixel staircase).
 *   5. simplify — dedupe, collinear-merge, Douglas–Peucker.
 *   6. loopsToSvg — fit cubic Béziers (smooth vertices) with hard
 *      corners preserved; one <path> per loop so enclosed loops read
 *      as counters.
 *
 * Field/contour functions are pure and take raw RGBA + dimensions (no
 * ImageData / canvas), so they unit-test in plain node.
 */

export interface TraceOptions {
    /** Luminance cutoff 0..255. Omit to auto-pick via Otsu. */
    threshold?: number;
    /** Trace the LIGHT regions instead of the dark ones. Default false. */
    invert?: boolean;
    /** 0..100 — higher drops more detail (rougher, fewer points).
     *  Maps to the Douglas–Peucker epsilon. Default 40. */
    smoothing?: number;
    /** Box-blur radius (px) applied to the luminance field before
     *  tracing — smooths aliasing / noise. Default 1. */
    blurRadius?: number;
    /** Loops with absolute area below this (px²) are dropped as specks.
     *  Default 24. */
    minAreaPx?: number;
}

type Pt = [number, number];

/** Map smoothing 0..100 → DP epsilon in pixels (~0.4 fine … ~5 rough). */
function smoothingToEpsilon(smoothing: number): number {
    const s = Math.max(0, Math.min(100, smoothing));
    return 0.4 + (s / 100) * 4.6;
}

/**
 * Luminance field with alpha folded in. Each pixel is composited over
 * the background we treat as "outside" (white for a dark trace, black
 * for an inverted/light trace), so transparent and semi-transparent
 * pixels resolve to the right side of the threshold and AA edges become
 * a smooth ramp the contour can cut through sub-pixel.
 */
export function luminanceField(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    invert = false,
): Float32Array {
    const bg = invert ? 0 : 255;
    const field = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        const r = rgba[i * 4];
        const g = rgba[i * 4 + 1];
        const b = rgba[i * 4 + 2];
        const a = rgba[i * 4 + 3] / 255;
        const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        field[i] = lum * a + bg * (1 - a);
    }
    return field;
}

/** Separable box blur (edge-clamped). radius 0 → returns a copy. */
export function boxBlur(
    field: Float32Array,
    w: number,
    h: number,
    radius: number,
): Float32Array {
    const r = Math.max(0, Math.floor(radius));
    if (r === 0) return field.slice();
    const tmp = new Float32Array(w * h);
    const out = new Float32Array(w * h);
    const win = r * 2 + 1;
    // Horizontal
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let k = -r; k <= r; k++) {
                const xx = Math.max(0, Math.min(w - 1, x + k));
                sum += field[y * w + xx];
            }
            tmp[y * w + x] = sum / win;
        }
    }
    // Vertical
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            let sum = 0;
            for (let k = -r; k <= r; k++) {
                const yy = Math.max(0, Math.min(h - 1, y + k));
                sum += tmp[yy * w + x];
            }
            out[y * w + x] = sum / win;
        }
    }
    return out;
}

/** Otsu's method — the luminance cutoff that best separates the two
 *  brightness populations. Robust default when the operator hasn't
 *  dialled a threshold in by hand. */
export function otsuThreshold(field: Float32Array): number {
    const hist = new Array(256).fill(0);
    for (let i = 0; i < field.length; i++) {
        const v = Math.max(0, Math.min(255, Math.round(field[i])));
        hist[v]++;
    }
    const total = field.length;
    let sum = 0;
    for (let t = 0; t < 256; t++) sum += t * hist[t];

    // Between-class variance per t.
    const between = new Array(256).fill(-1);
    let sumB = 0;
    let wB = 0;
    for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        const wF = total - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        between[t] = wB * wF * (mB - mF) * (mB - mF);
    }

    // When the histogram is two well-separated spikes, a whole range of
    // t maximises the variance equally. Return the CENTRE of that
    // plateau so the cut sits between the populations rather than hard
    // up against the darker one.
    let maxVar = -1;
    for (let t = 0; t < 256; t++) if (between[t] > maxVar) maxVar = between[t];
    if (maxVar <= 0) return 128;
    let acc = 0;
    let cnt = 0;
    for (let t = 0; t < 256; t++) {
        if (between[t] >= 0 && between[t] >= maxVar * (1 - 1e-9)) {
            acc += t;
            cnt++;
        }
    }
    return cnt > 0 ? Math.round(acc / cnt) : 128;
}

/**
 * Marching squares iso-contour at `threshold`. Samples are the pixel
 * values; cell-edge crossings are linearly interpolated for sub-pixel
 * vertices. The field is padded by one cell of "outside" so shapes
 * touching the image border still close. Returns raw closed loops
 * (outer contours + holes, opposite winding).
 */
export function marchingSquares(
    field: Float32Array,
    w: number,
    h: number,
    threshold: number,
    invert = false,
): Pt[][] {
    // Pad with a 1px border of "outside" luminance so border-touching
    // shapes close along the crop edge.
    const outside = invert ? 0 : 255;
    const W = w + 2;
    const H = h + 2;
    const F = new Float32Array(W * H);
    F.fill(outside);
    for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) F[(y + 1) * W + (x + 1)] = field[y * w + x];

    const isInside = (v: number) => (invert ? v >= threshold : v <= threshold);

    // Crossing point on a grid edge, in unpadded coords. Edge ids:
    //   h:x:y  → horizontal edge (x,y)–(x+1,y)
    //   v:x:y  → vertical edge   (x,y)–(x,y+1)
    const pointForId = (id: string): Pt => {
        const [kind, sx, sy] = id.split(':');
        const x = Number(sx);
        const y = Number(sy);
        let a: number;
        let b: number;
        let px: number;
        let py: number;
        if (kind === 'h') {
            a = F[y * W + x];
            b = F[y * W + x + 1];
            const denom = b - a;
            const t = Math.abs(denom) < 1e-9 ? 0.5 : (threshold - a) / denom;
            const tc = Math.max(0, Math.min(1, t));
            px = x + tc;
            py = y;
        } else {
            a = F[y * W + x];
            b = F[(y + 1) * W + x];
            const denom = b - a;
            const t = Math.abs(denom) < 1e-9 ? 0.5 : (threshold - a) / denom;
            const tc = Math.max(0, Math.min(1, t));
            px = x;
            py = y + tc;
        }
        return [px - 1, py - 1]; // unpad
    };

    // Directed edge pairs per case (TL=1,TR=2,BR=4,BL=8), walked so the
    // segments chain head-to-tail across cells into closed loops.
    const TABLE: Record<number, Array<[string, string]>> = {
        0: [],
        1: [['L', 'T']],
        2: [['T', 'R']],
        3: [['L', 'R']],
        4: [['R', 'B']],
        5: [
            ['L', 'T'],
            ['R', 'B'],
        ],
        6: [['T', 'B']],
        7: [['L', 'B']],
        8: [['B', 'L']],
        9: [['B', 'T']],
        10: [
            ['T', 'R'],
            ['B', 'L'],
        ],
        11: [['B', 'R']],
        12: [['R', 'L']],
        13: [['R', 'T']],
        14: [['T', 'L']],
        15: [],
    };
    const edgeId = (name: string, x: number, y: number): string => {
        switch (name) {
            case 'T':
                return `h:${x}:${y}`;
            case 'B':
                return `h:${x}:${y + 1}`;
            case 'L':
                return `v:${x}:${y}`;
            default:
                return `v:${x + 1}:${y}`;
        }
    };

    const segFrom: string[] = [];
    const segTo: string[] = [];
    const startMap = new Map<string, number[]>();
    for (let y = 0; y < H - 1; y++) {
        for (let x = 0; x < W - 1; x++) {
            const tl = isInside(F[y * W + x]) ? 1 : 0;
            const tr = isInside(F[y * W + x + 1]) ? 2 : 0;
            const br = isInside(F[(y + 1) * W + x + 1]) ? 4 : 0;
            const bl = isInside(F[(y + 1) * W + x]) ? 8 : 0;
            const c = tl | tr | br | bl;
            const pairs = TABLE[c];
            if (pairs.length === 0) continue;
            for (const [from, to] of pairs) {
                const idx = segFrom.length;
                const fid = edgeId(from, x, y);
                segFrom.push(fid);
                segTo.push(edgeId(to, x, y));
                const list = startMap.get(fid);
                if (list) list.push(idx);
                else startMap.set(fid, [idx]);
            }
        }
    }

    const used = new Array(segFrom.length).fill(false);
    const loops: Pt[][] = [];
    for (let i = 0; i < segFrom.length; i++) {
        if (used[i]) continue;
        const ids: string[] = [];
        let cur = i;
        const startId = segFrom[i];
        let guard = 0;
        while (cur !== -1 && !used[cur] && guard++ < segFrom.length + 8) {
            used[cur] = true;
            ids.push(segFrom[cur]);
            const next = segTo[cur];
            if (next === startId) break;
            const cands = startMap.get(next);
            let nx = -1;
            if (cands) {
                for (const c of cands)
                    if (!used[c]) {
                        nx = c;
                        break;
                    }
            }
            cur = nx;
        }
        if (ids.length < 3) continue;
        loops.push(ids.map(pointForId));
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

/** Drop consecutive near-duplicate points. */
function dedupe(pts: Pt[], eps = 1e-4): Pt[] {
    const out: Pt[] = [];
    for (const p of pts) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push(p);
    }
    while (
        out.length > 1 &&
        Math.hypot(
            out[0][0] - out[out.length - 1][0],
            out[0][1] - out[out.length - 1][1],
        ) <= eps
    )
        out.pop();
    return out;
}

/** Drop the middle of any three collinear points. */
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
        if (Math.abs(cross) > 1e-6) out.push(cur);
    }
    return out.length >= 3 ? out : pts;
}

function perpDist(p: Pt, a: Pt, b: Pt): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return Math.hypot(p[0] - a[0], p[1] - a[1]);
    return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / len;
}

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

/** DP a closed loop by anchoring at the farthest point and recombining. */
function simplifyClosed(loop: Pt[], eps: number): Pt[] {
    if (loop.length < 4) return loop;
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
    return sa.slice(0, -1).concat(sb.slice(0, -1));
}

/** Clean + simplify raw marching-squares loops, dropping specks. */
export function simplifyLoops(
    rawLoops: Pt[][],
    opts: { smoothing?: number; minAreaPx?: number } = {},
): Pt[][] {
    const eps = smoothingToEpsilon(opts.smoothing ?? 40);
    const minArea = opts.minAreaPx ?? 24;
    const out: Pt[][] = [];
    for (const raw of rawLoops) {
        const cleaned = simplifyClosed(mergeCollinear(dedupe(raw)), eps);
        if (cleaned.length < 3) continue;
        if (Math.abs(polygonArea(cleaned)) < minArea) continue;
        out.push(cleaned);
    }
    return out;
}

// Turn angle (radians) beyond which a vertex is a hard corner — the
// curve breaks and meets it sharply rather than rounding. ~85° keeps
// letter corners crisp while genuine curves flow smoothly even after
// heavy point reduction.
const CORNER_TURN = (85 * Math.PI) / 180;

/**
 * One `d` string for a closed loop as cubic Béziers. Smooth vertices
 * get Catmull-Rom tangents (real curves, not facets); hard corners
 * collapse their tangents so joins stay sharp; a corner-to-corner span
 * with no curvature is a straight line. After import the curves flatten
 * back to a dense, genuinely smooth polyline.
 */
function loopToPathD(loop: Pt[]): string {
    const n = loop.length;
    if (n < 3) return '';
    const r = (v: number) => Math.round(v * 10) / 10;

    const corner: boolean[] = new Array(n);
    for (let i = 0; i < n; i++) {
        const prev = loop[(i - 1 + n) % n];
        const cur = loop[i];
        const next = loop[(i + 1) % n];
        const ax = cur[0] - prev[0];
        const ay = cur[1] - prev[1];
        const bx = next[0] - cur[0];
        const by = next[1] - cur[1];
        const la = Math.hypot(ax, ay);
        const lb = Math.hypot(bx, by);
        if (la < 1e-9 || lb < 1e-9) {
            corner[i] = true;
            continue;
        }
        const dot = (ax * bx + ay * by) / (la * lb);
        const turn = Math.acos(Math.max(-1, Math.min(1, dot)));
        corner[i] = turn > CORNER_TURN;
    }

    let d = `M ${r(loop[0][0])} ${r(loop[0][1])}`;
    for (let i = 0; i < n; i++) {
        const i1 = i;
        const i2 = (i + 1) % n;
        const p0 = loop[(i - 1 + n) % n];
        const p1 = loop[i1];
        const p2 = loop[i2];
        const p3 = loop[(i + 2) % n];
        if (corner[i1] && corner[i2]) {
            d += ` L ${r(p2[0])} ${r(p2[1])}`;
            continue;
        }
        const c1x = corner[i1] ? p1[0] : p1[0] + (p2[0] - p0[0]) / 6;
        const c1y = corner[i1] ? p1[1] : p1[1] + (p2[1] - p0[1]) / 6;
        const c2x = corner[i2] ? p2[0] : p2[0] - (p3[0] - p1[0]) / 6;
        const c2y = corner[i2] ? p2[1] : p2[1] - (p3[1] - p1[1]) / 6;
        d +=
            ` C ${r(c1x)} ${r(c1y)}, ${r(c2x)} ${r(c2y)}, ` +
            `${r(p2[0])} ${r(p2[1])}`;
    }
    return d + ' Z';
}

/** Wrap loops as separate <path> elements. Separate paths (not one
 *  compound) so the visualiser's nesting logic can spot enclosed loops
 *  and treat them as counters. */
export function loopsToSvg(loops: Pt[][], w: number, h: number): string {
    const paths = loops
        .map((l) => loopToPathD(l))
        .filter(Boolean)
        .map((d) => `<path d="${d}" fill="#000000" stroke="none"/>`)
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
): {
    svg: string;
    loopCount: number;
    pointCount: number;
    threshold: number;
} | null {
    const invert = opts.invert ?? false;
    let field = luminanceField(rgba, w, h, invert);
    const blur = opts.blurRadius ?? 1;
    if (blur > 0) field = boxBlur(field, w, h, blur);
    const threshold = opts.threshold ?? otsuThreshold(field);
    const raw = marchingSquares(field, w, h, threshold, invert);
    const loops = simplifyLoops(raw, {
        smoothing: opts.smoothing,
        minAreaPx: opts.minAreaPx,
    });
    if (loops.length === 0) return null;
    const pointCount = loops.reduce((n, l) => n + l.length, 0);
    return {
        svg: loopsToSvg(loops, w, h),
        loopCount: loops.length,
        pointCount,
        threshold,
    };
}
