/**
 * Extra-face material catalog + piece derivation.
 *
 * An "extra face" is a decorative metal face (brass / stainless / …) laminated
 * over a letter — a second cut layer in the same outline + counters as the
 * underlying push-through / aperture-cut / backlit letter. Production cuts it
 * from sheet metal and bonds it on the front; on export it nests exactly like
 * an acrylic face (one material per nest) and hands off to the acrylic nester.
 *
 * This module is DOM-free and pure, so it's unit-testable and safe to import
 * from both the (client) derivation hook and the (server) export/handoff
 * action. The 3D look (PBR hints) lives here too, kept out of the zod types
 * module so that stays dependency-light.
 */

import type { ExtraFacePiece, FaceMaterial, FlatPath } from './types';

export interface FaceMaterialSpec {
    /** Human label for the picker, swatches and export filenames. */
    label: string;
    /** sRGB preview hex for the 3D face + cut-sheet swatch. */
    color: string;
    /** three.js meshStandardMaterial hints (1 = full metal). */
    metalness: number;
    roughness: number;
    /** Default sheet thickness (mm) this stock is usually cut at. */
    defaultThicknessMm: number;
}

/**
 * The selectable face stock. Brass is the everyday default; the rest are the
 * common metal finishes. Adding a finish is: extend `FaceMaterialEnum`
 * (types.ts) + add a row here — nothing else needs to change.
 */
export const FACE_MATERIALS: Record<FaceMaterial, FaceMaterialSpec> = {
    brass: { label: 'Brass', color: '#b08d57', metalness: 1, roughness: 0.35, defaultThicknessMm: 1.5 },
    stainless: { label: 'Stainless', color: '#c7ccd1', metalness: 1, roughness: 0.28, defaultThicknessMm: 1.5 },
    aluminium: { label: 'Aluminium', color: '#d6d9dc', metalness: 1, roughness: 0.42, defaultThicknessMm: 2 },
    copper: { label: 'Copper', color: '#b87333', metalness: 1, roughness: 0.32, defaultThicknessMm: 1.5 },
    mirror: { label: 'Mirror polish', color: '#e8edf0', metalness: 1, roughness: 0.05, defaultThicknessMm: 1.5 },
};

/** Ordered keys for building pickers without relying on object key order. */
export const FACE_MATERIAL_ORDER: FaceMaterial[] = [
    'brass',
    'stainless',
    'aluminium',
    'copper',
    'mirror',
];

/** A letter the extra face sits on — the geometry the face is cut to match. */
export interface FaceableLetter {
    pathIndex: number;
    /** Outer outline in flat-development mm. */
    path: FlatPath;
    /** Counter contours (cut as holes in the face), flat-development mm. */
    holes?: FlatPath[];
    /** Z (mm) of the underlying letter's front surface, for the 3D scene. */
    frontZMm: number;
}

/**
 * Build the extra-face cut pieces for one faced group: each letter gets a
 * metal face with the same outline + counters. Pure mapping — the geometry is
 * the letter's own (the face is coincident with the letter face), so this is
 * deliberately thin; the value is one place that stamps the resolved material
 * colour + thickness onto every piece.
 */
export function deriveExtraFacePieces(
    letters: FaceableLetter[],
    material: FaceMaterial,
    thicknessMm: number,
): ExtraFacePiece[] {
    const spec = FACE_MATERIALS[material];
    const t = thicknessMm > 0 ? thicknessMm : spec.defaultThicknessMm;
    return letters.map((l) => ({
        pathIndex: l.pathIndex,
        path: l.path,
        holes: l.holes && l.holes.length > 0 ? l.holes : undefined,
        material,
        color: spec.color,
        thicknessMm: t,
        frontZMm: l.frontZMm,
    }));
}
