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
