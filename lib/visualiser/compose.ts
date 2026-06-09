/**
 * Multi-layer artwork composition.
 *
 * The visualiser pipeline consumes ONE artwork (paths + bbox) placed on
 * the face. To support several independently-positioned pieces — an
 * icon and a wordmark uploaded separately, for instance — we composite
 * the layers into a single artwork laid out in a PANEL-SIZED frame
 * (millimetres, origin top-left of the face). Passing that fixed frame
 * as the placement bbox makes `placeAperture` map it 1:1 onto the face,
 * so a layer's (xMm, yMm) is exactly where it lands — no auto-recentre.
 *
 * `placeLayerPaths` is pure and unit-tested; `composeLayers` wraps it
 * with the browser SVG importer.
 */

import { importSvg } from './svg-import';
import type { FlatPath, ImportedSvg } from './types';

export interface ComposeLayer {
    svgSource: string;
    /** Top-left target on the face, mm. */
    xMm: number;
    yMm: number;
    /** Multiplier on the layer's native units. */
    scale: number;
}

/**
 * Transform one layer's paths from native coords into the frame: shift
 * the layer's own bounding-box corner to the origin, scale, then move
 * to (xMm, yMm). Pure — takes the source bbox min so it never needs the
 * SVG parser.
 */
export function placeLayerPaths(
    paths: FlatPath[],
    srcMinX: number,
    srcMinY: number,
    layer: { xMm: number; yMm: number; scale: number },
): FlatPath[] {
    const s = layer.scale;
    return paths.map((p) => ({
        closed: p.closed,
        points: p.points.map(
            ([x, y]) =>
                [
                    (x - srcMinX) * s + layer.xMm,
                    (y - srcMinY) * s + layer.yMm,
                ] as [number, number],
        ),
    }));
}

/**
 * Composite layers into a single ImportedSvg laid out in a frameW ×
 * frameH frame (panel-face mm). The bbox is the fixed frame, NOT the
 * content extent, so moving a layer doesn't shift the whole lockup.
 * Layers that fail to parse are skipped.
 */
export function composeLayers(
    layers: ComposeLayer[],
    frameW: number,
    frameH: number,
): ImportedSvg {
    const out: FlatPath[] = [];
    const warnings: string[] = [];
    for (const layer of layers) {
        let imp: ImportedSvg;
        try {
            imp = importSvg(layer.svgSource);
        } catch {
            continue;
        }
        out.push(...placeLayerPaths(imp.paths, imp.bbox.x, imp.bbox.y, layer));
        for (const wmsg of imp.warnings) warnings.push(wmsg);
    }
    return {
        paths: out,
        bbox: { x: 0, y: 0, w: frameW, h: frameH },
        warnings,
    };
}

/** One merged SVG string (panel-mm frame) — used for the saved
 *  svg_source so the design renders even where layers aren't read. */
export function composeLayersSvg(
    layers: ComposeLayer[],
    frameW: number,
    frameH: number,
): string {
    const composed = composeLayers(layers, frameW, frameH);
    const r = (n: number) => Math.round(n * 100) / 100;
    const paths = composed.paths
        .filter((p) => p.points.length > 1)
        .map((p) => {
            const [first, ...rest] = p.points;
            const d =
                `M ${r(first[0])} ${r(first[1])} ` +
                rest.map(([x, y]) => `L ${r(x)} ${r(y)}`).join(' ') +
                (p.closed ? ' Z' : '');
            return `<path d="${d}" fill="#000000" stroke="none"/>`;
        })
        .join('');
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${frameW} ${frameH}" ` +
        `width="${frameW}" height="${frameH}">${paths}</svg>`
    );
}
