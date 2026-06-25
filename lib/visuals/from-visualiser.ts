/**
 * Adapter: visualiser `PanelParams` → a normalised `SignSpec`.
 *
 * The visualiser is the source of truth for a sign's spec — unlike the
 * production pack's free text, its construction is enum-backed (materialGroups,
 * apertureMode, illumination, builtUp), so this mapping is exact rather than
 * best-effort. The composed prompt then drives only the *context* of the
 * mockup; the sign's geometry/letterforms come from the captured 3D render
 * handed to the model as a reference image.
 *
 * Pure + deterministic. Reads `PanelParams` (the main fascia) — a projecting
 * blade sign, if present, is noted but the spec describes the dominant panel.
 */

import type { PanelParams } from '../visualiser/types';
import type { FaceMaterial, Illumination, Mounting, SignForm, SignSpec } from './types';

/** Metal extra-face finish → our face-material tag. */
const EXTRA_FACE_MAP: Record<string, FaceMaterial> = {
    brass: 'brass',
    stainless: 'stainless',
    aluminium: 'brushed_aluminium',
    copper: 'copper',
    mirror: 'mirror',
};

/** Strip structural words off the design name to guess the lettering. */
function wordingFromName(name: string): string {
    const cleaned = name
        .replace(/\b(sign|signage|fascia|projecting|blade|panel|letters?|logo|board|graphics?)\b/gi, '')
        .replace(/[-–—:]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    return /[a-z]/i.test(cleaned) ? cleaned : '';
}

function pickForm(p: PanelParams): SignForm {
    if (p.builtUp) return 'built_up_letters';
    const mats = (p.materialGroups ?? []).map((g) => g.material);
    if (mats.includes('pushthrough')) return 'push_through_letters';
    if (mats.includes('acrylic')) return 'acrylic_letters';
    if (mats.includes('standoff')) return 'flat_cut_letters';
    if (p.apertureMode === 'standoff') return 'flat_cut_letters';
    return 'fascia_panel';
}

function pickFaceMaterial(p: PanelParams): FaceMaterial {
    // A metal extra-face is the visible front, so it wins.
    const faceMetal = (p.materialGroups ?? []).map((g) => g.extraFace?.material).find(Boolean);
    if (faceMetal) return EXTRA_FACE_MAP[faceMetal] ?? 'brushed_aluminium';
    if (p.builtUp) return p.builtUp.finish === 'brass' ? 'brass' : 'painted_aluminium';
    const mats = (p.materialGroups ?? []).map((g) => g.material);
    if (p.apertureMode === 'vinyl' || mats.includes('vinyl')) return 'printed_vinyl';
    if (mats.includes('acrylic')) return 'acrylic';
    return 'painted_aluminium';
}

function pickIllumination(p: PanelParams): Illumination {
    if (p.illumination?.keyline?.enabled) return 'halo';
    const mats = (p.materialGroups ?? []).map((g) => g.material);
    if (mats.includes('backlight')) return 'backlit';
    return 'none';
}

function pickMounting(p: PanelParams): Mounting {
    if (p.builtUp) return 'stood_off';
    const mats = (p.materialGroups ?? []).map((g) => g.material);
    if (p.apertureMode === 'standoff' || mats.includes('standoff')) return 'stood_off';
    return 'flush';
}

/**
 * Map the live visualiser panel into a `SignSpec`.
 *
 * @param params       the main fascia `PanelParams`
 * @param textOverride optional explicit lettering (UI-supplied) that wins over
 *                     the name-derived guess
 */
export function visualiserToSignSpec(params: PanelParams, textOverride?: string): SignSpec {
    const colour = params.panelRal?.trim() || params.panelColor?.trim() || undefined;

    const notes: string[] = [];
    if (params.materialLabel?.trim()) notes.push(params.materialLabel.trim());
    if (params.projectingSign) notes.push('with a matching projecting blade sign alongside');

    return {
        text: (textOverride ?? '').trim() || wordingFromName(params.name),
        form: pickForm(params),
        faceMaterial: pickFaceMaterial(params),
        colour,
        illumination: pickIllumination(params),
        mounting: pickMounting(params),
        dimensions: `${Math.round(params.panelWidthMm)} × ${Math.round(params.panelHeightMm)} mm`,
        notes,
    };
}
