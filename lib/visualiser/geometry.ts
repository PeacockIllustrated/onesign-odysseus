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
    type PanelSplit,
    type FlatSegment,
    type FoldLine,
    type PanelEdge,
    type FlatPath,
    type AperturePlacement,
    type SectionLayout,
    type SectionedExport,
    type ExportWarning,
    type Returns,
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
/**
 * The forward + inverse mapping between the SVG's own coordinate system
 * (anchored at the imported bbox centre) and the flat development. Used
 * to anchor manual fixings to the lettering itself, so they follow it
 * when the placement shifts instead of staying stuck in flat-dev coords.
 */
export function placementTransform(
    dev: PanelDevelopment,
    bbox: { x: number; y: number; w: number; h: number },
    placement: AperturePlacement,
): {
    toFlat: (p: [number, number]) => [number, number];
    toLocal: (p: [number, number]) => [number, number];
} {
    const face = dev.segments.find((s) => s.role === 'face');
    if (!face || placement.scale === 0) {
        const id = (p: [number, number]): [number, number] => [p[0], p[1]];
        return { toFlat: id, toLocal: id };
    }

    const faceHalfW = face.wMm / 2;
    const faceHalfH = face.hMm / 2;
    const faceCx = face.xMm + faceHalfW;
    const faceCy = face.yMm + faceHalfH;
    const scaledHalfW = (bbox.w * placement.scale) / 2;
    const scaledHalfH = (bbox.h * placement.scale) / 2;
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
    const svgCx = bbox.x + bbox.w / 2;
    const svgCy = bbox.y + bbox.h / 2;
    const s = placement.scale;

    return {
        toFlat: ([x, y]) => [cx + (x - svgCx) * s, cy + (y - svgCy) * s],
        toLocal: ([x, y]) => [svgCx + (x - cx) / s, svgCy + (y - cy) / s],
    };
}

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
 * Place stand-off fixing holes inside the lettering — informed by how a
 * sign fixer actually does it (anchor stroke ends + corners, not stroke
 * centres). The Montserrat alphabet reference shows fixings concentrated
 * at the **tips of each stroke** and the **outer corners of each letter**,
 * not at midpoints.
 *
 * The algorithm encodes that rule geometrically:
 *
 * Per outer contour (= per letter):
 *   1. Build an eroded-interior candidate grid (filled, even-odd, ≥
 *      edgeMargin from every boundary).
 *   2. **Detect sharp convex corners on the outline** (≥ 60° turn) and
 *      inset each toward the interior by radius + edgeMargin — these are
 *      "tip seeds". Adjacent corners within a stroke-width are merged so a
 *      single tip on a wedge (e.g. the apex of A) counts once.
 *   3. Snap each tip seed to the nearest valid candidate.
 *   4. Smooth shapes (O / C / S) have no convex corners — fall back to a
 *      cardinal-style coverage (4 points on a chunky shape, 2 on a small).
 *   5. Place tip-seed fixings first (outermost first by distance from
 *      letter centroid), enforcing the no-alignment + no-crowd rules.
 *   6. Fill any remaining target slots by farthest-point sampling biased
 *      outward (so extras still go toward extremities, not the middle).
 *   7. Density > 1 → tighter target count (more fixings, for heavy metals
 *      like brass); < 1 → looser (acrylic).
 *
 * Constraints kept from the previous algorithm:
 *   - Edge margin ≥ radius + 4 mm so the hole isn't at a hairline.
 *   - Minimum centre-to-centre ≥ 2.5 × diameter (no crowding, no metal
 *     failure between holes).
 *   - Within a single letter, no two fixings share a vertical or
 *     horizontal line (reduces wobble).
 */
