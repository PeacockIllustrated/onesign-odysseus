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
 * Placement offsets are mm from the face top-left; the artwork's own bbox
 * origin is normalised out so (0,0) offset = artwork flush to the face
 * corner. `scale` multiplies the artwork's native units.
 */
export function placeAperture(
    dev: PanelDevelopment,
    paths: FlatPath[],
    bbox: { x: number; y: number },
    placement: AperturePlacement,
): FlatPath[] {
    const face = dev.segments.find((s) => s.role === 'face');
    if (!face) return [];
    const ox = face.xMm + placement.offsetXMm;
    const oy = face.yMm + placement.offsetYMm;
    return paths.map((p) => ({
        closed: p.closed,
        points: p.points.map(
            ([x, y]) =>
                [
                    ox + (x - bbox.x) * placement.scale,
                    oy + (y - bbox.y) * placement.scale,
                ] as [number, number],
        ),
    }));
}
