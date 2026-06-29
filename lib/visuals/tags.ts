/**
 * The prompt-fragment catalogue — the honing surface.
 *
 * Each spec value maps to a short phrase that gets stitched into the final
 * image-generation prompt. Tuning the mockups over time = editing these
 * strings or adding keys; NO logic changes (that lives in `compose.ts`). This
 * is deliberately plain data so it can later graduate to a DB-backed table the
 * studio team edits from a UI without a deploy.
 */

import type { FaceMaterial, Illumination, Mounting, Scene, SignForm, TimeOfDay } from './types';

/** Form → subject phrase. `%TEXT%` is replaced with the quoted sign wording. */
export const FORM_TAGS: Record<SignForm, string> = {
    fascia_panel: 'a rectangular fascia sign panel displaying %TEXT%',
    built_up_letters: 'individual built-up three-dimensional letters with deep returns spelling %TEXT%',
    flat_cut_letters: 'flat-cut individual letters spelling %TEXT%',
    acrylic_letters: 'face-mounted acrylic letters spelling %TEXT%',
    push_through_letters: 'push-through acrylic letters set into a panel spelling %TEXT%',
    channel_letters: 'fabricated channel letters spelling %TEXT%',
    projecting_blade: 'a projecting blade sign mounted perpendicular to the wall reading %TEXT%',
    window_vinyl: 'cut-vinyl window graphics reading %TEXT% applied to the glazing',
    monument_totem: 'a freestanding monument totem sign reading %TEXT%',
};

/** Face material → finish phrase. */
export const FACE_TAGS: Record<FaceMaterial, string> = {
    brushed_aluminium: 'brushed satin aluminium faces',
    painted_aluminium: 'smoothly powder-coated aluminium faces',
    brass: 'warm polished brass faces',
    stainless: 'brushed stainless steel faces',
    copper: 'rich polished copper faces',
    mirror: 'mirror-polished metallic faces with crisp reflections',
    acrylic: 'glossy cast-acrylic faces',
    printed_vinyl: 'full-colour printed vinyl graphics',
    dibond: 'flat aluminium-composite (Dibond) faces',
    foamex: 'matte foamed-PVC faces',
};

/** Illumination → lighting phrase. */
export const ILLUMINATION_TAGS: Record<Illumination, string> = {
    none: 'non-illuminated',
    halo: 'reverse-lit with a soft halo glow of light spilling onto the wall behind the letters',
    face_lit: 'evenly face-illuminated, the letter faces glowing from within',
    edge_lit: 'edge-lit with a thin bright outline of light',
    backlit: 'backlit through an opal diffuser with an even internal glow',
};

/** Mounting → fixing / depth phrase. */
export const MOUNTING_TAGS: Record<Mounting, string> = {
    flush: 'fixed flush to the surface',
    stood_off: 'stood off the wall on locator studs, casting a soft drop shadow behind it',
    projecting: 'cantilevered out from the wall on a bracket',
};

/** Scene → backdrop phrase. */
export const SCENE_TAGS: Record<Scene, string> = {
    modern_storefront: 'above the entrance of a modern glass-fronted commercial storefront',
    traditional_highstreet: 'on the frontage of a traditional UK high-street shopfront',
    office_reception: 'on the feature wall of a contemporary office reception interior',
    exterior_wall: 'mounted on a clean exterior brick wall of a commercial building',
    monument_forecourt: 'standing in the landscaped forecourt of a business premises',
    industrial_unit: 'on the cladding of a modern industrial trade-park unit',
    plain_studio: 'against a clean, evenly-lit neutral studio backdrop',
};

/** Time of day → ambient lighting phrase. */
export const TIME_TAGS: Record<TimeOfDay, string> = {
    day: 'bright clear daylight, crisp shadows',
    overcast: 'soft diffuse overcast daylight, gentle even shadows',
    dusk: 'golden-hour dusk light, warm tones',
    night: 'after dark, the scene lit by ambient street lighting',
};

/**
 * The fixed camera / quality scaffold appended to every prompt. Kept as one
 * tunable constant so a single edit restyles every mockup.
 */
export const QUALITY_SCAFFOLD =
    'professional architectural photography, eye-level street view, realistic materials and reflections, sharp focus, high detail, true-to-life proportions';
