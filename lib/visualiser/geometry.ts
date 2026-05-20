/**
 * Flat development of a folded aluminium tray sign.
 *
 * The part is a face plane with returns folded 90° back on the enabled edges,
 * and (optionally) a shadow-gap lip folded 90° inward at each return tip. The
 * development is the classic cruciform: the face in the middle, each return
 * laid out flat against its face edge, lips beyond the returns. Corners are
 * NOT filled (returns are notched at corners in fabrication) and are square —
 * no bevel.
 *
 * Bend rule (user-specified shop rule): every fold line removes
 * `thickness / 2` from the material on EACH side of it. So:
 *   - the face loses T/2 along an axis for each return on that axis
 *     (e.g. top + bottom returns ⇒ face flat height = H − T)
 *   - each return loses T/2 at its root (where it meets the face), and a
 *     further T/2 at its tip if there is a shadow-gap lip
 *   - each lip loses T/2 at its root (where it meets the return tip)
 */

import {
    bendDeductionPerSide,
    type PanelParams,
    type PanelDevelopment,
    type FlatSegment,
    type FoldLine,
    type PanelEdge,
    type FlatPath,
    type AperturePlacement,
} from './types';

function mm(n: number): number {
    // Keep the maths exact to 0.001mm; kills FP dust like 347.49999999.
    return Math.round(n * 1000) / 1000;
}

