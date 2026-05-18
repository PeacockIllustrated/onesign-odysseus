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
 */

import { MAX_PANEL_WIDTH_MM, type PanelSplit } from './types';

export function splitPanels(
    faceWidthMm: number,
    maxWidthMm: number = MAX_PANEL_WIDTH_MM,
): PanelSplit {
    if (faceWidthMm <= maxWidthMm) {
        return {
            sections: [round(faceWidthMm)],
            seamXsMm: [],
            centreIndex: 0,
            wasSplit: false,
        };
    }

    // Smallest odd section count whose equal side panels also fit the sheet.
    let n = Math.ceil(faceWidthMm / maxWidthMm);
    if (n % 2 === 0) n += 1; // force odd → real centre panel
    while ((faceWidthMm - maxWidthMm) / (n - 1) > maxWidthMm) {
        n += 2;
    }

    const sidePanels = (n - 1) / 2; // per side
    const centreW = maxWidthMm; // centre is the largest full panel
    const sideW = (faceWidthMm - centreW) / (n - 1); // equal side panels

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
