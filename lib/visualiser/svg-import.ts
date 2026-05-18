/**
 * Aperture-SVG import.
 *
 * The whole point of this tool is clean production files — so we apply the
 * same discipline to the INPUT. We flatten the uploaded SVG: bake every
 * transform into absolute coordinates, drop <defs>/<clipPath>/<mask>/<use>,
 * and convert every shape to a plain absolute polyline. What comes out is a
 * flat list of polylines that map 1:1 to discrete DXF LINE entities — nothing
 * hidden under groups or clipping masks.
 *
 * Browser-only (uses DOMParser). Callers are client components.
 *
 * Known v1 limitation: the <5mm "too small for the laser" check and the
 * keyline offset are pragmatic heuristics, not exact computational geometry.
 * The warning is always advisory and never blocks export.
 */

import {
    MIN_LASER_FEATURE_MM,
    type FlatPath,
    type ImportedSvg,
} from './types';

type Matrix = [number, number, number, number, number, number]; // a b c d e f

const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

function mul(m1: Matrix, m2: Matrix): Matrix {
    return [
        m1[0] * m2[0] + m1[2] * m2[1],
        m1[1] * m2[0] + m1[3] * m2[1],
        m1[0] * m2[2] + m1[2] * m2[3],
        m1[1] * m2[2] + m1[3] * m2[3],
        m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
        m1[1] * m2[4] + m1[3] * m2[5] + m1[5],
    ];
}

function apply(m: Matrix, x: number, y: number): [number, number] {
    return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function parseTransform(t: string | null): Matrix {
    if (!t) return IDENTITY;
    let m: Matrix = IDENTITY;
    const re = /(\w+)\s*\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = re.exec(t)) !== null) {
        const fn = match[1];
        const a = match[2]
            .split(/[\s,]+/)
            .map(Number)
            .filter((n) => !Number.isNaN(n));
        if (fn === 'matrix' && a.length === 6) {
            m = mul(m, a as Matrix);
        } else if (fn === 'translate') {
            m = mul(m, [1, 0, 0, 1, a[0] || 0, a[1] || 0]);
        } else if (fn === 'scale') {
            m = mul(m, [a[0] || 1, 0, 0, a[1] ?? a[0] ?? 1, 0, 0]);
        } else if (fn === 'rotate') {
            const r = ((a[0] || 0) * Math.PI) / 180;
            const cos = Math.cos(r);
            const sin = Math.sin(r);
            if (a.length === 3) {
                m = mul(m, [1, 0, 0, 1, a[1], a[2]]);
                m = mul(m, [cos, sin, -sin, cos, 0, 0]);
                m = mul(m, [1, 0, 0, 1, -a[1], -a[2]]);
            } else {
                m = mul(m, [cos, sin, -sin, cos, 0, 0]);
            }
        }
    }
    return m;
}

const CURVE_SAMPLES = 24;

function cubic(p0: number[], p1: number[], p2: number[], p3: number[]): number[][] {
    const pts: number[][] = [];
    for (let i = 1; i <= CURVE_SAMPLES; i++) {
        const t = i / CURVE_SAMPLES;
        const u = 1 - t;
        pts.push([
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
        ]);
    }
    return pts;
}

function quad(p0: number[], p1: number[], p2: number[]): number[][] {
    const pts: number[][] = [];
    for (let i = 1; i <= CURVE_SAMPLES; i++) {
        const t = i / CURVE_SAMPLES;
        const u = 1 - t;
        pts.push([
            u * u * p0[0] + 2 * u * t * p1[0] + t * t * p2[0],
            u * u * p0[1] + 2 * u * t * p1[1] + t * t * p2[1],
        ]);
    }
    return pts;
}