export function placeFixings(
    contours: FlatPath[],
    diameterMm: number,
    spacingMm?: number,
    densityFactor: number = 1,
): FlatPath[] {
    const closed = contours.filter((p) => p.closed && p.points.length > 3);
    if (closed.length === 0 || diameterMm <= 0) return [];

    const rings = closed.map((p) => p.points as Array<[number, number]>);
    if (rings.some((r) => r.length < 3)) return [];

    const radius = diameterMm / 2;
    const density = Math.min(2.5, Math.max(0.4, densityFactor || 1));
    const edgeMargin = Math.max(radius + 4, 7);
    const axisTol = Math.max(3, radius * 0.6);
    const minPairwise = Math.max(diameterMm * 2.5, 18);
    const sampleStep = Math.max(2.5, Math.min(radius * 1.8, 12));
    // Corners closer than this are the two sides of a single tip (e.g. the
    // apex of A) and get merged into one seed. spacingMm overrides as a
    // legacy escape hatch.
    const mergeSeedDist = Math.max(diameterMm * 3, 30);
    // Reserved for callers that want to pin a particular spacing.
    void spacingMm;

    // Outer contours = even containment depth.
    const depthOf = rings.map((ring, i) => {
        const probe = ring[0];
        let depth = 0;
        for (let j = 0; j < rings.length; j++) {
            if (i === j) continue;
            if (pointInRing(probe, rings[j])) depth++;
        }
        return depth;
    });

    const accepted: Array<[number, number]> = [];

    for (let i = 0; i < rings.length; i++) {
        if (depthOf[i] % 2 !== 0) continue;
        const ring = rings[i];
        const lbb = bboxOf([ring]);
        if (lbb.w <= 0 || lbb.h <= 0) continue;

        // 1. Candidate grid + per-candidate edge distance + letter centroid.
        type Cand = { p: [number, number]; edge: number; cDist: number };
        const candidates: Cand[] = [];
        let sumX = 0;
        let sumY = 0;
        for (let y = lbb.y0; y <= lbb.y1 + 1e-6; y += sampleStep) {
            for (let x = lbb.x0; x <= lbb.x1 + 1e-6; x += sampleStep) {
                const p: [number, number] = [x, y];
                if (!pointInRing(p, ring)) continue;
                if (!isFilled(p, rings)) continue;
                const e = minEdgeDist(p, rings);
                if (e < edgeMargin) continue;
                candidates.push({ p, edge: e, cDist: 0 });
                sumX += x;
                sumY += y;
            }
        }

        // Empty interior — fallback to letter centre with a relaxed margin.
        if (candidates.length === 0) {
            const p: [number, number] = [
                (lbb.x0 + lbb.x1) / 2,
                (lbb.y0 + lbb.y1) / 2,
            ];
            if (
                isFilled(p, rings) &&
                minEdgeDist(p, rings) >= Math.max(radius + 1, 3)
            ) {
                accepted.push(p);
            }
            continue;
        }
        const cx = sumX / candidates.length;
        const cy = sumY / candidates.length;
        for (const c of candidates) {
            c.cDist = Math.hypot(c.p[0] - cx, c.p[1] - cy);
        }

        // 2. Sharp convex outline corners → tip seeds, merged into clusters.
        const rawSeeds = detectTipSeeds(
            ring,
            edgeMargin + radius,
            Math.PI / 3, // 60° minimum turn
        );
        const mergedSeeds = mergeNearbyPoints(rawSeeds, mergeSeedDist);

        // 3. Snap each seed to the nearest valid candidate.
        const seedCandidates: Array<[number, number]> = [];
        for (const s of mergedSeeds) {
            let bestK = -1;
            let bestD = Infinity;
            for (let k = 0; k < candidates.length; k++) {
                const d = Math.hypot(
                    candidates[k].p[0] - s[0],
                    candidates[k].p[1] - s[1],
                );
                if (d < bestD) {
                    bestD = d;
                    bestK = k;
                }
            }
            if (bestK >= 0 && bestD <= sampleStep * 4) {
                seedCandidates.push(candidates[bestK].p);
            }
        }

        // 4. Decide the target count.
        const longDim = Math.max(lbb.w, lbb.h);
        const shortDim = Math.min(lbb.w, lbb.h);
        let tipsCount = seedCandidates.length;
        if (tipsCount === 0) {
            // Smooth shape (no detectable corners) — cardinal coverage.
            tipsCount = longDim >= 80 && shortDim >= 80 ? 4 : 2;
        } else if (tipsCount === 1) {
            // A single tip alone lets the letter pivot — bump to 2.
            tipsCount = 2;
        }
        const extra = Math.floor(Math.max(0, longDim - 250) / 250);
        let target = tipsCount + extra;
        target = Math.max(1, Math.min(30, Math.round(target * density)));

        const local: Array<[number, number]> = [];
        const accepts = (p: [number, number]): boolean => {
            for (const a of local) {
                if (Math.hypot(a[0] - p[0], a[1] - p[1]) < minPairwise)
                    return false;
                if (
                    Math.abs(a[0] - p[0]) < axisTol ||
                    Math.abs(a[1] - p[1]) < axisTol
                )
                    return false;
            }
            return true;
        };

        // 5. Place tip seeds first, outermost-first so the corners win the
        //    axisTol contest over more central seeds.
        const seedsSorted = [...seedCandidates].sort((a, b) => {
            const da = Math.hypot(a[0] - cx, a[1] - cy);
            const db = Math.hypot(b[0] - cx, b[1] - cy);
            return db - da;
        });
        for (const sp of seedsSorted) {
            if (local.length >= target) break;
            if (accepts(sp)) local.push(sp);
        }

        // No seeds landed → start with the most-extreme interior point so
        // the farthest-point pass has a sensible anchor.
        if (local.length === 0) {
            let bestK = 0;
            let bestS = -Infinity;
            for (let k = 0; k < candidates.length; k++) {
                const s = candidates[k].edge * 0.4 + candidates[k].cDist * 1.0;
                if (s > bestS) {
                    bestS = s;
                    bestK = k;
                }
            }
            local.push(candidates[bestK].p);
        }

        // 6. Fill any remaining slots with farthest-point sampling biased
        //    outward (so extras keep going toward the letter's extremities).
        while (local.length < target) {
            let pickK = -1;
            let pickS = -Infinity;
            for (let k = 0; k < candidates.length; k++) {
                const c = candidates[k];
                let dup = false;
                for (const a of local) {
                    if (a[0] === c.p[0] && a[1] === c.p[1]) {
                        dup = true;
                        break;
                    }
                }
                if (dup) continue;
                if (!accepts(c.p)) continue;
                let minD = Infinity;
                for (const a of local) {
                    const d = Math.hypot(a[0] - c.p[0], a[1] - c.p[1]);
                    if (d < minD) minD = d;
                }
                const score = minD + c.cDist * 0.3;
                if (score > pickS) {
                    pickS = score;
                    pickK = k;
                }
            }
            if (pickK < 0) break;
            local.push(candidates[pickK].p);
        }

        for (const p of local) accepted.push(p);
    }

    return accepted.map(([cx, cy]) => circlePoly(cx, cy, radius));
}

