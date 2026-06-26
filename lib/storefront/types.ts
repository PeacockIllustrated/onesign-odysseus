/**
 * Storefront Studio — parametric types.
 *
 * A storefront is reconstructed as a set of primitive BLOCKS (boxes), never an
 * AI mesh: storefronts are made of primitives, so a deterministic block model
 * is accurate, editable, and to-scale. Everything is in MILLIMETRES in one
 * coordinate space, so a sign from the visualiser (also mm) drops into the
 * fascia mount at exact 1:1 scale.
 *
 * The flow: a measured `StorefrontSpec` (ideally derived from a survey or a
 * calibrated photo trace — see `trace.ts`) → `specToBlocks` (`geometry.ts`) →
 * `StorefrontBlock[]` the R3F surface renders. Framework-neutral + DOM-free so
 * it is unit-testable, in the spirit of the visualiser/nesting engines.
 *
 * Coordinate convention: x = left→right, z = ground→up, y = depth where
 * NEGATIVE y is toward the street/viewer (proud elements) and positive y is
 * into the building. Z = 0 is the pavement.
 */

/** Surface kinds — resolved to colour + finish (glass/keyline) by the renderer. */
export type StorefrontMaterial =
    | 'frame' // mullions, posts, jamb, pilaster, transom
    | 'trim' // darker borders / capital
    | 'wall' // back wall / interior
    | 'glass' // glazing (translucent)
    | 'signField' // recessed fascia panel — the visualiser sign mount
    | 'keyline' // illuminated LED keyline (emissive)
    | 'panel' // stallriser / door bottom panel
    | 'handle';

export const STOREFRONT_MATERIALS: StorefrontMaterial[] = [
    'frame',
    'trim',
    'wall',
    'glass',
    'signField',
    'keyline',
    'panel',
    'handle',
];

/** One primitive block in mm (min corner + extents) with a material. */
export interface StorefrontBlock {
    id: string;
    name: string;
    /** Min-corner position (mm). */
    x: number;
    y: number;
    z: number;
    /** Extents (mm). */
    w: number;
    d: number;
    h: number;
    material: StorefrontMaterial;
}

/**
 * The parametric specification — element dimensions in mm. `specToBlocks`
 * derives every block (incl. mid-post, transom, keyline, mullion grid, sign
 * mount) from these, so the spec stays small and the geometry stays consistent.
 */
export interface StorefrontSpec {
    /** Total frontage width (mm). */
    widthMm: number;
    /** Ground → top of fascia (mm). */
    heightMm: number;
    /** Front-to-back wall depth shown (mm). */
    wallDepthMm: number;
    /** Fascia banner height (mm). */
    fasciaHeightMm: number;
    /** Height of the door/window head off the ground (mm). */
    doorHeadMm: number;
    /** Stallriser (solid base under the window) height (mm). */
    stallriserHeightMm: number;
    /** Right pilaster width (mm). */
    pilasterWidthMm: number;
    /** Left jamb width (mm). */
    jambWidthMm: number;
    door: {
        /** Left edge of the door zone (mm from frontage left). */
        xMm: number;
        widthMm: number;
        /** Solid panel height at the door base (mm). */
        bottomPanelMm: number;
        /** Glazing grid. */
        cols: number;
        rows: number;
    };
    window: {
        /** Left edge of the window zone (mm from frontage left). */
        xMm: number;
        widthMm: number;
    };
    /** Per-material hex colours (defaults to the blue template). */
    colours: Record<StorefrontMaterial, string>;
}

/** The blue "7th Heaven" design-language palette (image 1 / the close-up mockup). */
export const DEFAULT_COLOURS: Record<StorefrontMaterial, string> = {
    frame: '#3f7cb0',
    trim: '#2c5d8a',
    wall: '#5a9bd4',
    glass: '#cfe9fb',
    signField: '#3a70a2',
    keyline: '#fff7e0',
    panel: '#4a8cc0',
    handle: '#e8b54a',
};

/**
 * The default blue shopfront template — the proportions measured off the design
 * (fascia ≈ 25% of height). A new project starts here and is then resized to
 * the real unit via survey measurements or a photo trace (`traceToSpec`).
 */
export const DEFAULT_TEMPLATE: StorefrontSpec = {
    widthMm: 4200,
    heightMm: 3100,
    wallDepthMm: 150,
    fasciaHeightMm: 775,
    doorHeadMm: 2100,
    stallriserHeightMm: 450,
    pilasterWidthMm: 400,
    jambWidthMm: 150,
    door: { xMm: 150, widthMm: 1000, bottomPanelMm: 500, cols: 3, rows: 5 },
    window: { xMm: 1300, widthMm: 2500 },
    colours: { ...DEFAULT_COLOURS },
};