/** Parse path `d` data into absolute polyline points (curves sampled). */
function parsePathData(d: string): { pts: number[][]; closed: boolean }[] {
    const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
    const out: { pts: number[][]; closed: boolean }[] = [];
    let pts: number[][] = [];
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let i = 0;
    let cmd = '';
    let closed = false;

    const num = () => parseFloat(tokens[i++]);
    const flush = () => {
        if (pts.length > 1) out.push({ pts, closed });
        pts = [];
        closed = false;
    };

    while (i < tokens.length) {
        if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
        const rel = cmd === cmd.toLowerCase();
        const C = cmd.toUpperCase();

        if (C === 'M') {
            flush();
            let x = num();
            let y = num();
            if (rel) {
                x += cx;
                y += cy;
            }
            cx = x;
            cy = y;
            sx = x;
            sy = y;
            pts.push([x, y]);
            cmd = rel ? 'l' : 'L';
        } else if (C === 'L') {
            let x = num();
            let y = num();
            if (rel) {
                x += cx;
                y += cy;
            }
            cx = x;
            cy = y;
            pts.push([x, y]);
        } else if (C === 'H') {
            let x = num();
            if (rel) x += cx;
            cx = x;
            pts.push([x, cy]);
        } else if (C === 'V') {
            let y = num();
            if (rel) y += cy;
            cy = y;
            pts.push([cx, y]);
        } else if (C === 'C') {
            const p1 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            const p2 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            const p3 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            cubic([cx, cy], p1, p2, p3).forEach((p) => pts.push(p));
            cx = p3[0];
            cy = p3[1];
        } else if (C === 'S' || C === 'Q' || C === 'T') {
            // Approximate smooth/quadratic as straight-ish samples via control
            // points read in order — good enough for laser-cut lettering.
            if (C === 'Q') {
                const p1 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
                const p2 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
                quad([cx, cy], p1, p2).forEach((p) => pts.push(p));
                cx = p2[0];
                cy = p2[1];
            } else if (C === 'S') {
                const p2 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
                const p3 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
                cubic([cx, cy], [cx, cy], p2, p3).forEach((p) => pts.push(p));
                cx = p3[0];
                cy = p3[1];
            } else {
                const p2 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
                quad([cx, cy], [cx, cy], p2).forEach((p) => pts.push(p));
                cx = p2[0];
                cy = p2[1];
            }
        } else if (C === 'A') {
            // Arc: skip the radii/flags, sample a chord to the endpoint. A
            // crude flatten, but laser cutters re-fit; advisory tool only.
            num();
            num();
            num();
            num();
            num();
            let x = num();
            let y = num();
            if (rel) {
                x += cx;
                y += cy;
            }
            const steps = 12;
            for (let s = 1; s <= steps; s++) {
                pts.push([cx + ((x - cx) * s) / steps, cy + ((y - cy) * s) / steps]);
            }
            cx = x;
            cy = y;
        } else if (C === 'Z') {
            closed = true;
            pts.push([sx, sy]);
            cx = sx;
            cy = sy;
            flush();
        } else {
            i++; // unknown token, skip defensively
        }
    }
    flush();
    return out;
}

function readLengthMm(v: string | null): number | null {
    if (!v) return null;
    const m = v.match(/^([\d.]+)\s*(mm|cm|in|px|pt)?$/);
    if (!m) return null;
    const n = parseFloat(m[1]);
    switch (m[2]) {
        case 'cm':
            return n * 10;
        case 'in':
            return n * 25.4;
        case 'pt':
            return (n / 72) * 25.4;
        case 'px':
        case undefined:
        case '':
        default:
            return n; // treat user units as mm
    }
}

/**
 * Parse + flatten an uploaded SVG into absolute mm polylines.
 * @throws if the string is not parseable as SVG.
 */
