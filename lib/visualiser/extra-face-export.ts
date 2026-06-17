/**
 * Extra metal faces → nest SVG (one material, cut files for the acrylic nester).
 *
 * "Send metal faces to nester" hands the nester ONE SVG of the brass (or other
 * metal) faces: each letter's outer outline plus its counters, all as separate
 * `<path>` elements under a single material-named group (e.g. `BRASS_FACES`).
 * The nester re-reads the counters as holes via even-odd containment — the same
 * contract the built-up-returns FACES group uses (returns-export.ts).
 *
 * True mm (1 user unit = 1 mm) so any CAM import reads real size. DOM-free
 * string building, so it's unit-testable alongside the geometry engines.
 */

import type { ExtraFacePiece, FaceMaterial } from './types';
import { FACE_MATERIALS } from './extra-face';
import { buildNestSvg } from './nest-export';

/** Material key → group id, e.g. 'brass' → 'BRASS_FACES'. */
export function faceGroupId(material: FaceMaterial): string {
    return `${material.toUpperCase()}_FACES`;
}

export interface ExtraFaceNestSvgInput {
    pieces: ExtraFacePiece[];
    material: FaceMaterial;
    /** File comment, e.g. "ACME — brass faces". */
    title: string;
}

/**
 * Build the nest SVG for a set of single-material extra-face pieces. Thin
 * wrapper over the generic `buildNestSvg` (shared with the acrylic hand-off)
 * that names the group after the metal.
 */
export function buildExtraFaceNestSvg({
    pieces,
    material,
    title,
}: ExtraFaceNestSvgInput): string {
    const spec = FACE_MATERIALS[material];
    return buildNestSvg(pieces, faceGroupId(material), `${title} (${spec.label})`);
}
