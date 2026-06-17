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

import polygonClipping, {
    type MultiPolygon,
    type Ring,
} from 'polygon-clipping';
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

// Adaptive curve flattening. Curves are recursively subdivided until the
// polyline is within FLATNESS_TOL of the true curve — so quality scales
// with curvature (no faceting on big shapes, no wasted points on small
// ones). The polyline is then consumed by every downstream surface (3D
// shape geometry, flat preview, DXF cut, PDF), so the same tolerance
// governs them all — including the holes cut into the panel mesh.
//
// 0.005 native units stays sharp even on SVGs with very small viewBoxes
// (e.g. viewBox="0 0 10 10" representing a 100 mm letter, where 0.005
// units = 0.05 mm — below visible). Adds ~3x the points of 0.015 but
// still trivial at our scene scale, and means the bowls of C / O / R
// cut into the 3D panel are visually round regardless of source SVG.
const FLATNESS_TOL = 0.005;
const MAX_SUBDIV_DEPTH = 18;

function mid(a: number[], b: number[]): number[] {
    return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

// Sederberg/AGG cubic flatness test: control-point deviation from the chord.
function cubicFlatEnough(
    p0: number[],
    p1: number[],
    p2: number[],
    p3: number[],
): boolean {
    const ux = 3 * p1[0] - 2 * p0[0] - p3[0];
    const uy = 3 * p1[1] - 2 * p0[1] - p3[1];
    const vx = 3 * p2[0] - p0[0] - 2 * p3[0];
    const vy = 3 * p2[1] - p0[1] - 2 * p3[1];
    const u = Math.max(ux * ux, vx * vx) + Math.max(uy * uy, vy * vy);
    return u <= 16 * FLATNESS_TOL * FLATNESS_TOL;
}

/** Adaptive de Casteljau subdivision. Appends points after p0, ending at p3. */
function flattenCubic(
    p0: number[],
    p1: number[],
    p2: number[],
    p3: number[],
    out: number[][],
    depth = 0,
): void {
    if (depth >= MAX_SUBDIV_DEPTH || cubicFlatEnough(p0, p1, p2, p3)) {
        out.push([p3[0], p3[1]]);
        return;
    }
    const p01 = mid(p0, p1);
    const p12 = mid(p1, p2);
    const p23 = mid(p2, p3);
    const p012 = mid(p01, p12);
    const p123 = mid(p12, p23);
    const m = mid(p012, p123);
    flattenCubic(p0, p01, p012, m, out, depth + 1);
    flattenCubic(m, p123, p23, p3, out, depth + 1);
}

/** Quadratic → degree-elevated cubic, then adaptively flattened. */
function flattenQuad(
    p0: number[],
    c: number[],
    p1: number[],
    out: number[][],
): void {
    const c1 = [p0[0] + (2 / 3) * (c[0] - p0[0]), p0[1] + (2 / 3) * (c[1] - p0[1])];
    const c2 = [p1[0] + (2 / 3) * (c[0] - p1[0]), p1[1] + (2 / 3) * (c[1] - p1[1])];
    flattenCubic(p0, c1, c2, p1, out);
}

/**
 * SVG elliptical arc → list of cubic Béziers (spec F.6.5 / F.6.6). The sweep
 * is split into ≤90° pieces and each is fitted exactly with the standard
 * tangent-length cubic — no straight-line approximation.
 */
function arcToCubics(
    p0: number[],
    rx: number,
    ry: number,
    xAxisRotDeg: number,
    largeArc: boolean,
    sweep: boolean,
    end: number[],
): Array<{ c1: number[]; c2: number[]; end: number[] }> {
    const x1 = p0[0];
    const y1 = p0[1];
    const x2 = end[0];
    const y2 = end[1];
    if (rx === 0 || ry === 0 || (x1 === x2 && y1 === y2)) {
        return [{ c1: p0, c2: end, end }];
    }
    const phi = (xAxisRotDeg * Math.PI) / 180;
    const cosP = Math.cos(phi);
    const sinP = Math.sin(phi);

    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const x1p = cosP * dx + sinP * dy;
    const y1p = -sinP * dx + cosP * dy;

    let rxA = Math.abs(rx);
    let ryA = Math.abs(ry);
    const lambda =
        (x1p * x1p) / (rxA * rxA) + (y1p * y1p) / (ryA * ryA);
    if (lambda > 1) {
        const s = Math.sqrt(lambda);
        rxA *= s;
        ryA *= s;
    }

    const signCoef = largeArc !== sweep ? 1 : -1;
    const numer = Math.max(
        0,
        rxA * rxA * ryA * ryA -
            rxA * rxA * y1p * y1p -
            ryA * ryA * x1p * x1p,
    );
    const denom = rxA * rxA * y1p * y1p + ryA * ryA * x1p * x1p;
    const coef = signCoef * Math.sqrt(denom === 0 ? 0 : numer / denom);
    const cxp = (coef * (rxA * y1p)) / ryA;
    const cyp = (-coef * (ryA * x1p)) / rxA;

    const cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2;
    const cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;

    const angle = (ux: number, uy: number, vx: number, vy: number) => {
        const dot = ux * vx + uy * vy;
        const len = Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
        let a = Math.acos(Math.min(1, Math.max(-1, dot / len)));
        if (ux * vy - uy * vx < 0) a = -a;
        return a;
    };
    const ux0 = (x1p - cxp) / rxA;
    const uy0 = (y1p - cyp) / ryA;
    const theta1 = angle(1, 0, ux0, uy0);
    let dTheta = angle(ux0, uy0, (-x1p - cxp) / rxA, (-y1p - cyp) / ryA);
    if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
    if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

    const segs = Math.max(1, Math.ceil(Math.abs(dTheta) / (Math.PI / 2)));
    const delta = dTheta / segs;
    const tan = (4 / 3) * Math.tan(delta / 4);
    const ptAt = (a: number): number[] => [
        cx + rxA * Math.cos(a) * cosP - ryA * Math.sin(a) * sinP,
        cy + rxA * Math.cos(a) * sinP + ryA * Math.sin(a) * cosP,
    ];
    const derAt = (a: number): number[] => [
        -rxA * Math.sin(a) * cosP - ryA * Math.cos(a) * sinP,
        -rxA * Math.sin(a) * sinP + ryA * Math.cos(a) * cosP,
    ];

    const out: Array<{ c1: number[]; c2: number[]; end: number[] }> = [];
    let a0 = theta1;
    let start = ptAt(a0);
    for (let s = 0; s < segs; s++) {
        const a1 = a0 + delta;
        const e = ptAt(a1);
        const d0 = derAt(a0);
        const d1 = derAt(a1);
        out.push({
            c1: [start[0] + tan * d0[0], start[1] + tan * d0[1]],
            c2: [e[0] - tan * d1[0], e[1] - tan * d1[1]],
            end: e,
        });
        a0 = a1;
        start = e;
    }
    return out;
}

/**
 * Parse path `d` data into absolute polyline points, with adaptive curve
 * flattening and spec-correct arc / smooth-curve handling. Exported for unit
 * tests (the geometry is the accuracy-critical part).
 */
export function parsePathData(
    d: string,
): { pts: number[][]; closed: boolean }[] {
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
    // Reflection state for smooth curves (S reflects the last cubic ctrl,
    // T the last quadratic ctrl, about the current point).
    let pcx = 0;
    let pcy = 0;
    let pqx = 0;
    let pqy = 0;
    let prevType = ''; // 'C' | 'Q' | '' — controls S/T reflection

    const num = () => parseFloat(tokens[i++]);
    const flush = () => {
        if (pts.length > 1) {
            // Auto-close near-closed paths: some exporters omit the final Z
            // even when start/end coincide. Without this they would export
            // as open polylines and the laser wouldn't cut a clean hole.
            if (!closed) {
                const a = pts[0];
                const b = pts[pts.length - 1];
                if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.1) {
                    pts[pts.length - 1] = [a[0], a[1]];
                    closed = true;
                }
            }
            out.push({ pts, closed });
        }
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
            prevType = '';
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
            prevType = '';
        } else if (C === 'H') {
            let x = num();
            if (rel) x += cx;
            cx = x;
            pts.push([x, cy]);
            prevType = '';
        } else if (C === 'V') {
            let y = num();
            if (rel) y += cy;
            cy = y;
            pts.push([cx, y]);
            prevType = '';
        } else if (C === 'C') {
            const c1 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            const c2 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            const e = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            flattenCubic([cx, cy], c1, c2, e, pts);
            cx = e[0];
            cy = e[1];
            pcx = c2[0];
            pcy = c2[1];
            prevType = 'C';
        } else if (C === 'S') {
            // First control = reflection of the previous cubic's 2nd control
            // about the current point (else the current point itself).
            const c1 =
                prevType === 'C' ? [2 * cx - pcx, 2 * cy - pcy] : [cx, cy];
            const c2 = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            const e = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            flattenCubic([cx, cy], c1, c2, e, pts);
            cx = e[0];
            cy = e[1];
            pcx = c2[0];
            pcy = c2[1];
            prevType = 'C';
        } else if (C === 'Q') {
            const c = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            const e = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            flattenQuad([cx, cy], c, e, pts);
            cx = e[0];
            cy = e[1];
            pqx = c[0];
            pqy = c[1];
            prevType = 'Q';
        } else if (C === 'T') {
            // Control = reflection of the previous quadratic control.
            const c =
                prevType === 'Q' ? [2 * cx - pqx, 2 * cy - pqy] : [cx, cy];
            const e = [rel ? cx + num() : num(), rel ? cy + num() : num()];
            flattenQuad([cx, cy], c, e, pts);
            cx = e[0];
            cy = e[1];
            pqx = c[0];
            pqy = c[1];
            prevType = 'Q';
        } else if (C === 'A') {
            const rx = num();
            const ry = num();
            const rot = num();
            const largeArc = num() !== 0;
            const sweep = num() !== 0;
            let ex = num();
            let ey = num();
            if (rel) {
                ex += cx;
                ey += cy;
            }
            for (const seg of arcToCubics(
                [cx, cy],
                rx,
                ry,
                rot,
                largeArc,
                sweep,
                [ex, ey],
            )) {
                flattenCubic([cx, cy], seg.c1, seg.c2, seg.end, pts);
                cx = seg.end[0];
                cy = seg.end[1];
            }
            prevType = '';
        } else if (C === 'Z') {
            closed = true;
            pts.push([sx, sy]);
            cx = sx;
            cy = sy;
            prevType = '';
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

    // Illustrator's default "Internal CSS" export puts colours in a <style>
    // block keyed by class (e.g. `.st0{fill:#ff2d95}`) rather than on the
    // elements. Parse those rules into class → {fill, stroke} so we can read
    // the artwork's real colours, not just inline styles / attributes.
    const classRules = new Map<string, { stroke?: string; fill?: string }>();
    const styleText = Array.from(doc.querySelectorAll('style'))
        .map((s) => s.textContent || '')
        .join('\n');
    for (const rule of styleText.matchAll(/\.([\w-]+)\s*\{([^}]*)\}/g)) {
        const cls = rule[1];
        const body = rule[2];
        const decl = (p: string) =>
            new RegExp(`(?:^|;)\\s*${p}\\s*:\\s*([^;]+)`).exec(body)?.[1]?.trim();
        classRules.set(cls, { stroke: decl('stroke'), fill: decl('fill') });
    }

    // Resolve a presentation property (stroke / fill) in CSS-cascade order:
    // inline style > <style> class rule > presentation attribute > inherited.
    const cssProp = (
        el: Element,
        prop: 'stroke' | 'fill',
        inherited: string,
    ): string => {
        const style = el.getAttribute('style') || '';
        const inline = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;]+)`)
            .exec(style)?.[1]
            ?.trim();
        if (inline) return inline;
        const classes = (el.getAttribute('class') || '').split(/\s+/);
        for (const c of classes) {
            const v = classRules.get(c)?.[prop];
            if (v) return v;
        }
        const attr = (el.getAttribute(prop) || '').trim();
        return attr ? attr : inherited;
    };
    // A usable solid colour, or undefined for none / currentColor / gradients.
    const asColor = (v: string): string | undefined => {
        const s = v.trim().toLowerCase();
        if (
            !s ||
            s === 'none' ||
            s === 'currentcolor' ||
            s === 'inherit' ||
            s === 'transparent' ||
            s.startsWith('url(')
        )
            return undefined;
        return v.trim();
    };

    const walk = (
        el: Element,
        parent: Matrix,
        inhStroke: string,
        inhFill: string,
    ) => {
        const tag = el.tagName.toUpperCase();
        if (SKIP.has(tag)) return; // drop hidden/indirected geometry
        const m = mul(parent, parseTransform(el.getAttribute('transform')));

        // Resolved colours for this element + everything below it. Neon runs
        // are drawn as strokes, so prefer stroke; fall back to fill.
        const stroke = cssProp(el, 'stroke', inhStroke);
        const fill = cssProp(el, 'fill', inhFill);
        const color = asColor(stroke) ?? asColor(fill);

        const push = (raw: number[][], closed: boolean) => {
            const points = raw.map(([x, y]) => apply(m, x, y)) as Array<
                [number, number]
            >;
            if (points.length > 1) paths.push({ points, closed, stroke: color });
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

        for (const child of Array.from(el.children))
            walk(child, m, stroke, fill);
    };

    walk(root, unitM, '', '');

    const bbox = boundingBox(paths);
    const warnings = thinFeatureScan(paths);
    return { paths, bbox, warnings };
}

/**
 * Auto-detect inner counters — closed paths that visually sit inside
 * another closed path (the hole in an O, e, g, etc.). Same rule SVG
 * already uses with fillRule="evenodd": nest depth determines fill
 * state. Returns indices that should default to "solid" (panel
 * material, not cut). Caller pre-populates `nonCutPaths` from this.
 */
export function detectInnerCounters(paths: FlatPath[]): number[] {
    const closed = paths.map((p, i) => ({ p, i })).filter((e) => e.p.closed);
    if (closed.length < 2) return [];

    const centroid = (p: FlatPath): [number, number] => {
        let sx = 0;
        let sy = 0;
        const pts = p.points;
        for (const [x, y] of pts) {
            sx += x;
            sy += y;
        }
        return [sx / pts.length, sy / pts.length];
    };

    const contains = (ring: FlatPath, pt: [number, number]): boolean => {
        // Standard even-odd ray cast.
        let inside = false;
        const r = ring.points;
        let j = r.length - 1;
        for (let i = 0; i < r.length; i++) {
            const xi = r[i][0];
            const yi = r[i][1];
            const xj = r[j][0];
            const yj = r[j][1];
            if (
                yi > pt[1] !== yj > pt[1] &&
                pt[0] <
                    ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi
            ) {
                inside = !inside;
            }
            j = i;
        }
        return inside;
    };

    const out: number[] = [];
    for (const { p, i } of closed) {
        const c = centroid(p);
        let depth = 0;
        for (const other of closed) {
            if (other.i === i) continue;
            if (contains(other.p, c)) depth++;
        }
        if (depth % 2 === 1) out.push(i);
    }
    return out;
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

const MITER_LIMIT = 4; // Adobe Illustrator "Offset Path" default

/**
 * Keyline = uniform outward offset around the aperture, matching Adobe
 * Illustrator's **Offset Path** (miter join, miter limit 4, bevel fallback).
 *
 * Every edge is translated *exactly* `offsetMm` along its perpendicular and
 * the corners are the true intersection of the two offset edges — not an
 * averaged-normal nudge, which under-offsets corners and made the old
 * keyline look tight/wrong. A positive value grows the outer contour; the
 * global perpendicular sign is resolved from the largest sub-path so holes
 * keep their relative winding and the band stays uniform on compound paths
 * (letters like O / A), exactly like Illustrator.
 */
export function buildKeyline(paths: FlatPath[], offsetMm: number): FlatPath[] {
    if (offsetMm <= 0) return [];
    const closed = paths.filter((p) => p.closed && p.points.length > 3);
    if (closed.length === 0) return [];

    // Deduplicate near-coincident points, then DESPIKE: drop collinear nodes
    // and near-zero-width needles (stray-anchor whiskers / cusps in the source
    // art). The offset would otherwise thicken a 0-width whisker into a real
    // 2×offset spur the machine has to cut. Cleaning the SOURCE first is the
    // robust place to do it.
    const rings = closed
        .map((p) => despikeRing(dedupeRing(p.points.slice(0, -1))))
        .filter((r) => r.length >= 3);
    if (rings.length === 0) return [];

    // Pick the global sign from the largest ring (the outer contour) so a
    // positive offset enlarges the shape overall, regardless of winding.
    let outer = rings[0];
    let outerArea = Math.abs(signedArea(rings[0]));
    for (const ring of rings) {
        const a = Math.abs(signedArea(ring));
        if (a > outerArea) {
            outerArea = a;
            outer = ring;
        }
    }
    const probe = offsetRing(outer, offsetMm, 1);
    const sign = Math.abs(signedArea(probe)) >= outerArea ? 1 : -1;

    // Anything below this area is an uncuttable sliver (a feature smaller than
    // ~⅕ of the offset can't survive the cut) — drop it rather than ship a
    // speck the machine fusses over.
    const minArea = Math.max(0.5, offsetMm * offsetMm * 0.04);

    return rings.flatMap((src) => {
        const raw = offsetRing(src, offsetMm, sign);
        const closedRaw = closeRing(raw);
        // The miter offset self-intersects at concave corners and across narrow
        // letter gaps (the V notch, E slots, the bowl of a P/R) — fold-back
        // loops. A self-intersecting ring is an INVALID cut path: the machine
        // refuses it or, worse, cuts the crossing. When it happens, resolve it
        // with a polygon UNION — the clipper splits at the crossings and keeps
        // the simple outer boundary, so sharp corners survive and only the
        // loops are removed. Clean (convex) offsets pass straight through
        // untouched, so a plain rectangle keeps its exact mitred corners.
        const resolved = ringSelfIntersects(closedRaw)
            ? resolveSelfIntersections(closedRaw)
            : [closedRaw];
        return resolved
            .filter((ring) => Math.abs(signedArea(ring)) >= minArea)
            .map((ring) => ({ points: ring, closed: true }));
    });
}

/**
 * Merge a set of keyline rings into clean, non-overlapping cut paths via a
 * polygon UNION. Each letter's keyline is offset independently, so adjacent
 * letters' keylines cross/overlap — which double-cuts on the machine. The
 * union welds those overlaps into a single outer contour while preserving
 * counters (the inner holes of O / e / & etc.) as holes.
 *
 * Outer-vs-hole is decided by winding (signed-area sign relative to the
 * largest ring), matching how `buildKeyline` itself assigns the offset
 * direction — so the merged result keeps the same solids/holes the keyline
 * was built with. Robust to overlapping siblings (winding doesn't depend on
 * containment). Falls back to the input untouched on any clipping error.
 */
export function mergeKeyline(paths: FlatPath[]): FlatPath[] {
    const rings: number[][][] = paths
        .filter((p) => p.closed && p.points.length >= 4)
        .map((p) => {
            const r = p.points.map(([x, y]) => [x, y] as [number, number]);
            const a = r[0];
            const b = r[r.length - 1];
            if (a[0] !== b[0] || a[1] !== b[1]) r.push([a[0], a[1]]);
            return r;
        })
        .filter((r) => r.length >= 4);
    if (rings.length <= 1) return paths;

    // Dominant winding = the largest ring's; solids share it, holes oppose it.
    let domSign = 1;
    let maxA = 0;
    for (const r of rings) {
        const a = signedArea(r);
        if (Math.abs(a) > maxA) {
            maxA = Math.abs(a);
            domSign = a >= 0 ? 1 : -1;
        }
    }
    const ringSign = (r: number[][]) => (signedArea(r) >= 0 ? 1 : -1);
    const solids = rings.filter((r) => ringSign(r) === domSign);
    const holes = rings.filter((r) => ringSign(r) !== domSign);
    if (solids.length === 0) return paths;

    const toGeom = (r: number[][]): MultiPolygon => [[r as Ring]];
    try {
        let geom = polygonClipping.union(
            toGeom(solids[0]),
            ...solids.slice(1).map(toGeom),
        );
        if (holes.length > 0) {
            geom = polygonClipping.difference(geom, ...holes.map(toGeom));
        }
        const out: FlatPath[] = [];
        for (const poly of geom) {
            for (const ring of poly) {
                if (ring.length < 4) continue;
                out.push({
                    points: ring.map(([x, y]) => [x, y] as [number, number]),
                    closed: true,
                });
            }
        }
        return out.length > 0 ? out : paths;
    } catch {
        // Geometry too degenerate for the clipper — keep the unmerged paths
        // rather than dropping cuts.
        return paths;
    }
}

/** Drop consecutive points within `eps` mm — kills flattening noise. */
function dedupeRing(pts: number[][], eps = 1e-3): number[][] {
    const out: number[][] = [];
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
    ) {
        out.pop();
    }
    return out;
}

/**
 * Despike a source ring before it's offset: drop redundant collinear nodes and
 * the near-zero-width needles (stray-anchor whiskers, degenerate cusps) that
 * the offset would otherwise thicken into a real spur. Iterates, because
 * removing a needle tip can expose collinear leftovers underneath.
 *
 * A needle is identified by its THINNESS, not its length: the path doubles back
 * on itself (incoming ≈ −outgoing). The threshold (~169°) only catches sub-11°
 * slivers, so genuine sharp letter corners/serifs (much wider) are untouched.
 */
const SPIKE_REVERSAL_DOT = -0.98; // cos of ~169° — a near-zero-width fold-back
const COLLINEAR_TOL_MM = 0.03; // 30µm — well below cut precision

function despikeRing(pts: number[][]): Array<[number, number]> {
    let ring = pts.map((p) => [p[0], p[1]] as [number, number]);
    for (let pass = 0; pass < 24 && ring.length > 3; pass++) {
        const n = ring.length;
        const keep = new Array<boolean>(n).fill(true);
        let removed = false;
        for (let i = 0; i < n; i++) {
            const a = ring[(i - 1 + n) % n];
            const v = ring[i];
            const b = ring[(i + 1) % n];
            const e1x = v[0] - a[0];
            const e1y = v[1] - a[1];
            const e2x = b[0] - v[0];
            const e2y = b[1] - v[1];
            const l1 = Math.hypot(e1x, e1y);
            const l2 = Math.hypot(e2x, e2y);
            if (l1 < 1e-9) {
                keep[i] = false;
                removed = true;
                continue;
            }
            // Collinear: v sits on the a→b line (redundant node).
            const baseLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
            if (baseLen > 1e-9) {
                const perp =
                    Math.abs(
                        (b[0] - a[0]) * (v[1] - a[1]) -
                            (b[1] - a[1]) * (v[0] - a[0]),
                    ) / baseLen;
                if (perp < COLLINEAR_TOL_MM) {
                    keep[i] = false;
                    removed = true;
                    continue;
                }
            }
            // Near-zero-width needle: the path folds straight back on itself.
            if (l2 > 1e-9) {
                const dot = (e1x * e2x + e1y * e2y) / (l1 * l2);
                if (dot < SPIKE_REVERSAL_DOT) {
                    keep[i] = false;
                    removed = true;
                }
            }
        }
        if (!removed) break;
        const next = ring.filter((_, i) => keep[i]);
        if (next.length < 3) break;
        ring = next;
    }
    return ring;
}

/** Close a ring (duplicate the first point at the end if needed). */
function closeRing(
    pts: Array<[number, number]>,
): Array<[number, number]> {
    const out = pts.map((p) => [p[0], p[1]] as [number, number]);
    if (out.length === 0) return out;
    const a = out[0];
    const b = out[out.length - 1];
    if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
    return out;
}

/** Signed area of triangle (a, b, c) ×2 — orientation sign. */
function orient(
    a: [number, number],
    b: [number, number],
    c: [number, number],
): number {
    return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

/** True only for a PROPER crossing (strict sign opposition) — shared
 *  endpoints and collinear touches between adjacent edges don't count. */
function segmentsCross(
    p1: [number, number],
    p2: [number, number],
    p3: [number, number],
    p4: [number, number],
): boolean {
    const d1 = orient(p3, p4, p1);
    const d2 = orient(p3, p4, p2);
    const d3 = orient(p1, p2, p3);
    const d4 = orient(p1, p2, p4);
    return (
        ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
        ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
    );
}

/**
 * Does a closed ring cross itself? O(n²) edge-pair test (adjacent edges, which
 * share a vertex, are skipped). Keyline rings are small, and this only runs to
 * decide whether the expensive union cleanup is needed.
 */
function ringSelfIntersects(closed: Array<[number, number]>): boolean {
    const n = closed.length;
    // Drop the closing duplicate so edge i -> i+1 (mod m) is the true ring.
    const m =
        n > 1 &&
        closed[0][0] === closed[n - 1][0] &&
        closed[0][1] === closed[n - 1][1]
            ? n - 1
            : n;
    if (m < 4) return false;
    for (let i = 0; i < m; i++) {
        const a1 = closed[i];
        const a2 = closed[(i + 1) % m];
        for (let j = i + 1; j < m; j++) {
            // Skip the two edges adjacent to edge i (they legitimately share a
            // vertex), including the wrap-around pair.
            if (j === (i + 1) % m || (j + 1) % m === i) continue;
            if (segmentsCross(a1, a2, closed[j], closed[(j + 1) % m])) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Resolve a self-intersecting ring into clean, simple, non-self-intersecting
 * closed rings via a polygon UNION. The clipper splits the ring at its
 * crossings and keeps the nonzero-area boundary, dropping the fold-back loops —
 * the sharp original vertices survive. Falls back to the input on any clipper
 * error so a cut is never silently lost.
 */
function resolveSelfIntersections(
    closed: Array<[number, number]>,
): Array<[number, number]>[] {
    if (closed.length < 4) return [closed];
    try {
        const u = polygonClipping.union([[closed as Ring]]);
        const out: Array<[number, number]>[] = [];
        for (const poly of u) {
            for (const ring of poly) {
                if (ring.length >= 4) {
                    out.push(ring.map(([x, y]) => [x, y] as [number, number]));
                }
            }
        }
        return out.length > 0 ? out : [closed];
    } catch {
        return [closed];
    }
}

/** Offset one closed ring by `d` along edge perpendiculars (miter join). */
function offsetRing(
    pts: number[][],
    d: number,
    sign: number,
): Array<[number, number]> {
    const n = pts.length;
    if (n < 3) return pts.map((p) => [p[0], p[1]] as [number, number]);

    const dir: Array<[number, number]> = [];
    const nrm: Array<[number, number]> = [];
    const linePt: Array<[number, number]> = []; // a point on offset line i
    for (let i = 0; i < n; i++) {
        const a = pts[i];
        const b = pts[(i + 1) % n];
        let ux = b[0] - a[0];
        let uy = b[1] - a[1];
        const L = Math.hypot(ux, uy) || 1;
        ux /= L;
        uy /= L;
        dir.push([ux, uy]);
        const nx = -uy * sign;
        const ny = ux * sign;
        nrm.push([nx, ny]);
        linePt.push([a[0] + nx * d, a[1] + ny * d]);
    }

    const out: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
        const j = (i - 1 + n) % n; // previous edge
        const ip = lineIntersect(linePt[j], dir[j], linePt[i], dir[i]);
        const vx = pts[i][0];
        const vy = pts[i][1];
        if (ip) {
            const miter = Math.hypot(ip[0] - vx, ip[1] - vy);
            if (miter <= Math.abs(d) * MITER_LIMIT) {
                out.push(ip);
                continue;
            }
            // Past the miter limit → bevel the corner (two points).
            out.push([vx + nrm[j][0] * d, vy + nrm[j][1] * d]);
            out.push([vx + nrm[i][0] * d, vy + nrm[i][1] * d]);
        } else {
            // Collinear / straight continuation → single offset point.
            out.push([vx + nrm[i][0] * d, vy + nrm[i][1] * d]);
        }
    }
    return out;
}

function lineIntersect(
    p0: number[],
    u0: number[],
    p1: number[],
    u1: number[],
): [number, number] | null {
    const cross = u0[0] * u1[1] - u0[1] * u1[0];
    if (Math.abs(cross) < 1e-9) return null;
    const dx = p1[0] - p0[0];
    const dy = p1[1] - p0[1];
    const t = (dx * u1[1] - dy * u1[0]) / cross;
    return [p0[0] + t * u0[0], p0[1] + t * u0[1]];
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
