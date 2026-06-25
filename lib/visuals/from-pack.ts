/**
 * Adapter: a production-pack sign section → a normalised `SignSpec`.
 *
 * A production-pack section carries the spec as FREE TEXT — a spec table of
 * {label, value} rows (Overall size / Material / Finish / Illumination /
 * Fixing), bulleted material callouts, and notes. This adapter best-effort
 * normalises that free text into the enum-backed `SignSpec` the composer wants,
 * by keyword-matching each value against a small rule table. Anything it can't
 * classify falls back to a sensible default and is preserved verbatim in
 * `notes`, so nothing is lost and a human can override in the UI.
 *
 * The rule tables ARE the honing surface for ingestion — add a synonym here
 * when the floor writes a material a new way.
 */

import type { CalloutsBlock, SignSection, SpecTableBlock, TextBlock } from '../production-packs/types';
import type { FaceMaterial, Illumination, Mounting, SignForm, SignSpec } from './types';

// =============================================================================
// KEYWORD RULES (first match wins — order most-specific first)
// =============================================================================

const FORM_RULES: Array<[RegExp, SignForm]> = [
    [/push[\s-]?through/i, 'push_through_letters'],
    [/built[\s-]?up|3d letter|fabricated letter|deep return/i, 'built_up_letters'],
    [/channel letter/i, 'channel_letters'],
    [/flat[\s-]?cut|flatcut/i, 'flat_cut_letters'],
    [/acrylic letter|perspex letter/i, 'acrylic_letters'],
    [/project|blade|flag sign|hanging sign/i, 'projecting_blade'],
    [/window|manifestation|glass graphic/i, 'window_vinyl'],
    [/monument|totem|freestanding|post[\s-]?mounted|pylon/i, 'monument_totem'],
    [/fascia|tray|panel|board|sign plate/i, 'fascia_panel'],
];

const FACE_RULES: Array<[RegExp, FaceMaterial]> = [
    [/brushed|satin alumin|anodis/i, 'brushed_aluminium'],
    [/brass/i, 'brass'],
    [/stainless|316|304|inox/i, 'stainless'],
    [/copper/i, 'copper'],
    [/mirror/i, 'mirror'],
    [/printed|digital print|full[\s-]?colour|print(?:ed)?[\s-]?vinyl/i, 'printed_vinyl'],
    [/dibond|acm|composite/i, 'dibond'],
    [/foamex|foam(?:ed)?[\s-]?pvc|foam board/i, 'foamex'],
    [/acrylic|perspex/i, 'acrylic'],
    [/alumin/i, 'painted_aluminium'],
];

const ILLUMINATION_RULES: Array<[RegExp, Illumination]> = [
    [/halo|reverse[\s-]?lit|back[\s-]?halo/i, 'halo'],
    [/edge[\s-]?lit/i, 'edge_lit'],
    [/push[\s-]?through|face[\s-]?lit|illuminated face|lit face/i, 'face_lit'],
    [/backlit|back[\s-]?lit|opal|light[\s-]?box|lightbox|led panel/i, 'backlit'],
    [/non[\s-]?illum|not illuminated|unlit|no illum|none/i, 'none'],
    [/illuminat|lit\b|led/i, 'face_lit'], // generic "illuminated" → face-lit
];

const MOUNTING_RULES: Array<[RegExp, Mounting]> = [
    [/stand[\s-]?off|stood[\s-]?off|locator|spacer|barrel|stud/i, 'stood_off'],
    [/project|bracket|flag|cantilever|wall[\s-]?arm/i, 'projecting'],
    [/flush|direct|screw|plate|fixed to|bonded|vhb|adhesi/i, 'flush'],
];

// =============================================================================
// HELPERS
// =============================================================================

function firstMatch<T>(rules: Array<[RegExp, T]>, text: string, fallback: T): T {
    for (const [re, value] of rules) {
        if (re.test(text)) return value;
    }
    return fallback;
}

/** Find a spec-table row whose label loosely matches and return its value. */
function rowValue(table: SpecTableBlock | undefined, labelRe: RegExp): string {
    if (!table) return '';
    const row = table.rows.find((r) => labelRe.test(r.label));
    return (row?.value ?? '').trim();
}

/**
 * Best guess at the wording the sign carries. The section title is the only
 * lettering signal a pack reliably has, so strip the structural words off it
 * ("Fascia sign", "Sign Ref 1", "— letters") and keep what's left. Returns ''
 * when nothing meaningful remains; the caller should confirm with the user.
 */
function wordingFromTitle(title: string): string {
    const cleaned = title
        .replace(/sign\s*ref\s*\d+/gi, '')
        .replace(/\b(fascia|projecting|blade|monument|totem|window)\b/gi, '')
        .replace(/\b(sign|signage|letters?|panel|tray|board|graphics?)\b/gi, '')
        .replace(/[-–—:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    // A leftover that's just a number ("Sign 1") isn't wording.
    return /[a-z]/i.test(cleaned) ? cleaned : '';
}

// =============================================================================
// ADAPTER
// =============================================================================

/**
 * Translate one production-pack sign section into a `SignSpec`. Pulls the
 * spec-table rows, classifies each via the keyword rules, and folds callouts +
 * note text into `notes`. Pure + deterministic.
 *
 * @param section  the pack's sign section
 * @param textOverride  optional explicit sign wording (UI-supplied) that wins
 *                      over the title guess
 */
export function sectionToSignSpec(section: SignSection, textOverride?: string): SignSpec {
    const specTable = section.blocks.find((b): b is SpecTableBlock => b.type === 'specTable');

    const sizeVal = rowValue(specTable, /size|dimension|overall/i);
    const materialVal = rowValue(specTable, /material|construction|substrate/i);
    // \bral\b is word-bounded so it matches a "RAL" label but not the "ral" inside "Overall".
    const finishVal = rowValue(specTable, /finish|colou?r|paint|\bral\b/i);
    const illumVal = rowValue(specTable, /illum|light|lit/i);
    const fixingVal = rowValue(specTable, /fixing|fix|mount|install/i);

    // Material + title + callouts together give the best signal for FORM.
    const callouts = section.blocks
        .filter((b): b is CalloutsBlock => b.type === 'callouts')
        .flatMap((b) => b.items)
        .map((s) => s.trim())
        .filter(Boolean);

    const noteText = section.blocks
        .filter((b): b is TextBlock => b.type === 'text')
        .map((b) => [b.title, b.body].filter(Boolean).join(': ').trim())
        .filter(Boolean);

    const formHaystack = [section.title, materialVal, ...callouts].join(' \n ');

    const form = firstMatch(FORM_RULES, formHaystack, 'fascia_panel');
    const faceMaterial = firstMatch(FACE_RULES, `${materialVal} ${finishVal}`, 'painted_aluminium');
    const illumination = firstMatch(ILLUMINATION_RULES, illumVal || materialVal, 'none');
    const mounting = firstMatch(MOUNTING_RULES, fixingVal, 'flush');

    const text = (textOverride ?? '').trim() || wordingFromTitle(section.title);

    return {
        text,
        form,
        faceMaterial,
        colour: finishVal || undefined,
        illumination,
        mounting,
        dimensions: sizeVal || undefined,
        notes: [...callouts, ...noteText],
    };
}
