/**
 * Plain-English "what's in your sign" summary for the CLIENT.
 *
 * Reads a saved design's PanelParams and lists the pieces/materials in friendly
 * language — no cut files, no departments, no production detail. Used on the
 * tokenised artwork-approval page (`/sign-off`) to give the client a simple
 * breakdown alongside the interactive 3D, so they know what they're approving.
 *
 * Pure + framework-neutral so it's unit-testable and safe to import into the
 * unauth approval surface.
 */

import type { PanelParams, FaceMaterial } from './types';
import { FACE_MATERIALS } from './extra-face';

/**
 * One friendly line per distinct piece/material in the sign, always led by the
 * tray. De-duplicated and in reading order. Returns at least the tray.
 */
export function summariseSignPieces(params: PanelParams): string[] {
    const out: string[] = [];
    const add = (line: string) => {
        if (line && !out.includes(line)) out.push(line);
    };

    // The carcass — always present.
    const colour = params.panelRal ?? params.panelColor ?? null;
    add(
        colour
            ? `Folded aluminium tray (${colour})`
            : 'Folded aluminium tray',
    );

    const groups = params.materialGroups ?? [];
    const hasVinyl = (full: boolean) =>
        groups.some((g) => g.material === 'vinyl' && !!g.printFullColor === full);

    for (const g of groups) {
        switch (g.material) {
            case 'pushthrough':
                add('Push-through acrylic letters');
                break;
            case 'acrylic':
                add('Face-stuck acrylic');
                break;
            case 'standoff':
                add('Stood-off letters');
                break;
            case 'backlight':
                add('Backlit / illuminated detail');
                break;
            // 'cut' + 'solid' are the tray itself — not a separate client piece.
            default:
                break;
        }
        // A metal face laminated over the letter (brass / stainless / …).
        if (g.extraFace) {
            const mat = g.extraFace.material as FaceMaterial;
            add(`${FACE_MATERIALS[mat]?.label ?? 'Metal'} faces`);
        }
    }

    if (hasVinyl(true)) add('Printed vinyl graphics');
    if (hasVinyl(false)) add('Cut vinyl graphics');

    // Halo from the opal backing when the sign is keyline-illuminated.
    if (params.illumination?.keyline?.enabled) {
        add('Halo-illuminated (keyline)');
    }

    return out;
}
