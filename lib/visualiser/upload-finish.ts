// =============================================================================
// UPLOAD FINISH HELPERS (public studio)
// =============================================================================
//
// The public /design studio asks the customer to choose a finish BEFORE their
// uploaded SVG lands on the sign (the UploadFinishModal). These pure helpers do
// the colour work behind that flow:
//
//   * normalise each imported path's resolved colour (svg-import passes the
//     source colour through verbatim — hex, rgb(), or a CSS name),
//   * cluster the upload's outer shapes by colour, so a two-colour logo
//     becomes two material groups,
//   * match each cluster's colour to the nearest stock swatch for the chosen
//     finish (acrylic library for acrylic-based letters, RAL for solid vinyl).
//
// DOM-free and Vitest-covered, in the spirit of the nesting/returns engines.

import { nearestAcrylic } from './acrylic';
import { nearestRal } from './ral';
import type { FlatPath } from './types';

/**
 * The acrylic sheet thicknesses the public studio offers (mm). Staff keep
 * free-type entry; customers pick from what's actually going to be stocked.
 */
export const ACRYLIC_THICKNESSES_MM = [3, 5, 20] as const;

type GroupMaterial =
    | 'cut'
    | 'solid'
    | 'vinyl'
    | 'acrylic'
    | 'standoff'
    | 'pushthrough'
    | 'backlight';

/** The small set of CSS colour names artwork tools actually emit. */
const NAMED: Record<string, string> = {
    black: '#000000',
    white: '#ffffff',
    red: '#ff0000',
    green: '#008000',
    blue: '#0000ff',
    yellow: '#ffff00',
    orange: '#ffa500',
    purple: '#800080',
    grey: '#808080',
    gray: '#808080',
};

/**
 * Normalise a CSS colour to lowercase #rrggbb, or null when it can't be read.
 * Handles #rgb, #rrggbb, rgb(r, g, b) and the common named colours.
 */
export function toHex6(colour: string | undefined | null): string | null {
    if (!colour) return null;
    const c = colour.trim().toLowerCase();
    if (/^#[0-9a-f]{6}$/.test(c)) return c;
    if (/^#[0-9a-f]{3}$/.test(c)) {
        return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
    }
    const rgb = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(c);
    if (rgb) {
        const to2 = (n: string) =>
            Math.min(255, parseInt(n, 10)).toString(16).padStart(2, '0');
        return `#${to2(rgb[1])}${to2(rgb[2])}${to2(rgb[3])}`;
    }
    return NAMED[c] ?? null;
}

/** A path's colour for finish matching. SVG paints black when unspecified. */
export function pathColour(p: FlatPath): string {
    return toHex6(p.stroke) ?? '#000000';
}

export interface ColourCluster {
    /** Normalised #rrggbb shared by every member. */
    colour: string;
    /** Member indices — same index space as the `indices` argument. */
    indices: number[];
}

/**
 * Cluster a set of path indices by their resolved colour, preserving
 * first-seen order (so the biggest visual feature usually lists first).
 */
export function clusterByColour(
    paths: FlatPath[],
    indices: number[],
): ColourCluster[] {
    const byColour = new Map<string, number[]>();
    for (const i of indices) {
        const p = paths[i];
        if (!p) continue;
        const colour = pathColour(p);
        const list = byColour.get(colour);
        if (list) list.push(i);
        else byColour.set(colour, [i]);
    }
    return Array.from(byColour, ([colour, idx]) => ({
        colour,
        indices: idx,
    }));
}

/**
 * The stock colour a cluster lands on for a chosen finish: acrylic-based
 * letters snap to the nearest sheet in the acrylic library, solid vinyl to
 * the nearest RAL, backlight keeps the artwork colour (glow is emissive, any
 * colour is valid). Cut / solid / printed vinyl carry no colour of their own.
 */
export function matchedStockColour(
    material: GroupMaterial,
    artworkColour: string,
    opts: { printFullColor?: boolean } = {},
): string | undefined {
    if (
        material === 'acrylic' ||
        material === 'standoff' ||
        material === 'pushthrough'
    ) {
        return nearestAcrylic(artworkColour).colour.hex;
    }
    if (material === 'vinyl') {
        // Printed full-colour vinyl takes its colours from the artwork itself.
        if (opts.printFullColor !== false) return undefined;
        return nearestRal(artworkColour).hex;
    }
    if (material === 'backlight') return artworkColour;
    return undefined;
}
