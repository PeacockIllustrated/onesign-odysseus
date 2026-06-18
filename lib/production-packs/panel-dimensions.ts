/**
 * Plain-language panel/tray dimension breakdown for the production pack.
 *
 * A folded tray has several sizes that get confused on the floor — the visible
 * FACE, the full UNFOLDED flat blank you actually cut from sheet, the return
 * depth and the shadow-gap lip. This spells each one out (label + value) and
 * adds a short callout explaining what each number means, so "overall size" is
 * never ambiguous. Pure + framework-neutral, unit-tested.
 */

export interface PanelDimensionInput {
    /** Visible face size (the front of the finished sign), mm. */
    faceWmm: number;
    faceHmm: number;
    /** Full unfolded flat blank size (what you cut flat from sheet), mm. */
    blankWmm: number;
    blankHmm: number;
    /** Return depth — how far the tray stands off the wall, mm. */
    returnDepthMm: number;
    /** Shadow-gap lip depth, mm (0 = none). */
    shadowGapMm: number;
    /** Which edges carry the shadow-gap lip (defaults to top & bottom). */
    shadowGapEdges?: {
        top?: boolean;
        bottom?: boolean;
        left?: boolean;
        right?: boolean;
    };
    materialLabel: string;
    gaugeMm: number;
    /** Finish colour (RAL or hex); omitted from the table when empty. */
    colour: string;
}

export interface PanelDimensions {
    specRows: { label: string; value: string }[];
    callouts: string[];
}

const r = (n: number) => Math.round(n);

function shadowGapEdgeList(edges: PanelDimensionInput['shadowGapEdges']): string {
    const e = edges ?? {};
    const on = [
        e.top && 'top',
        e.bottom && 'bottom',
        e.left && 'left',
        e.right && 'right',
    ].filter(Boolean) as string[];
    if (on.length === 0) return 'top & bottom';
    return on.join(' & ');
}

export function panelDimensionBreakdown(
    input: PanelDimensionInput,
): PanelDimensions {
    const sg = Math.max(0, input.shadowGapMm);
    const where = shadowGapEdgeList(input.shadowGapEdges);
    const plural = where.includes('&') ? 'edges' : 'edge';

    const specRows: { label: string; value: string }[] = [
        { label: 'Face size (visible front)', value: `${r(input.faceWmm)} × ${r(input.faceHmm)} mm` },
        { label: 'Unfolded flat blank (cut size)', value: `${r(input.blankWmm)} × ${r(input.blankHmm)} mm` },
        { label: 'Return depth (off the wall)', value: `${r(input.returnDepthMm)} mm` },
    ];
    if (sg > 0) {
        specRows.push({ label: `Shadow-gap lip (${where})`, value: `${r(sg)} mm` });
    }
    specRows.push(
        { label: 'Material', value: input.materialLabel },
        { label: 'Gauge', value: `${input.gaugeMm} mm` },
    );
    if (input.colour) specRows.push({ label: 'Colour', value: input.colour });

    const callouts: string[] = [
        `Face size — the visible front of the finished sign (${r(input.faceWmm)} × ${r(input.faceHmm)} mm).`,
        `Unfolded flat blank — the full developed size cut flat from sheet (${r(input.blankWmm)} × ${r(input.blankHmm)} mm): face + returns + lips, less the bend allowance. Fold on the dashed lines to form the tray.`,
        `Return depth — how far the tray stands off the wall: a ${r(input.returnDepthMm)} mm deep box.`,
    ];
    if (sg > 0) {
        callouts.push(
            `Shadow gap — a ${r(sg)} mm lip folded in at the ${where} ${plural}, so the face reads as a floating panel.`,
        );
    }

    return { specRows, callouts };
}