export function buildDevelopment(params: PanelParams): PanelDevelopment {
    const {
        panelWidthMm: W,
        panelHeightMm: H,
        returnDepthMm,
        returns,
        shadowGapMm,
        materialThicknessMm: T,
    } = params;

    const d = bendDeductionPerSide(T); // T/2 per side of every fold line
    const hasLip = shadowGapMm > 0;

    // Face flat size: subtract T/2 for each return on the relevant axis.
    const horizReturns = (returns.left ? 1 : 0) + (returns.right ? 1 : 0);
    const vertReturns = (returns.top ? 1 : 0) + (returns.bottom ? 1 : 0);
    const faceFlatW = mm(W - d * horizReturns);
    const faceFlatH = mm(H - d * vertReturns);

    // A return spans one fold line at its root; a lip adds a second at its tip.
    const returnFlatDepth = mm(returnDepthMm - d - (hasLip ? d : 0));
    const lipFlatDepth = hasLip ? mm(shadowGapMm - d) : 0;

    const leftBand = returns.left ? returnFlatDepth + lipFlatDepth : 0;
    const rightBand = returns.right ? returnFlatDepth + lipFlatDepth : 0;
    const topBand = returns.top ? returnFlatDepth + lipFlatDepth : 0;
    const bottomBand = returns.bottom ? returnFlatDepth + lipFlatDepth : 0;

    const faceX = mm(leftBand);
    const faceY = mm(topBand);
    const totalFlatW = mm(leftBand + faceFlatW + rightBand);
    const totalFlatH = mm(topBand + faceFlatH + bottomBand);

    const segments: FlatSegment[] = [
        {
            id: 'face',
            role: 'face',
            xMm: faceX,
            yMm: faceY,
            wMm: faceFlatW,
            hMm: faceFlatH,
            label: `Face ${mm(W)}×${mm(H)}`,
        },
    ];
    const foldLines: FoldLine[] = [];

    const addReturn = (edge: PanelEdge) => {
        if (!returns[edge]) return;

        let rx = faceX;
        let ry = faceY;
        let rw = faceFlatW;
        let rh = faceFlatH;
        // Fold line endpoints (shared face↔return edge).
        let f1: [number, number];
        let f2: [number, number];
        // Lip rectangle (beyond the return), if a shadow gap is set.
        let lx = 0;
        let ly = 0;
        let lw = 0;
        let lh = 0;
        let lf1: [number, number] = [0, 0];
        let lf2: [number, number] = [0, 0];

        if (edge === 'bottom') {
            rx = faceX;
            ry = mm(faceY + faceFlatH);
            rw = faceFlatW;
            rh = returnFlatDepth;
            f1 = [faceX, mm(faceY + faceFlatH)];
            f2 = [mm(faceX + faceFlatW), mm(faceY + faceFlatH)];
            lx = faceX;
            ly = mm(ry + returnFlatDepth);
            lw = faceFlatW;
            lh = lipFlatDepth;
            lf1 = [faceX, ly];
            lf2 = [mm(faceX + faceFlatW), ly];
        } else if (edge === 'top') {
            rx = faceX;
            ry = mm(faceY - returnFlatDepth);
            rw = faceFlatW;
            rh = returnFlatDepth;
            f1 = [faceX, faceY];
            f2 = [mm(faceX + faceFlatW), faceY];
            ly = mm(ry - lipFlatDepth);
            lx = faceX;
            lw = faceFlatW;
            lh = lipFlatDepth;
            lf1 = [faceX, ry];
            lf2 = [mm(faceX + faceFlatW), ry];
        } else if (edge === 'left') {
            rx = mm(faceX - returnFlatDepth);
            ry = faceY;
            rw = returnFlatDepth;
            rh = faceFlatH;
            f1 = [faceX, faceY];
            f2 = [faceX, mm(faceY + faceFlatH)];
            lx = mm(rx - lipFlatDepth);
            ly = faceY;
            lw = lipFlatDepth;
            lh = faceFlatH;
            lf1 = [rx, faceY];
            lf2 = [rx, mm(faceY + faceFlatH)];
        } else {
            // right
            rx = mm(faceX + faceFlatW);
            ry = faceY;
            rw = returnFlatDepth;
            rh = faceFlatH;
            f1 = [mm(faceX + faceFlatW), faceY];
            f2 = [mm(faceX + faceFlatW), mm(faceY + faceFlatH)];
            lx = mm(rx + returnFlatDepth);
            ly = faceY;
            lw = lipFlatDepth;
            lh = faceFlatH;
            lf1 = [lx, faceY];
            lf2 = [lx, mm(faceY + faceFlatH)];
        }

        segments.push({
            id: `return-${edge}`,
            role: 'return',
            edge,
            xMm: mm(rx),
            yMm: mm(ry),
            wMm: mm(rw),
            hMm: mm(rh),
            label: `${cap(edge)} return ${mm(returnDepthMm)}`,
        });
        foldLines.push({
            id: `fold-${edge}`,
            edge,
            kind: 'return',
            x1: f1[0],
            y1: f1[1],
            x2: f2[0],
            y2: f2[1],
            note: 'fold 90° back',
        });

        if (hasLip) {
            segments.push({
                id: `lip-${edge}`,
                role: 'lip',
                edge,
                xMm: mm(lx),
                yMm: mm(ly),
                wMm: mm(lw),
                hMm: mm(lh),
                label: `${cap(edge)} shadow lip ${mm(shadowGapMm)}`,
            });
            foldLines.push({
                id: `fold-lip-${edge}`,
                edge,
                kind: 'lip',
                x1: lf1[0],
                y1: lf1[1],
                x2: lf2[0],
                y2: lf2[1],
                note: 'fold 90° in',
            });
        }
    };

    addReturn('top');
    addReturn('bottom');
    addReturn('left');
    addReturn('right');

    return {
        faceNominalWMm: mm(W),
        faceNominalHMm: mm(H),
        faceFlatWMm: faceFlatW,
        faceFlatHMm: faceFlatH,
        returnFlatDepthMm: returnFlatDepth,
        lipFlatDepthMm: lipFlatDepth,
        totalFlatWMm: totalFlatW,
        totalFlatHMm: totalFlatH,
        segments,
        foldLines,
    };
}

