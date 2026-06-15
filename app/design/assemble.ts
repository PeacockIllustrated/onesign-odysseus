// app/design/assemble.ts
//
// Assemble the customer's in-progress design into the payload the lead
// submission records — exactly as the staff tool would save it: the main panel
// with any projecting blade nested inside, each panel's artwork flattened to a
// single SVG, and a plain-English sign description for the inbox. Extracted from
// the old PublicActionBar so the wizard's "Send" step reuses the identical,
// proven assembly (and so it can be unit-tested in isolation later).

import { splitPanels } from '../(portal)/admin/visualiser/store';
import { composeLayersSvg } from '@/lib/visualiser/compose';
import type { PanelParams } from '@/lib/visualiser/types';

export interface DesignPayload {
    params: PanelParams;
    svgSource: string | null;
    signType: string;
    thumbnail: string | null;
}

/** Everything `splitPanels` needs from the live store, plus the projecting
 *  mount. Derived from `splitPanels`' own parameter type so it can't drift. */
export type AssembleInput = Parameters<typeof splitPanels>[0] & {
    mount: PanelParams extends { projectingSign?: infer P }
        ? P extends { mount: infer M }
            ? M
            : never
        : never;
};

/** Flatten a panel's artwork layers into one SVG (or its raw uploaded SVG). */
function flattenSvg(
    p: {
        artworkLayers?: PanelParams['artworkLayers'];
        panelWidthMm: number;
        panelHeightMm: number;
    },
    raw: string | null,
): string | null {
    const layers = p.artworkLayers ?? [];
    return layers.length
        ? composeLayersSvg(layers, p.panelWidthMm, p.panelHeightMm)
        : raw;
}

/** A plain-English summary of what the customer built, for the lead + inbox. */
export function describeSign(
    params: PanelParams,
    projectingEnabled: boolean,
): string {
    const groups = params.materialGroups ?? [];
    const has = (m: string) => groups.some((g) => g.material === m);
    let base: string;
    if (has('standoff') || params.apertureMode === 'standoff') {
        base = 'Stand-off lettering';
    } else if (has('pushthrough')) {
        base = 'Push-through sign';
    } else if (
        params.apertureMode === 'aperture' &&
        (params.artworkLayers?.length || params.aperturePlacement)
    ) {
        base = 'Aperture (cut-out) sign';
    } else {
        base = 'Folded aluminium panel';
    }
    const extras: string[] = [];
    if (params.illumination?.keyline?.enabled) extras.push('illuminated');
    if (has('vinyl')) extras.push('vinyl');
    let label = extras.length ? `${base} · ${extras.join(', ')}` : base;
    if (projectingEnabled) label += ' + projecting sign';
    return label;
}

/**
 * Build the full design payload (sans thumbnail — the caller captures a face-on
 * preview at send time and adds it). Identical behaviour to the old
 * PublicActionBar.assemble().
 */
export function assembleDesignPayload(s: AssembleInput): DesignPayload {
    const { main, projecting } = splitPanels(s);
    const mainSvg = flattenSvg(main.params, main.svgSource);
    let projectingSign: PanelParams['projectingSign'];
    if (projecting) {
        const bladeCore = { ...projecting.params };
        delete (bladeCore as { projectingSign?: unknown }).projectingSign;
        projectingSign = {
            panel: bladeCore,
            mount: s.mount,
            svgSource: flattenSvg(projecting.params, projecting.svgSource),
        };
    }
    return {
        params: { ...main.params, projectingSign },
        svgSource: mainSvg,
        signType: describeSign(main.params, s.projectingEnabled),
        thumbnail: null,
    };
}