/**
 * Sharp convex outline corners of `ring`, each inset inward by `insetDist`
 * so the resulting seed sits inside the stroke (not at the cut edge).
 * Sharpness is the turn angle between incoming and outgoing edges; anything
 * shallower than `sharpThresholdRad` is treated as part of a smooth curve.
 */
function detectTipSeeds(
    ring: Array<[number, number]>,
    insetDist: number,
    sharpThresholdRad: number,
): Array<[number, number]> {
    const n = ring.length;
    if (n < 4) return [];
    const sgn = Math.sign(polySignedArea(ring));
    if (sgn === 0) return [];

    const out: Array<[number, number]> = [];
    for (let i = 0; i < n; i++) {
        const prev = ring[(i - 1 + n) % n];
        const curr = ring[i];
        const next = ring[(i + 1) % n];
        const ax = curr[0] - prev[0];
        const ay = curr[1] - prev[1];
        const bx = next[0] - curr[0];
        const by = next[1] - curr[1];
        const aL = Math.hypot(ax, ay);
        const bL = Math.hypot(bx, by);
        if (aL < 0.5 || bL < 0.5) continue;
        const cross = ax * by - ay * bx;
        if (cross * sgn <= 0) continue; // not convex for this winding
        const dot = ax * bx + ay * by;
        const turn = Math.atan2(Math.abs(cross), dot);
        if (turn < sharpThresholdRad) continue;
        // Inward bisector: average of the two edges' interior normals.
        const lax = (-ay * sgn) / aL;
        const lay = (ax * sgn) / aL;
        const lbx = (-by * sgn) / bL;
        const lby = (bx * sgn) / bL;
        let nx = lax + lbx;
        let ny = lay + lby;
        const nLen = Math.hypot(nx, ny);
        if (nLen < 1e-6) continue;
        nx /= nLen;
        ny /= nLen;
        out.push([curr[0] + nx * insetDist, curr[1] + ny * insetDist]);
    }
    return out;
}

function mergeNearbyPoints(
    pts: Array<[number, number]>,
    mergeDist: number,
): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const p of pts) {
        // <= so two corners exactly mergeDist apart (e.g. the two top
        // corners of an I-stem that happens to be diameter*3 wide) still
        // merge into a single tip.
        const dup = out.some(
            (m) => Math.hypot(m[0] - p[0], m[1] - p[1]) <= mergeDist,
        );
        if (!dup) out.push(p);
    }
    return out;
}

