/**
 * One entry point that drives BOTH tracer modes and normalises their output,
 * so the converter UI (and a future Web Worker) call a single pure function.
 *
 *   - silhouette → the original single-threshold tracer (`traceToSvg`): one
 *     black shape with counters as holes — the clean cut-path concept output.
 *   - colour     → the multi-layer vectoriser (`vectoriseColor`): a palette of
 *     stacked colour regions — a faithful vector of the artwork.
 *
 * Pure + DOM-free (raw RGBA in), so it stays Vitest-covered and worker-ready.
 */

import { traceToSvg } from './trace';
import { vectoriseColor } from './vectorise';

export type VectoriseMode = 'silhouette' | 'color';

export interface VectoriseParams {
    mode: VectoriseMode;
    /** 0..100 — higher drops more detail (shared). */
    smoothing: number;
    /** Despeckle: loops below this area (px²) are dropped (shared). */
    minAreaPx: number;
    /** Silhouette: luminance cutoff 1..254. */
    threshold: number;
    /** Silhouette: trace the light regions instead of the dark. */
    invert: boolean;
    /** Silhouette: pre-blur radius (px). */
    blurRadius: number;
    /** Colour: palette size 2..16. */
    maxColors: number;
}

export interface VectoriseOutput {
    svg: string;
    mode: VectoriseMode;
    /** Distinct colours in the output (1 for silhouette). */
    colorCount: number;
    /** Total traced loops across all layers. */
    shapeCount: number;
    /** Total polyline vertices (curve density proxy). */
    pointCount: number;
    /** Silhouette: the cutoff actually used (auto or explicit). Null in colour. */
    threshold: number | null;
    /** Colour: layer fills bottom→top. ['#000000'] for silhouette. */
    palette: string[];
}

export function computeVectorise(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    p: VectoriseParams,
): VectoriseOutput | null {
    if (p.mode === 'color') {
        const r = vectoriseColor(rgba, w, h, {
            maxColors: p.maxColors,
            smoothing: p.smoothing,
            minAreaPx: p.minAreaPx,
        });
        if (!r) return null;
        return {
            svg: r.svg,
            mode: 'color',
            colorCount: r.colorCount,
            shapeCount: r.layers.reduce((s, l) => s + l.loopCount, 0),
            pointCount: r.pointCount,
            threshold: null,
            palette: r.layers.map((l) => l.color),
        };
    }

    const t = traceToSvg(rgba, w, h, {
        threshold: p.threshold,
        invert: p.invert,
        smoothing: p.smoothing,
        blurRadius: p.blurRadius,
        minAreaPx: p.minAreaPx,
    });
    if (!t) return null;
    return {
        svg: t.svg,
        mode: 'silhouette',
        colorCount: 1,
        shapeCount: t.loopCount,
        pointCount: t.pointCount,
        threshold: t.threshold,
        palette: ['#000000'],
    };
}
