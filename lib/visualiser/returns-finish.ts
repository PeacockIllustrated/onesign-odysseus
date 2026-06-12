/**
 * Built-up letter FINISH palette — shared by the 3D preview, the cut-sheet PDF
 * and the saved-job config so the chosen finish round-trips and reads the same
 * everywhere. Pure data (no three.js / DOM), so any layer can import it.
 *
 * A built-up letter is a flat FACE with side-wall RETURNS bent up around it.
 * Each finish carries the face colour, a slightly deeper return-wall colour (so
 * the build-up depth reads in 3D), an edge-line colour, and the PBR feel —
 * brass is metallic; painted faces are matt.
 */

export type FaceFinish = 'brass' | 'white' | 'black';

export interface FinishSpec {
    id: FaceFinish;
    label: string;
    /** Front-cap (letter face) colour. */
    face: string;
    /** Side-wall (return) colour — a touch deeper so the build-up reads. */
    ret: string;
    /** Outline/edge colour drawn on the 3D mesh + the PDF swatch. */
    edge: string;
    metalness: number;
    roughness: number;
}

export const FACE_FINISHES: FinishSpec[] = [
    {
        id: 'brass',
        label: 'Brass',
        face: '#d9b75a',
        ret: '#b1892c',
        edge: '#6e571a',
        metalness: 0.78,
        roughness: 0.33,
    },
    {
        id: 'white',
        label: 'Painted white',
        face: '#f4f5f6',
        ret: '#d5d9dc',
        edge: '#9aa0a6',
        metalness: 0.15,
        roughness: 0.62,
    },
    {
        id: 'black',
        label: 'Painted black',
        face: '#2a2d2f',
        ret: '#17191b',
        edge: '#050607',
        metalness: 0.2,
        roughness: 0.5,
    },
];

export const DEFAULT_FACE_FINISH: FaceFinish = 'brass';

/** Resolve a (possibly missing/legacy) finish id to its spec, brass as default. */
export function finishSpec(id: FaceFinish | null | undefined): FinishSpec {
    return FACE_FINISHES.find((f) => f.id === id) ?? FACE_FINISHES[0];
}
