/**
 * Oversized-sign panel splitting.
 *
 * Aluminium sheet caps the fabricable panel width at MAX_PANEL_WIDTH_MM. When
 * the sign face is wider, we split it into vertical sections. The logo is
 * normally dead-centre, so the rule is: keep ONE full panel centred and as
 * large as possible (the logo lands on one unbroken sheet), with equal-width
 * side panels. We force an ODD section count so a true centre panel always
 * exists — an even count would put a seam through the middle, straight across
 * the logo, which defeats the purpose.
 *
 * The centre width can be overridden (`centreOverrideMm`) when the shop has
 * an oddball off-cut to use up — e.g. a 4 m fascia normally splits 505 +
 * 2990 + 505, but with a 2500 mm centre override it becomes 750 + 2500 +
 * 750. The override is clamped to fit a single sheet, and the side count
 * grows automatically if the sides would otherwise exceed the sheet too.
 */

import { MAX_PANEL_WIDTH_MM, type PanelSplit } from './types';

export function splitPanels(
    faceWidthMm: number,
    maxWidthMm: number = MAX_PANEL_WIDTH_MM,
    centreOverrideMm?: number | null,
): PanelSplit {
    if (faceWidthMm <= maxWidthMm) {
        return {
            sections: [round(faceWidthMm)],
            seamXsMm: [],
            centreIndex: 0,
            wasSplit: false,
        };
    }

    // Centre width: override if supplied and sensible, else the full sheet.
    // Must fit a single sheet and leave at least a sliver for each side.
    let centreW = maxWidthMm;
    if (
        centreOverrideMm != null &&
        centreOverrideMm > 0 &&
        centreOverrideMm <= maxWidthMm &&
        centreOverrideMm < faceWidthMm
    ) {
        centreW = centreOverrideMm;
    }

    // Smallest odd section count whose equal side panels also fit the sheet
    // given the chosen centre width.
    const sideTotal = faceWidthMm - centreW;
    let n = 1 + 2 * Math.max(1, Math.ceil(sideTotal / 2 / maxWidthMm));
    while ((sideTotal / (n - 1)) > maxWidthMm) {
        n += 2;
    }

    const sidePanels = (n - 1) / 2; // per side
    const sideW = sideTotal / (n - 1); // equal side panels

    const sections: number[] = [];
    for (let i = 0; i < sidePanels; i++) sections.push(round(sideW));
    const centreIndex = sections.length;
    sections.push(round(centreW));
    for (let i = 0; i < sidePanels; i++) sections.push(round(sideW));

    // Seam X positions: cumulative section boundaries (exclude the far edge).
    const seamXsMm: number[] = [];
    let acc = 0;
    for (let i = 0; i < sections.length - 1; i++) {
        acc += sections[i];
        seamXsMm.push(round(acc));
    }

    return { sections, seamXsMm, centreIndex, wasSplit: true };
}

function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}