export function importSvg(svgText: string): ImportedSvg {
    if (typeof DOMParser === 'undefined') {
        throw new Error('importSvg must run in the browser');
    }
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const root = doc.querySelector('svg');
    if (!root || doc.querySelector('parsererror')) {
        throw new Error('Could not parse SVG file');
    }

    // Unit scale: map the SVG coordinate system to mm.
    const vb = (root.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
    const wMm = readLengthMm(root.getAttribute('width'));
    const hMm = readLengthMm(root.getAttribute('height'));
    let unit = 1;
    if (vb.length === 4 && wMm && vb[2]) unit = wMm / vb[2];
    else if (vb.length === 4 && hMm && vb[3]) unit = hMm / vb[3];
    const unitM: Matrix = [unit, 0, 0, unit, 0, 0];

    const paths: FlatPath[] = [];
    const SKIP = new Set(['DEFS', 'CLIPPATH', 'MASK', 'USE', 'SYMBOL', 'PATTERN']);

    const walk = (el: Element, parent: Matrix) => {
        const tag = el.tagName.toUpperCase();
        if (SKIP.has(tag)) return; // drop hidden/indirected geometry
        const m = mul(parent, parseTransform(el.getAttribute('transform')));

        const push = (raw: number[][], closed: boolean) => {
            const points = raw.map(([x, y]) => apply(m, x, y)) as Array<
                [number, number]
            >;
            if (points.length > 1) paths.push({ points, closed });
        };
        const n = (a: string) => parseFloat(el.getAttribute(a) || '0');

        if (tag === 'PATH') {
            for (const sp of parsePathData(el.getAttribute('d') || '')) {
                push(sp.pts, sp.closed);
            }
        } else if (tag === 'RECT') {
            const x = n('x');
            const y = n('y');
            const w = n('width');
            const h = n('height');
            push([[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]], true);
        } else if (tag === 'CIRCLE' || tag === 'ELLIPSE') {
            const cx = n('cx');
            const cy = n('cy');
            const rx = tag === 'CIRCLE' ? n('r') : n('rx');
            const ry = tag === 'CIRCLE' ? n('r') : n('ry');
            const ring: number[][] = [];
            for (let a = 0; a <= 64; a++) {
                const t = (a / 64) * Math.PI * 2;
                ring.push([cx + Math.cos(t) * rx, cy + Math.sin(t) * ry]);
            }
            push(ring, true);
        } else if (tag === 'LINE') {
            push([[n('x1'), n('y1')], [n('x2'), n('y2')]], false);
        } else if (tag === 'POLYLINE' || tag === 'POLYGON') {
            const nums = (el.getAttribute('points') || '')
                .split(/[\s,]+/)
                .map(Number)
                .filter((v) => !Number.isNaN(v));
            const ring: number[][] = [];
            for (let k = 0; k + 1 < nums.length; k += 2) ring.push([nums[k], nums[k + 1]]);
            if (tag === 'POLYGON' && ring.length) ring.push(ring[0]);
            push(ring, tag === 'POLYGON');
        }

        for (const child of Array.from(el.children)) walk(child, m);
    };

    walk(root, unitM);

    const bbox = boundingBox(paths);
    const warnings = thinFeatureScan(paths);
    return { paths, bbox, warnings };
}

function boundingBox(paths: FlatPath[]): ImportedSvg['bbox'] {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const p of paths)
        for (const [x, y] of p.points) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
    return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Advisory heuristic: flag features likely too small for the laser. Two
 * cheap signals — a whole sub-path whose bbox is thinner than the limit, and
 * close approaches between distinct sub-paths (narrow bridges/gaps). Sampling
 * is capped so a dense file can't blow up the UI thread.
 */
export function thinFeatureScan(
    paths: FlatPath[],
    minMm: number = MIN_LASER_FEATURE_MM,
): string[] {
    const warnings: string[] = [];

    paths.forEach((p, idx) => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const [x, y] of p.points) {
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
        const span = Math.min(maxX - minX, maxY - minY);
        if (p.points.length > 2 && span > 0 && span < minMm) {
            warnings.push(
                `Shape ${idx + 1} is only ${span.toFixed(1)}mm at its narrowest — may be too fine for the laser.`,
            );
        }
    });

    // Cap pairwise work: sample at most ~40 points per path.
    const sampled = paths.map((p) => {
        const step = Math.max(1, Math.floor(p.points.length / 40));
        return p.points.filter((_, k) => k % step === 0);
    });
    let flaggedGap = false;
    for (let a = 0; a < sampled.length && !flaggedGap; a++) {
        for (let b = a + 1; b < sampled.length && !flaggedGap; b++) {
            for (const pa of sampled[a]) {
                for (const pb of sampled[b]) {
                    const dx = pa[0] - pb[0];
                    const dy = pa[1] - pb[1];
                    if (Math.hypot(dx, dy) < minMm) {
                        warnings.push(
                            `Two shapes come within ${minMm}mm of each other — check the gap is laser-cuttable.`,
                        );
                        flaggedGap = true;
                        break;
                    }
                }
                if (flaggedGap) break;
            }
        }
    }
    return warnings;
}

/**
 * Keyline = uniform outward offset around each closed aperture path.
 * Pragmatic vertex-normal offset (orientation from signed area). Good enough
 * for a register/relief line; exact polygon offsetting is a noted follow-up.
 */
export function buildKeyline(paths: FlatPath[], offsetMm: number): FlatPath[] {
    if (offsetMm <= 0) return [];
    return paths
        .filter((p) => p.closed && p.points.length > 3)
        .map((p) => {
            const pts = p.points.slice(0, -1); // drop closing dup
            const area = signedArea(pts);
            const dir = area < 0 ? -1 : 1; // CCW vs CW → outward sign
            const out: Array<[number, number]> = pts.map((cur, k) => {
                const prev = pts[(k - 1 + pts.length) % pts.length];
                const next = pts[(k + 1) % pts.length];
                const n1 = normal(prev, cur);
                const n2 = normal(cur, next);
                let nx = (n1[0] + n2[0]) * dir;
                let ny = (n1[1] + n2[1]) * dir;
                const len = Math.hypot(nx, ny) || 1;
                nx /= len;
                ny /= len;
                return [cur[0] + nx * offsetMm, cur[1] + ny * offsetMm];
            });
            out.push(out[0]);
            return { points: out, closed: true };
        });
}

function signedArea(pts: number[][]): number {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % pts.length];
        s += x1 * y2 - x2 * y1;
    }
    return s / 2;
}

function normal(a: number[], b: number[]): [number, number] {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    return [dy / len, -dx / len];
}
