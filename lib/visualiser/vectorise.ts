/**
 * Colour raster → SVG vectoriser.
 *
 * The leap from the single-threshold silhouette tracer to a real image-to-vector
 * converter: quantize the image to a small palette, then trace ONE clean region
 * per colour through the exact same pipeline the silhouette tracer uses
 * (sub-pixel marching squares → Douglas–Peucker → corner-aware cubic Béziers),
 * and stack the colours back-to-front into one SVG.
 *
 * Because every opaque pixel belongs to exactly one palette colour, the layers
 * are disjoint by construction — no overlaps to reconcile. A single colour that
 * wraps around another (a frame, a letter counter) traces as an outer loop plus
 * inner loops; emitting each colour as ONE `fill-rule="evenodd"` path renders
 * those as holes. Pure + dependency-free, so it shares the engines' Vitest
 * coverage and runs in a Web Worker.
 */

import { marchingSquares, simplifyLoops, loopToPathD } from './trace';
import { quantize, rgbToHex } from './quantize';

export interface VectoriseOptions {
    /** Palette size, clamped to 2..16. Default 6. */
    maxColors?: number;
    /** Alpha cutoff below which a pixel is transparent. Default 128. */
    alphaThreshold?: number;
    /** 0..100 — higher drops more detail (Douglas–Peucker epsilon). Default 40. */
    smoothing?: number;
    /** Loops below this area (px²) are dropped as specks. Default 24. */
    minAreaPx?: number;
}

export interface VectoriseLayer {
    /** Layer fill as "#rrggbb". */
    color: string;
    /** Closed loops making up this colour (outer contours + counters). */
    loopCount: number;
    /** Combined path `d` (all loops, evenodd). */
    d: string;
}

export interface VectoriseResult {
    svg: string;
    layers: VectoriseLayer[];
    colorCount: number;
    pointCount: number;
}

/**
 * Full colour pipeline: raw RGBA → stacked colour SVG. Returns null when
 * nothing traces (blank / fully-transparent image, or every layer despeckled
 * away).
 */
export function vectoriseColor(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    opts: VectoriseOptions = {},
): VectoriseResult | null {
    const q = quantize(rgba, w, h, {
        maxColors: opts.maxColors,
        alphaThreshold: opts.alphaThreshold,
    });
    if (q.palette.length === 0) return null;

    const layers: VectoriseLayer[] = [];
    let pointCount = 0;

    // Palette is ordered by descending coverage → the dominant colour is the
    // first (bottom) layer; finer detail stacks on top.
    for (let c = 0; c < q.palette.length; c++) {
        // Binary mask field for this colour: 0 = inside (this colour), 255 =
        // outside. The iso-contour at 128 lands sub-pixel on the colour border.
        const field = new Float32Array(w * h);
        for (let i = 0; i < w * h; i++) field[i] = q.indices[i] === c ? 0 : 255;

        const raw = marchingSquares(field, w, h, 128, false);
        const loops = simplifyLoops(raw, {
            smoothing: opts.smoothing,
            minAreaPx: opts.minAreaPx,
        });
        if (loops.length === 0) continue;

        const d = loops.map(loopToPathD).filter(Boolean).join(' ');
        if (!d) continue;

        pointCount += loops.reduce((s, l) => s + l.length, 0);
        layers.push({ color: rgbToHex(q.palette[c]), loopCount: loops.length, d });
    }

    if (layers.length === 0) return null;

    const paths = layers
        .map(
            (l) =>
                `<path d="${l.d}" fill="${l.color}" fill-rule="evenodd" stroke="none"/>`,
        )
        .join('');
    const svg =
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" ` +
        `width="${w}" height="${h}">${paths}</svg>`;

    return { svg, layers, colorCount: layers.length, pointCount };
}
