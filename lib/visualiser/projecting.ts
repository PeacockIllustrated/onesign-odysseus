/**
 * Projecting-sign helpers — pure, unit-tested.
 *
 * A design is a main fascia panel that may also carry a projecting sign. The
 * projecting sign ALWAYS sits perpendicular to the fascia FACE: it mounts on
 * the front face and projects straight out toward the street (read from the
 * side as you approach), never off an edge / top / bottom / back. It comes in
 * two silhouettes — square (the Wallsend shopfront style) or a round disc —
 * and defaults to a small size. These helpers resolve the optional mount,
 * seed a sign that mirrors the main panel's look (then editable), and produce
 * the spec strings shared by the PDFs and the backshop snapshot.
 */

import {
    DEFAULT_PROJECTING_SIZE_MM,
    type BracketStyle,
    type PanelCore,
    type PanelParams,
    type ProjectingMount,
    type ProjectingShape,
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
    shape: ProjectingShape;
    doubleSided: boolean;
    bracketStyle: BracketStyle;
}

/** Defaults applied wherever a mount field is read but absent. */
export const DEFAULT_MOUNT: ResolvedMount = {
    offsetXMm: 0,
    offsetYMm: 0,
    shape: 'square',
    doubleSided: true,
    bracketStyle: 'box-arm',
};

export function resolveMount(mount: ProjectingMount | undefined): ResolvedMount {
    return {
        offsetXMm: mount?.offsetXMm ?? DEFAULT_MOUNT.offsetXMm,
        offsetYMm: mount?.offsetYMm ?? DEFAULT_MOUNT.offsetYMm,
        shape: mount?.shape ?? DEFAULT_MOUNT.shape,
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
 * Seed a projecting sign from the main panel: it mirrors the main panel's
 * LOOK (colours, materials, thickness, finish) but defaults to a small square
 * and starts with fresh artwork — the main panel's artwork is sized for the
 * big fascia, so it can't sensibly transfer to a small projecting sign; you
 * add the sign's own (smaller) artwork on its tab. Strips any nested
 * projectingSign so a projecting sign can't carry its own.
 */
export function seedProjectingFromMain(main: PanelParams): ProjectingSign {
    const clone = structuredClone(main) as PanelParams;
    delete (clone as { projectingSign?: unknown }).projectingSign;
    const panel: PanelCore = {
        ...(clone as PanelCore),
        name: `${main.name} — projecting`,
        panelWidthMm: DEFAULT_PROJECTING_SIZE_MM,
        panelHeightMm: DEFAULT_PROJECTING_SIZE_MM,
        // Fresh artwork on the smaller sign (keep the main's look, not its
        // fascia-scale artwork placement).
        artworkLayers: [],
        materialGroups: [],
        aperturePlacement: null,
        manualFixings: [],
        cableHoles: [],
    };
    return {
        panel,
        mount: { ...DEFAULT_MOUNT },
        svgSource: null,
    };
}

/** Dimension string for a projecting sign, e.g. "500×500mm" or "500mm dia". */
export function projectingDimsLabel(
    panel: Pick<PanelCore, 'panelWidthMm' | 'panelHeightMm'>,
    shape: ProjectingShape,
): string {
    return shape === 'circle'
        ? `${Math.round(panel.panelWidthMm)}mm dia`
        : `${Math.round(panel.panelWidthMm)}×${Math.round(panel.panelHeightMm)}mm`;
}

/**
 * One-line spec for the reference PDF / backshop, e.g.
 * "Projecting square · 500×500mm · double-sided · box-arm bracket".
 */
export function projectingSpecLine(
    panel: Pick<PanelCore, 'panelWidthMm' | 'panelHeightMm'>,
    mount: ProjectingMount | undefined,
): string {
    const r = resolveMount(mount);
    return [
        `Projecting ${r.shape}`,
        projectingDimsLabel(panel, r.shape),
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
        `projects ${Math.round(panel.panelWidthMm)}mm perpendicular from the face. ` +
        `${r.doubleSided ? 'Double-sided' : 'Single-sided'} ${r.shape}.`
    );
}
