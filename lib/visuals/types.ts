/**
 * Types for the in-situ mockup prompt engine.
 *
 * A `SignSpec` is a normalised, source-neutral description of a single sign:
 * its form, face material, colour, illumination and mounting, plus the wording
 * it carries. Adapters (see `from-pack.ts`) translate a real record — a
 * production-pack section, an artwork item, a visualiser design — into this
 * shape; the composer (`compose.ts`) turns it + a chosen scene into a prompt
 * for an AI image model.
 *
 * The enumerated vocabularies below mirror the reliable, enum-backed choices
 * that already exist in the app (visualiser `materialGroups[].material`,
 * `FaceMaterialEnum`, artwork `component_type` / `lighting`), curated down to
 * the dimensions that actually change how a sign *looks* installed. This module
 * is framework-neutral and DOM-free so it is unit-testable and reusable by
 * server actions and client UI alike.
 */

// =============================================================================
// SPEC VOCABULARY (the enum-backed, honable dimensions)
// =============================================================================

/** The overall form/type of the sign — the single biggest driver of the look. */
export const SIGN_FORMS = [
    'fascia_panel',
    'built_up_letters',
    'flat_cut_letters',
    'acrylic_letters',
    'push_through_letters',
    'channel_letters',
    'projecting_blade',
    'window_vinyl',
    'monument_totem',
] as const;
export type SignForm = (typeof SIGN_FORMS)[number];

/** What the visible face is made of / finished as. */
export const FACE_MATERIALS = [
    'brushed_aluminium',
    'painted_aluminium',
    'brass',
    'stainless',
    'copper',
    'mirror',
    'acrylic',
    'printed_vinyl',
    'dibond',
    'foamex',
] as const;
export type FaceMaterial = (typeof FACE_MATERIALS)[number];

/** How (and whether) the sign is lit. */
export const ILLUMINATIONS = ['none', 'halo', 'face_lit', 'edge_lit', 'backlit'] as const;
export type Illumination = (typeof ILLUMINATIONS)[number];

/** How the sign is fixed to its surface — changes shadow + depth cues. */
export const MOUNTINGS = ['flush', 'stood_off', 'projecting'] as const;
export type Mounting = (typeof MOUNTINGS)[number];

/**
 * A normalised, source-neutral description of one sign. Free-text `colour`,
 * `dimensions` and `notes` ride alongside the enums so nothing in a richer
 * source record is lost — the composer folds them in verbatim.
 */
export interface SignSpec {
    /** The wording rendered on the sign (e.g. "ONESIGN"). May be empty if unknown. */
    text: string;
    form: SignForm;
    faceMaterial: FaceMaterial;
    /** Free-text colour / RAL, e.g. "RAL 9005 black" or "#c0c0c0". Optional. */
    colour?: string;
    illumination: Illumination;
    mounting: Mounting;
    /** Free-text overall size, e.g. "2400 × 600 mm". Optional. */
    dimensions?: string;
    /** Extra construction notes (from callouts / spec text) folded in verbatim. */
    notes?: string[];
}

// =============================================================================
// SCENE / CONTEXT (chosen, not derived — the spec doesn't carry a backdrop)
// =============================================================================

/** The setting the sign is rendered into. "In-situ" needs a backdrop. */
export const SCENES = [
    'modern_storefront',
    'traditional_highstreet',
    'office_reception',
    'exterior_wall',
    'monument_forecourt',
    'industrial_unit',
    'plain_studio',
] as const;
export type Scene = (typeof SCENES)[number];

/** Lighting condition of the scene — also lets illuminated signs read. */
export const TIMES_OF_DAY = ['day', 'overcast', 'dusk', 'night'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** Everything the composer needs to build one mockup prompt. */
export interface MockupRequest {
    spec: SignSpec;
    scene: Scene;
    timeOfDay: TimeOfDay;
}
