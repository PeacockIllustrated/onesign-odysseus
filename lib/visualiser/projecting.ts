/**
 * Projecting-sign helpers — pure, unit-tested.
 *
 * A projecting (blade / fin) sign reuses the fascia folded-aluminium tray
 * verbatim; the only difference is that the tray is mounted perpendicular to
 * the wall on a bracket. These helpers resolve the optional `projecting`
 * params to concrete values (applying the §5 defaults) and produce the
 * human-readable spec strings shared by the PDFs and the backshop snapshot,
 * so those surfaces can never disagree on wording.
 */

import {
    DEFAULT_PROJECTING,
    type BracketStyle,
    type PanelParams,
    type ProjectingParams,
    type SignType,
} from './types';

/** All projecting fields made concrete (defaults filled in). */
export interface ResolvedProjecting {
    projectionMm: number;
    doubleSided: boolean;
    bracketStyle: BracketStyle;
    wallPlate: { widthMm: number; heightMm: number };
}

/** Absent signType ⇒ fascia. The single place that rule is encoded. */
export function signTypeOf(params: Pick<PanelParams, 'signType'>): SignType {
    return params.signType === 'projecting' ? 'projecting' : 'fascia';
}

export function isProjecting(params: Pick<PanelParams, 'signType'>): boolean {
    return signTypeOf(params) === 'projecting';
}

/** Fill any absent projecting field from DEFAULT_PROJECTING. */
export function resolveProjecting(
    projecting: ProjectingParams | undefined,
): ResolvedProjecting {
    return {
        projectionMm: projecting?.projectionMm ?? DEFAULT_PROJECTING.projectionMm,
        doubleSided: projecting?.doubleSided ?? DEFAULT_PROJECTING.doubleSided,
        bracketStyle:
            projecting?.bracketStyle ?? DEFAULT_PROJECTING.bracketStyle,
        wallPlate: projecting?.wallPlate ?? DEFAULT_PROJECTING.wallPlate,
    };
}

const BRACKET_LABELS: Record<BracketStyle, string> = {
    'flat-plate': 'flat-plate',
    'box-arm': 'box-arm',
    scroll: 'scroll',
};

export function bracketStyleLabel(style: BracketStyle): string {
    return BRACKET_LABELS[style];
}

/**
 * One-line spec for the reference PDF / backshop, e.g.
 * "Projecting · 600mm projection · double-sided · box-arm bracket".
 */
export function projectingSpecLine(r: ResolvedProjecting): string {
    return [
        'Projecting',
        `${Math.round(r.projectionMm)}mm projection`,
        r.doubleSided ? 'double-sided' : 'single-sided',
        `${bracketStyleLabel(r.bracketStyle)} bracket`,
    ].join(' · ');
}

/**
 * Bracket procurement note for the production PDF. The bracket is bought-in
 * for v1, so this is a spec to order against rather than a fabrication
 * drawing.
 */
export function bracketSpecNote(r: ResolvedProjecting): string {
    return (
        `Bracket: bought-in ${bracketStyleLabel(r.bracketStyle)}, ` +
        `${Math.round(r.projectionMm)}mm projection, ` +
        `wall plate ${Math.round(r.wallPlate.widthMm)}×${Math.round(
            r.wallPlate.heightMm,
        )}mm. ${r.doubleSided ? 'Double-sided' : 'Single-sided'} sign.`
    );
}