function cap(s: string): string {
    return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Map imported aperture paths (native SVG mm) into flat-development space.
 *
 * Anchor = the artwork's centre of mass (bbox centre). Alignment snaps that
 * centre to a face position (centre by default; left/right/top/bottom flush
 * the scaled artwork edge to the face edge); nudge is a fine mm offset from
 * there. Scaling about the centre never drifts the artwork.
 */
export function placeAperture(
    dev: PanelDevelopment,
    paths: FlatPath[],
    bbox: { x: number; y: number; w: number; h: number },
    placement: AperturePlacement,
): FlatPath[] {
    const face = dev.segments.find((s) => s.role === 'face');
    if (!face) return [];

    const faceHalfW = face.wMm / 2;
    const faceHalfH = face.hMm / 2;
    const faceCx = face.xMm + faceHalfW;
    const faceCy = face.yMm + faceHalfH;

    const scaledHalfW = (bbox.w * placement.scale) / 2;
    const scaledHalfH = (bbox.h * placement.scale) / 2;

    // Offset of the artwork centre from the face centre (mm, y-down).
    const baseX =
        placement.alignH === 'left'
            ? scaledHalfW - faceHalfW
            : placement.alignH === 'right'
              ? faceHalfW - scaledHalfW
              : 0;
    const baseY =
        placement.alignV === 'top'
            ? scaledHalfH - faceHalfH
            : placement.alignV === 'bottom'
              ? faceHalfH - scaledHalfH
              : 0;

    const cx = faceCx + baseX + placement.nudgeXMm;
    const cy = faceCy + baseY + placement.nudgeYMm;

    // Artwork's own centre of mass (bbox centre) — the anchor.
    const svgCx = bbox.x + bbox.w / 2;
    const svgCy = bbox.y + bbox.h / 2;

    return paths.map((p) => ({
        closed: p.closed,
        points: p.points.map(
            ([x, y]) =>
                [
                    cx + (x - svgCx) * placement.scale,
                    cy + (y - svgCy) * placement.scale,
                ] as [number, number],
        ),
    }));
}

/**
 * The single merged OUTER cut perimeter of the flat development.
 *
 * The face + returns + lips tile a cruciform with no overlap and share
 * full edges, so the union outline is found by edge cancellation: every
 * rectangle contributes 4 consistently-wound edges; an interior edge shared
 * by two segments appears as an exact antiparallel pair and cancels, leaving
 * only the true outer boundary. Critical for production — a cutter must see
 * one continuous outline, not the internal face/return (fold) edges drawn as
 * cuts. Returns null if the geometry is degenerate (caller falls back).
 */
export function outlinePerimeter(dev: PanelDevelopment): FlatPath | null {
    type P = [number, number];
    const q = (n: number) => Math.round(n * 1000) / 1000;
    const ptKey = (p: P) => `${q(p[0])},${q(p[1])}`;
    const edgeKey = (a: P, b: P) => `${ptKey(a)}->${ptKey(b)}`;

    const edges = new Map<string, [P, P]>();
    const addEdge = (a: P, b: P) => {
        if (q(a[0]) === q(b[0]) && q(a[1]) === q(b[1])) return;
        const rev = edgeKey(b, a);
        if (edges.has(rev)) {
            edges.delete(rev); // shared interior edge → cancels
            return;
        }
        edges.set(edgeKey(a, b), [a, b]);
    };

    for (const s of dev.segments) {
        if (s.wMm <= 0 || s.hMm <= 0) continue;
        const x0 = s.xMm;
        const y0 = s.yMm;
        const x1 = s.xMm + s.wMm;
        const y1 = s.yMm + s.hMm;
        // Consistent winding for every rectangle.
        addEdge([x0, y0], [x1, y0]);
        addEdge([x1, y0], [x1, y1]);
        addEdge([x1, y1], [x0, y1]);
        addEdge([x0, y1], [x0, y0]);
    }
    if (edges.size < 4) return null;

    // Chain remaining boundary edges end → start into one closed loop.
    const byStart = new Map<string, [P, P]>();
    for (const e of edges.values()) byStart.set(ptKey(e[0]), e);

    const first = edges.values().next().value as [P, P];
    const points: P[] = [first[0]];
    let cur = first;
    for (let guard = 0; guard <= edges.size; guard++) {
        points.push(cur[1]);
        const next = byStart.get(ptKey(cur[1]));
        if (!next) break;
        if (ptKey(next[0]) === ptKey(first[0])) break; // closed
        cur = next;
    }

    const a = points[0];
    const b = points[points.length - 1];
    if (points.length < 5 || Math.hypot(a[0] - b[0], a[1] - b[1]) > 1e-3) {
        return null;
    }
    return { points: simplifyCollinear(points), closed: true };
}

/**
 * Clip aperture / keyline paths to the face rectangle so the production cut
 * file never contains a cut line outside the face. A laser following an
 * unclipped aperture would slice through a fold line or off the sheet edge.
 *
 * Closed paths are clipped with Sutherland–Hodgman (axis-aligned window);
 * open paths are clipped segment-by-segment with Liang–Barsky. Paths fully
 * outside the face are dropped. Returns a flag so the UI can warn — the
 * user normally wants to reposition or scale down rather than silently lose
 * artwork at the edge.
 */
export function clipApertureToFace(
    dev: PanelDevelopment,
    paths: FlatPath[],
): { paths: FlatPath[]; wasClipped: boolean; anyOutside: boolean } {
    const face = dev.segments.find((s) => s.role === 'face');
    if (!face || paths.length === 0) {
        return { paths, wasClipped: false, anyOutside: false };
    }
    const rect = {
        x0: face.xMm,
        y0: face.yMm,
        x1: face.xMm + face.wMm,
        y1: face.yMm + face.hMm,
    };
    const out: FlatPath[] = [];
    let wasClipped = false;
    let anyOutside = false;

    for (const p of paths) {
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
        const inside =
            minX >= rect.x0 - 1e-6 &&
            maxX <= rect.x1 + 1e-6 &&
            minY >= rect.y0 - 1e-6 &&
            maxY <= rect.y1 + 1e-6;
        if (inside) {
            out.push(p);
            continue;
        }
        anyOutside = true;

        if (p.closed) {
            const ring = p.points.slice(0, -1) as Array<[number, number]>;
            const clipped = clipPolygonToRect(ring, rect);
            if (clipped.length >= 3) {
                clipped.push(clipped[0]);
                out.push({ closed: true, points: clipped });
                wasClipped = true;
            } else {
                wasClipped = true; // dropped entirely
            }
        } else {
            const runs = clipPolylineToRect(p.points as Array<[number, number]>, rect);
            for (const run of runs) {
                if (run.length >= 2) {
                    out.push({ closed: false, points: run });
                }
            }
            wasClipped = true;
        }
    }
    return { paths: out, wasClipped, anyOutside };
}

type V = [number, number];
interface Rect {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

/** Sutherland–Hodgman polygon clip against an axis-aligned rectangle. */
function clipPolygonToRect(poly: V[], r: Rect): V[] {
    const inside = (p: V, edge: number) =>
        edge === 0
            ? p[0] >= r.x0
            : edge === 1
              ? p[0] <= r.x1
              : edge === 2
                ? p[1] >= r.y0
                : p[1] <= r.y1;
    const intersect = (a: V, b: V, edge: number): V => {
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        if (edge === 0) {
            const t = (r.x0 - a[0]) / dx;
            return [r.x0, a[1] + t * dy];
        }
        if (edge === 1) {
            const t = (r.x1 - a[0]) / dx;
            return [r.x1, a[1] + t * dy];
        }
        if (edge === 2) {
            const t = (r.y0 - a[1]) / dy;
            return [a[0] + t * dx, r.y0];
        }
        const t = (r.y1 - a[1]) / dy;
        return [a[0] + t * dx, r.y1];
    };
    let output: V[] = poly;
    for (let e = 0; e < 4 && output.length > 0; e++) {
        const input = output;
        output = [];
        let S = input[input.length - 1];
        for (const E of input) {
            const sIn = inside(S, e);
            const eIn = inside(E, e);
            if (eIn) {
                if (!sIn) output.push(intersect(S, E, e));
                output.push(E);
            } else if (sIn) {
                output.push(intersect(S, E, e));
            }
            S = E;
        }
    }
    return output;
}

/** Liang–Barsky line-segment clip; returns the in-window portion or null. */
function clipSegmentToRect(a: V, b: V, r: Rect): [V, V] | null {
    let t0 = 0;
    let t1 = 1;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const p = [-dx, dx, -dy, dy];
    const q = [a[0] - r.x0, r.x1 - a[0], a[1] - r.y0, r.y1 - a[1]];
    for (let i = 0; i < 4; i++) {
        if (p[i] === 0) {
            if (q[i] < 0) return null;
        } else {
            const t = q[i] / p[i];
            if (p[i] < 0) t0 = Math.max(t0, t);
            else t1 = Math.min(t1, t);
            if (t0 > t1) return null;
        }
    }
    return [
        [a[0] + t0 * dx, a[1] + t0 * dy],
        [a[0] + t1 * dx, a[1] + t1 * dy],
    ];
}

/** Clip an open polyline to a rect; returns one or more contiguous runs. */
function clipPolylineToRect(pts: V[], r: Rect): V[][] {
    const runs: V[][] = [];
    let cur: V[] = [];
    for (let i = 0; i + 1 < pts.length; i++) {
        const seg = clipSegmentToRect(pts[i], pts[i + 1], r);
        if (!seg) {
            if (cur.length >= 2) runs.push(cur);
            cur = [];
            continue;
        }
        if (cur.length === 0) {
            cur.push(seg[0]);
        } else {
            const last = cur[cur.length - 1];
            if (Math.hypot(last[0] - seg[0][0], last[1] - seg[0][1]) > 1e-6) {
                if (cur.length >= 2) runs.push(cur);
                cur = [seg[0]];
            }
        }
        cur.push(seg[1]);
    }
    if (cur.length >= 2) runs.push(cur);
    return runs;
}

/**
 * Place stand-off fixing holes inside the lettering outline.
 *
 * Strategy:
 *   - Triangular brick-pattern grid across the artwork bbox (every other
 *     row offset by ½ a cell) so no two fixings line up vertically.
 *   - A small deterministic jitter (sin/cos of row+col) breaks any residual
 *     orthogonal alignment — the slight offset reduces wobble, per the
 *     user's note.
 *   - Even-odd inside test against all closed contours so counters of
 *     letters like O / A / B are correctly excluded.
 *   - Keep candidates clear of every edge (1.5 × radius minimum) and at
 *     least 0.7 × spacing apart from each other.
 *   - **Per-letter guarantee**: any outer contour that ended up empty is
 *     given one fallback fixing at its most "interior" sampled point, so
 *     every letter is mechanically supported.
 *
 * Returns small circle polygons placed in the same flat-development space
 * as the input contours — drop straight into the panel cut layer.
 */
export function placeFixings(
    contours: FlatPath[],
    radiusMm: number,
    spacingMm?: number,
    densityFactor: number = 1,
): FlatPath[] {
    const closed = contours.filter((p) => p.closed && p.points.length > 3);
    if (closed.length === 0 || radiusMm <= 0) return [];

    const rings = closed.map((p) => p.points as Array<[number, number]>);
    const bb = bboxOf(rings);
    if (bb.h <= 0 || bb.w <= 0) return [];

    // density > 1 = tighter spacing (more fixings, heavy materials like brass);
    // density < 1 = looser (fewer, light materials like acrylic). Clamped.
    const d = Math.min(2.5, Math.max(0.4, densityFactor || 1));
    const spacing = spacingMm ?? Math.min(200, Math.max(40, bb.h / 4)) / d;
    const edgeMargin = Math.max(radiusMm * 1.5, 6);
    const minDist = spacing * 0.7;
    // Forbid any pair from sharing an x or y line within this tolerance —
    // the user wants the slight offset that reduces wobble. Brick layout +
    // jitter is the "try"; this is the guarantee.
    const axisTol = Math.max(3, radiusMm * 0.6);
    const rowStep = spacing * Math.sin(Math.PI / 3); // triangular packing

    // Outer contours = even containment depth (0, 2, ...). Inner counters
    // sit inside their outer; both still excluded from the filled area via
    // the even-odd rule below.
    const isOuter = rings.map((ring, i) => {
        const probe = ring[0];
        let depth = 0;
        for (let j = 0; j < rings.length; j++) {
            if (i === j) continue;
            if (pointInRing(probe, rings[j])) depth++;
        }
        return depth % 2 === 0;
    });

    const accepted: Array<[number, number]> = [];
    const accept = (p: [number, number]): boolean => {
        if (!isFilled(p, rings)) return false;
        if (minEdgeDist(p, rings) < edgeMargin) return false;
        for (const a of accepted) {
            if (Math.hypot(a[0] - p[0], a[1] - p[1]) < minDist) return false;
            // No two fixings may share a vertical or horizontal line.
            if (
                Math.abs(a[0] - p[0]) < axisTol ||
                Math.abs(a[1] - p[1]) < axisTol
            ) {
                return false;
            }
        }
        accepted.push(p);
        return true;
    };

    // Main pass: jittered triangular grid.
    const rowMax = Math.ceil(bb.h / rowStep) + 1;
    const colMax = Math.ceil(bb.w / spacing) + 1;
    for (let r = 0; r <= rowMax; r++) {
        const y0 = bb.y0 + (r + 0.5) * rowStep;
        if (y0 > bb.y1 + spacing) break;
        const odd = r % 2;
        for (let c = 0; c <= colMax; c++) {
            const x0 = bb.x0 + (c + 0.5 + odd * 0.5) * spacing;
            if (x0 > bb.x1 + spacing) break;
            const jx = Math.sin(r * 1.71 + c * 0.93) * spacing * 0.09;
            const jy = Math.cos(r * 2.13 + c * 1.27) * spacing * 0.09;
            accept([x0 + jx, y0 + jy]);
        }
    }

    // Fallback: any outer letter shape that ended up empty gets one fixing
    // at its most interior sampled point — every letter must be supported.
    for (let i = 0; i < rings.length; i++) {
        if (!isOuter[i]) continue;
        const ring = rings[i];
        const hasOne = accepted.some((a) => pointInRing(a, ring));
        if (hasOne) continue;
        const lbb = bboxOf([ring]);
        let best: [number, number] | null = null;
        let bestEdge = -1;
        for (let t = 0; t < 49; t++) {
            const rx = ((t * 0.314 + 0.13) % 1) * lbb.w + lbb.x0;
            const ry = ((t * 0.271 + 0.21) % 1) * lbb.h + lbb.y0;
            const p: [number, number] = [rx, ry];
            if (!isFilled(p, rings)) continue;
            const e = minEdgeDist(p, rings);
            if (e > bestEdge) {
                bestEdge = e;
                best = p;
            }
        }
        if (best && bestEdge >= Math.max(radiusMm + 1, 3)) {
            accepted.push(best);
        }
    }

    return accepted.map(([cx, cy]) => circlePoly(cx, cy, radiusMm));
}

function bboxOf(
    rings: Array<Array<[number, number]>>,
): { x0: number; y0: number; x1: number; y1: number; w: number; h: number } {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const ring of rings) {
        for (const [x, y] of ring) {
            if (x < x0) x0 = x;
            if (y < y0) y0 = y;
            if (x > x1) x1 = x;
            if (y > y1) y1 = y;
        }
    }
    return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}

function pointInRing(p: [number, number], ring: Array<[number, number]>): boolean {
    let inside = false;
    let j = ring.length - 1;
    for (let i = 0; i < ring.length; i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        const intersects =
            yi > p[1] !== yj > p[1] &&
            p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi || 1e-12) + xi;
        if (intersects) inside = !inside;
        j = i;
    }
    return inside;
}