function polySignedArea(pts: Array<[number, number]>): number {
    let s = 0;
    const n = pts.length;
    for (let i = 0; i < n; i++) {
        const [x1, y1] = pts[i];
        const [x2, y2] = pts[(i + 1) % n];
        s += x1 * y2 - x2 * y1;
    }
    return s / 2;
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

export function circlePoly(
    cx: number,
    cy: number,
    r: number,
    segs = 24,
): FlatPath {
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

// =============================================================================
// SECTIONED EXPORT — for split signs, lay each section out as its own
// cut-ready flat blank on the same export sheet.
// =============================================================================

/** Default gap between adjacent section flat blanks in the export sheet. */
const SECTION_GAP_MM = 25;

/**
 * Build one `SectionLayout` per panel section the sign splits into.
 *
 * Returns config per section position (split signs only):
 *   - leftmost: keeps the global LEFT return; right edge is a butt join.
 *   - middle:   no left or right return (both edges are butt joins).
 *   - rightmost: keeps the global RIGHT return; left edge is a butt join.
 *   - top/bottom returns are the global value for every section.
 *
 * Single-panel signs (no split) collapse to one section with the global
 * returns — so the existing single-panel export path is unchanged.
 */
export function buildSectionedExport(
    params: PanelParams,
    split: PanelSplit,
): SectionedExport {
    const N = Math.max(1, split.sections.length);
    const sections: SectionLayout[] = [];
    let layoutOriginX = 0;
    let faceSliceX = 0;

    for (let i = 0; i < N; i++) {
        const sectionWidthMm = split.sections[i];
        const returnsUsed: Returns = {
            top: params.returns.top,
            bottom: params.returns.bottom,
            // Only the outer edges of the assembled sign get returns; the
            // internal split edges are butt joins (no fold there).
            left: i === 0 ? params.returns.left : false,
            right: i === N - 1 ? params.returns.right : false,
        };
        const sectionParams: PanelParams = {
            ...params,
            panelWidthMm: sectionWidthMm,
            returns: returnsUsed,
        };
        const development = buildDevelopment(sectionParams);
        sections.push({
            index: i,
            count: N,
            sectionWidthMm,
            faceSliceXMm: faceSliceX,
            returnsUsed,
            development,
            layoutOriginXMm: layoutOriginX,
        });
        layoutOriginX += development.totalFlatWMm + SECTION_GAP_MM;
        faceSliceX += sectionWidthMm;
    }

    const totalLayoutWMm =
        sections.length === 0 ? 0 : layoutOriginX - SECTION_GAP_MM;
    const totalLayoutHMm = sections.reduce(
        (m, s) => Math.max(m, s.development.totalFlatHMm),
        0,
    );

    return { sections, totalLayoutWMm, totalLayoutHMm, gapMm: SECTION_GAP_MM };
}

/**
 * Clip a set of aperture / fixings / keyline paths to one section and
 * translate them into the export sheet's layout coordinate space.
 *
 * Inputs are in the FULL sign's flat-development coords. Output is in the
 * export sheet coords (i.e. already offset by `layoutOriginXMm`) so the
 * DXF / PDF generators can emit them as-is.
 *
 * Apertures that straddle a seam are correctly split between two sections.
 */
export function clipApertureToSection(
    fullDev: PanelDevelopment,
    section: SectionLayout,
    paths: FlatPath[],
): FlatPath[] {
    if (paths.length === 0) return [];
    const fullFace = fullDev.segments.find((s) => s.role === 'face');
    const sectionFace = section.development.segments.find(
        (s) => s.role === 'face',
    );
    if (!fullFace || !sectionFace) return [];

    // The full face is shorter than nominal by T/2 on each side that has a
    // return; the same per-mm-of-nominal-face scaling is applied to map a
    // nominal slice X into full-flat-dev coords. ≤ 0.5 % over typical face
    // widths, but doing it properly avoids a creeping mis-alignment.
    const k = fullDev.faceNominalWMm
        ? fullFace.wMm / fullDev.faceNominalWMm
        : 1;
    const sliceX0 = fullFace.xMm + section.faceSliceXMm * k;
    const sliceX1 =
        fullFace.xMm + (section.faceSliceXMm + section.sectionWidthMm) * k;
    const rect = {
        x0: sliceX0,
        y0: fullFace.yMm,
        x1: sliceX1,
        y1: fullFace.yMm + fullFace.hMm,
    };

    const clipped: FlatPath[] = [];
    for (const p of paths) {
        if (p.closed) {
            const ring = p.points.slice(0, -1) as Array<[number, number]>;
            const c = clipPolygonToRect(ring, rect);
            if (c.length >= 3) {
                c.push(c[0]);
                clipped.push({ closed: true, points: c });
            }
        } else {
            const runs = clipPolylineToRect(
                p.points as Array<[number, number]>,
                rect,
            );
            for (const r of runs) {
                if (r.length >= 2) clipped.push({ closed: false, points: r });
            }
        }
    }
    if (clipped.length === 0) return [];

    // Translate from full-dev slice space into the export sheet space:
    //   subtract the slice origin in full-dev → section-face-relative,
    //   then add (sectionFace origin + layoutOriginX) → export sheet.
    const dx = section.layoutOriginXMm + sectionFace.xMm - sliceX0;
    const dy = sectionFace.yMm - fullFace.yMm;
    return clipped.map((p) => ({
        closed: p.closed,
        points: p.points.map(
            ([x, y]) => [x + dx, y + dy] as [number, number],
        ),
    }));
}

/**
 * Pre-export checks. All advisory — these surface warnings but never block
 * the download. The user normally wants to reposition / adjust based on
 * the warning rather than ship a problematic cut file.
 */
export function validateExport(opts: {
    params: PanelParams;
    split: PanelSplit;
    development: PanelDevelopment;
    aperture: FlatPath[];
    fixings: FlatPath[];
    apertureClipped: boolean;
}): ExportWarning[] {
    const { params, split, development: dev, aperture, fixings } = opts;
    const warnings: ExportWarning[] = [];

    if (!params.materialLabel || params.materialLabel.trim() === '') {
        warnings.push({
            kind: 'missing_material',
            message:
                "Material / finish is blank — recipients won't know what stock to cut from.",
        });
    }

    if (opts.apertureClipped) {
        warnings.push({
            kind: 'aperture_clipped',
            message:
                'Aperture or keyline extended past the face and was clipped — reposition or shrink so every cut stays on-face.',
        });
    }

    // Aperture polygon points too close to a fold line — fold may crack.
    const T = params.materialThicknessMm;
    const foldMargin = Math.max(T / 2 + 4, 6);
    outerFold: for (const f of dev.foldLines) {
        for (const ap of aperture) {
            for (const pt of ap.points) {
                if (
                    distPointToSegment(pt, [f.x1, f.y1], [f.x2, f.y2]) <
                    foldMargin
                ) {
                    warnings.push({
                        kind: 'aperture_near_fold',
                        message: `An aperture sits within ${foldMargin.toFixed(0)} mm of a fold line — the fold may crack there. Move the artwork inward.`,
                    });
                    break outerFold;
                }
            }
        }
    }

    // Seam-related checks (only when the sign actually splits).
    if (split.wasSplit) {
        const face = dev.segments.find((s) => s.role === 'face');
        if (face) {
            const k = dev.faceNominalWMm
                ? face.wMm / dev.faceNominalWMm
                : 1;
            const seamXsFlat = split.seamXsMm.map((sx) => face.xMm + sx * k);
            const diameter =
                params.fixingDiameterMm ??
                (params.fixingRadiusMm ? params.fixingRadiusMm * 2 : 10);
            const fixingTol = Math.max(diameter * 1.5, 15);
            const apertureSeamTol = 5;

            // A fixing sitting on a seam ends up at the panel edge.
            outerFix: for (const fx of fixings) {
                const cx =
                    fx.points.reduce((a, p) => a + p[0], 0) / fx.points.length;
                for (const sx of seamXsFlat) {
                    if (Math.abs(cx - sx) < fixingTol) {
                        warnings.push({
                            kind: 'fixing_on_seam',
                            message: `A fixing sits within ${fixingTol.toFixed(0)} mm of a panel seam — it'll be cut at the panel edge. Reposition or change the split.`,
                        });
                        break outerFix;
                    }
                }
            }

            // Aperture crossing a seam means artwork split across two panels.
            outerAp: for (const ap of aperture) {
                for (const pt of ap.points) {
                    for (const sx of seamXsFlat) {
                        if (Math.abs(pt[0] - sx) < apertureSeamTol) {
                            warnings.push({
                                kind: 'aperture_on_seam',
                                message: `An aperture crosses or sits within ${apertureSeamTol} mm of a panel seam — the artwork will be split across two panels.`,
                            });
                            break outerAp;
                        }
                    }
                }
            }
        }
    }

    return warnings;
}

function distPointToSegment(
    p: [number, number],
    a: [number, number],
    b: [number, number],
): number {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    let t = len2 > 0 ? ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}
