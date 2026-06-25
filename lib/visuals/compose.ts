/**
 * The prompt composer — a pure function from (SignSpec + scene) to a prompt.
 *
 * Deterministic and DOM-free: same input always yields the same prompt, so it
 * is fully unit-testable and its output is reproducible. All the wording lives
 * in `tags.ts`; this file only decides the order things are stitched in and how
 * the free-text bits are folded around the enum tags.
 */

import type { MockupRequest, SignSpec } from './types';
import {
    FACE_TAGS,
    FORM_TAGS,
    ILLUMINATION_TAGS,
    MOUNTING_TAGS,
    QUALITY_SCAFFOLD,
    SCENE_TAGS,
    TIME_TAGS,
} from './tags';

export interface ComposedPrompt {
    /** The finished prompt string to hand to the image model. */
    prompt: string;
    /**
     * The ordered clauses that built it, for debugging + honing. Lets the UI
     * show "this is why the mockup looks like this" and a future tuner diff
     * which tag produced which phrase.
     */
    clauses: string[];
}

/** Quote the sign wording so the model renders it as literal text on the sign. */
function quoteText(text: string): string {
    const t = text.trim();
    return t ? `"${t}"` : 'the brand name';
}

/** Trim, drop blanks, collapse whitespace — keeps the prompt clean. */
function tidy(parts: Array<string | undefined | null>): string[] {
    return parts
        .map((p) => (p ?? '').replace(/\s+/g, ' ').trim())
        .filter((p) => p.length > 0);
}

/**
 * Build the subject clause: the form phrase with the sign wording substituted
 * in, plus the colour qualifier when one is given.
 */
function subjectClause(spec: SignSpec): string {
    const base = FORM_TAGS[spec.form].replace('%TEXT%', quoteText(spec.text));
    const colour = spec.colour?.trim();
    return colour ? `${base}, finished in ${colour}` : base;
}

/**
 * Compose a single in-situ mockup prompt. The clause order is intentional —
 * subject first, then material, illumination, mounting, then the scene and
 * ambient light, then any free-text notes, then the quality scaffold — so the
 * model anchors on the sign before the setting.
 */
export function composePrompt(req: MockupRequest): ComposedPrompt {
    const { spec, scene, timeOfDay } = req;

    const notes = (spec.notes ?? []).map((n) => n.trim()).filter(Boolean);

    const clauses = tidy([
        subjectClause(spec),
        FACE_TAGS[spec.faceMaterial],
        ILLUMINATION_TAGS[spec.illumination],
        MOUNTING_TAGS[spec.mounting],
        spec.dimensions?.trim() ? `approximately ${spec.dimensions.trim()}` : null,
        SCENE_TAGS[scene],
        TIME_TAGS[timeOfDay],
        notes.length ? `additional details: ${notes.join('; ')}` : null,
        QUALITY_SCAFFOLD,
    ]);

    // Lead with "Photorealistic in-situ photograph of" so the whole thing reads
    // as one installed-sign scene rather than a product cut-out.
    const prompt = `Photorealistic in-situ photograph of ${clauses.join(', ')}.`;

    return { prompt, clauses };
}
