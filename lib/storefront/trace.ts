/**
 * Trace → Spec: the measurement-first calibration that makes reconstruction
 * RELIABLE instead of eyeballed.
 *
 * Instead of assuming proportions, a staffer marks each element's box on the
 * reference image (in pixels) and supplies ONE known real dimension (the
 * anchor — ideally a survey measurement, else a standard door leaf). This
 * converts every traced box to mm via a single scale factor and emits a
 * `StorefrontSpec`. No judgement, no priors — the image + the anchor decide.
 *
 * Image-pixel convention: y increases DOWNWARD (top-left origin), so a box's
 * height-off-the-ground is measured from the facade box's bottom edge. Pure +
 * DOM-free.
 */

import { DEFAULT_COLOURS, type StorefrontMaterial, type StorefrontSpec } from './types';

/** A rectangle in image pixels (top-left origin). */
export interface PixelBox {
    x: number;
    y: number;
    w: number;
    h: number;
}

export interface TraceInput {
    /** A known real-world length (mm) and its measured length in image pixels. */
    anchorMm: number;
    anchorPx: number;
    /** The whole shopfront extent — the local origin + overall size. */
    facade: PixelBox;
    /** The fascia banner. */
    fascia: PixelBox;
    /** The entrance door (full leaf incl. bottom panel). */
    door: PixelBox;
    /** The display window glazing. */
    window: PixelBox;
    /** Optional: the solid base under the window (defaults to window bottom→ground). */
    stallriser?: PixelBox;
    /** Optional: the solid door base panel (defaults to 500mm). */
    doorBottomPanel?: PixelBox;
    /** Optional: right pilaster + left jamb (default from gaps / template). */
    rightPilaster?: PixelBox;
    leftJamb?: PixelBox;
    /** Door glazing grid (defaults 3×5). */
    doorCols?: number;
    doorRows?: number;
    /** Wall depth shown (mm, default 150). */
    wallDepthMm?: number;
    /** Optional colour overrides (defaults to the blue template). */
    colours?: Partial<Record<StorefrontMaterial, string>>;
}

const r = (v: number) => Math.round(v);

/**
 * Build a measured `StorefrontSpec` from a calibrated trace. Throws on a
 * non-positive anchor (a zero-length anchor would make scale meaningless).
 */
export function traceToSpec(input: TraceInput): StorefrontSpec {
    if (!(input.anchorMm > 0) || !(input.anchorPx > 0)) {
        throw new Error('traceToSpec: anchorMm and anchorPx must both be > 0');
    }
    const scale = input.anchorMm / input.anchorPx; // mm per pixel
    const { facade } = input;
    const facadeBottomPx = facade.y + facade.h;

    // x relative to the facade's left edge; z measured up from the facade's base.
    const xLocal = (b: PixelBox) => r((b.x - facade.x) * scale);
    const zBottom = (b: PixelBox) => r((facadeBottomPx - (b.y + b.h)) * scale);
    const zTop = (b: PixelBox) => r((facadeBottomPx - b.y) * scale);
    const mm = (px: number) => r(px * scale);

    const widthMm = mm(facade.w);
    const heightMm = mm(facade.h);
    const fasciaHeightMm = mm(input.fascia.h);
    const doorHeadMm = zTop(input.door);
    const stallriserHeightMm = input.stallriser ? mm(input.stallriser.h) : zBottom(input.window);

    const doorWidthMm = mm(input.door.w);
    const bottomPanelMm = input.doorBottomPanel ? mm(input.doorBottomPanel.h) : 500;

    const windowXMm = xLocal(input.window);
    const windowWidthMm = mm(input.window.w);

    const pilasterWidthMm = input.rightPilaster
        ? mm(input.rightPilaster.w)
        : Math.max(0, widthMm - (windowXMm + windowWidthMm));
    const jambWidthMm = input.leftJamb ? mm(input.leftJamb.w) : Math.max(0, xLocal(input.door));

    return {
        widthMm,
        heightMm,
        wallDepthMm: input.wallDepthMm ?? 150,
        fasciaHeightMm,
        doorHeadMm,
        stallriserHeightMm,
        pilasterWidthMm,
        jambWidthMm,
        door: {
            xMm: xLocal(input.door),
            widthMm: doorWidthMm,
            bottomPanelMm,
            cols: input.doorCols ?? 3,
            rows: input.doorRows ?? 5,
        },
        window: { xMm: windowXMm, widthMm: windowWidthMm },
        colours: { ...DEFAULT_COLOURS, ...(input.colours ?? {}) },
    };
}