function isFilled(
    p: [number, number],
    rings: Array<Array<[number, number]>>,
): boolean {
    let n = 0;
    for (const ring of rings) if (pointInRing(p, ring)) n++;
    return n % 2 === 1;
}

function minEdgeDist(
    p: [number, number],
    rings: Array<Array<[number, number]>>,
): number {
    let m = Infinity;
    for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
            const a = ring[i];
            const b = ring[(i + 1) % ring.length];
            const dx = b[0] - a[0];
            const dy = b[1] - a[1];
            const l2 = dx * dx + dy * dy;
            let t = l2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2 : 0;
            t = Math.max(0, Math.min(1, t));
            const cx = a[0] + t * dx;
            const cy = a[1] + t * dy;
            const d = Math.hypot(p[0] - cx, p[1] - cy);
            if (d < m) m = d;
        }
    }
    return m;
}

function circlePoly(cx: number, cy: number, r: number, segs = 24): FlatPath {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= segs; i++) {
        const t = (i / segs) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    return { closed: true, points: pts };
}

/** Drop redundant collinear vertices so the cut path is minimal. */
function simplifyCollinear(pts: Array<[number, number]>): Array<[number, number]> {
    const ring = pts.slice(0, -1); // drop closing dup
    const n = ring.length;
    if (n < 3) return pts;
    const out: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
        const prev = ring[(i - 1 + n) % n];
        const p = ring[i];
        const next = ring[(i + 1) % n];
        const cross =
            (p[0] - prev[0]) * (next[1] - prev[1]) -
            (p[1] - prev[1]) * (next[0] - prev[0]);
        if (Math.abs(cross) > 1e-6) out.push(p);
    }
    if (out.length < 3) return pts;
    out.push(out[0]);
    return out;
}
