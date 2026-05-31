/**
 * Projecting-sign helpers — pure, unit-tested.
 *
 * A design is a main fascia panel that may also carry a projecting (blade)
 * sign. The blade is a full PanelCore mounted perpendicular to the fascia:
 * its panel WIDTH runs out from the wall (the protrusion) and its HEIGHT is
 * vertical. These helpers resolve the optional mount to concrete values,
 * seed a blade as a mirror of the main panel (the user then edits it), and
 * produce the spec strings shared by the PDFs and the backshop snapshot so
 * those surfaces can never disagree on wording.
 */

import {
    type BracketStyle,
    type PanelCore,
    type PanelParams,
    type ProjectingMount,
    type ProjectingSign,
} from './types';

/** Does this design carry a projecting sign? */
export function hasProjecting(
    params: Pick<PanelParams, 'projectingSign'>,
): boolean {
    return !!params.projectingSign;
}

export interface ResolvedMount {
    offsetXMm: number;
    offsetYMm: number;
    side: 'left' | 'right';
    doubleSided: boolean;
    bracketStyle: BracketStyle;
}

/** Defaults applied wherever a mount field is read but absent. */
export const DEFAULT_MOUNT: ResolvedMount = {
    offsetXMm: 0,
    offsetYMm: 0,
    side: 'left',
    doubleSided: true,
    bracketStyle: 'box-arm',
};

export function resolveMount(mount: ProjectingMount | undefined): ResolvedMount {
    return {
        offsetXMm: mount?.offsetXMm ?? DEFAULT_MOUNT.offsetXMm,
        offsetYMm: mount?.offsetYMm ?? DEFAULT_MOUNT.offsetYMm,
        side: mount?.side ?? DEFAULT_MOUNT.side,
        doubleSided: mount?.doubleSided ?? DEFAULT_MOUNT.doubleSided,
        bracketStyle: mount?.bracketStyle ?? DEFAULT_MOUNT.bracketStyle,
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
 * Seed a projecting sign as a mirror of the main panel: the blade starts as a
 * full copy of the fascia's artwork, materials, colours and dimensions (the
 * user then edits it on its own tab). Strips any nested projectingSign so a
 * blade can't carry its own.
 */
export function seedProjectingFromMain(
    main: PanelParams,
    mainSvg: string | null,
): ProjectingSign {
    const clone = structuredClone(main) as PanelParams;
    delete (clone as { projectingSign?: unknown }).projectingSign;
    const panel: PanelCore = { ...(clone as PanelCore) };
    panel.name = `${main.name} — projecting`;
    return {
        panel,
        mount: { ...DEFAULT_MOUNT },
        svgSource: mainSvg,
    };
}

/**
 * One-line spec for the reference PDF / backshop, e.g.
 * "Projecting blade · 450×1200mm · double-sided · box-arm bracket".
 * The blade's WIDTH is the protrusion off the wall; HEIGHT is vertical.
 */
export function projectingSpecLine(
    panel: Pick<PanelCore, 'panelWidthMm' | 'panelHeightMm'>,
    mount: ProjectingMount | undefined,
): string {
    const r = resolveMount(mount);
    return [
        'Projecting blade',
        `${Math.round(panel.panelWidthMm)}×${Math.round(panel.panelHeightMm)}mm`,
        r.doubleSided ? 'double-sided' : 'single-sided',
        `${bracketStyleLabel(r.bracketStyle)} bracket`,
    ].join(' · ');
}

/**
 * Bracket procurement note for the production PDF. The bracket is bought-in,
 * so this is a spec to order against rather than a fabrication drawing.
 */
export function bracketSpecNote(
    panel: Pick<PanelCore, 'panelWidthMm'>,
    mount: ProjectingMount | undefined,
): string {
    const r = resolveMount(mount);
    return (
        `Bracket: bought-in ${bracketStyleLabel(r.bracketStyle)}, ` +
        `blade protrudes ${Math.round(panel.panelWidthMm)}mm, mounted ${r.side}. ` +
        `${r.doubleSided ? 'Double-sided' : 'Single-sided'}.`
    );
}
