/**
 * Colour quantization — median-cut seed + k-means (Lloyd) refinement.
 *
 * Reduces an RGBA image to a small palette so the colour vectoriser can trace
 * one clean region per colour (the leap from a single-threshold silhouette to a
 * real raster→vector converter). Median cut gives a fast, deterministic seed;
 * a few Lloyd iterations sharpen the palette so imbalanced clusters (e.g. a big
 * background + a little logo) don't smear into muddy averages.
 *
 * Pure + dependency-free (raw RGBA in, no canvas), so it runs in a Web Worker
 * and unit-tests in plain node — same shape as the nesting / returns engines.
 */

/** Index reserved for pixels below the alpha cutoff (kept out of every layer). */
export const TRANSPARENT = 255 as const;

export interface QuantizeResult {
    /** Palette colours as [r,g,b] (0..255), ordered by descending coverage. */
    palette: Array<[number, number, number]>;
    /** Per-pixel palette index (length w*h). TRANSPARENT (255) = below cutoff. */
    indices: Uint8Array;
    /** Pixel count per palette entry, same order as `palette`. */
    counts: number[];
}

export interface QuantizeOptions {
    /** Target palette size, clamped to 2..16. Default 6. */
    maxColors?: number;
    /** Pixels with alpha below this are ignored (transparent). Default 128. */
    alphaThreshold?: number;
    /** Lloyd refinement passes after the median-cut seed. Default 4. */
    refineIterations?: number;
}

type RGB = [number, number, number];

export function quantize(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    opts: QuantizeOptions = {},
): QuantizeResult {
    const maxColors = Math.max(2, Math.min(16, Math.round(opts.maxColors ?? 6)));
    const alphaCut = opts.alphaThreshold ?? 128;
    const iters = Math.max(0, Math.min(12, opts.refineIterations ?? 4));
    const n = w * h;

    const indices = new Uint8Array(n).fill(TRANSPARENT);

    // Opaque pixels only — transparent stays out of every layer.
    const opaque: number[] = [];
    for (let i = 0; i < n; i++) {
        if (rgba[i * 4 + 3] >= alphaCut) opaque.push(i);
    }
    if (opaque.length === 0) return { palette: [], indices, counts: [] };

    // ---- 1. Median-cut seed --------------------------------------------
    const channelSpread = (bucket: number[], ch: number): number => {
        let lo = 255;
        let hi = 0;
        for (const p of bucket) {
            const v = rgba[p * 4 + ch];
            if (v < lo) lo = v;
            if (v > hi) hi = v;
        }
        return hi - lo;
    };

    const buckets: number[][] = [opaque];
    while (buckets.length < maxColors) {
        let pick = -1;
        let pickCh = 0;
        let widest = 0;
        for (let b = 0; b < buckets.length; b++) {
            if (buckets[b].length < 2) continue;
            for (let ch = 0; ch < 3; ch++) {
                const spread = channelSpread(buckets[b], ch);
                if (spread > widest) {
                    widest = spread;
                    pick = b;
                    pickCh = ch;
                }
            }
        }
        if (pick < 0 || widest === 0) break; // every bucket is uniform

        const bucket = buckets[pick];
        bucket.sort((a, c) => rgba[a * 4 + pickCh] - rgba[c * 4 + pickCh]);
        const mid = bucket.length >> 1;
        buckets.splice(pick, 1, bucket.slice(0, mid), bucket.slice(mid));
    }

    const meanOf = (bucket: number[]): RGB => {
        let r = 0;
        let g = 0;
        let b = 0;
        for (const p of bucket) {
            r += rgba[p * 4];
            g += rgba[p * 4 + 1];
            b += rgba[p * 4 + 2];
        }
        const k = bucket.length || 1;
        return [r / k, g / k, b / k];
    };

    const centers: RGB[] = buckets.map(meanOf);

    // ---- 2. Lloyd refinement -------------------------------------------
    const assign = new Int32Array(opaque.length);
    const assignNearest = () => {
        for (let oi = 0; oi < opaque.length; oi++) {
            const p = opaque[oi];
            const r = rgba[p * 4];
            const g = rgba[p * 4 + 1];
            const b = rgba[p * 4 + 2];
            let best = 0;
            let bestD = Infinity;
            for (let c = 0; c < centers.length; c++) {
                const dr = r - centers[c][0];
                const dg = g - centers[c][1];
                const db = b - centers[c][2];
                const d = dr * dr + dg * dg + db * db;
                if (d < bestD) {
                    bestD = d;
                    best = c;
                }
            }
            assign[oi] = best;
        }
    };

    for (let it = 0; it < iters; it++) {
        assignNearest();
        const sums = centers.map(() => [0, 0, 0, 0]); // r, g, b, count
        for (let oi = 0; oi < opaque.length; oi++) {
            const p = opaque[oi];
            const s = sums[assign[oi]];
            s[0] += rgba[p * 4];
            s[1] += rgba[p * 4 + 1];
            s[2] += rgba[p * 4 + 2];
            s[3]++;
        }
        for (let c = 0; c < centers.length; c++) {
            if (sums[c][3] > 0) {
                centers[c] = [
                    sums[c][0] / sums[c][3],
                    sums[c][1] / sums[c][3],
                    sums[c][2] / sums[c][3],
                ];
            }
        }
    }
    assignNearest(); // definitive labels for the final centres

    // ---- 3. Counts, drop empties, order by coverage --------------------
    const counts = centers.map(() => 0);
    for (let oi = 0; oi < opaque.length; oi++) counts[assign[oi]]++;

    const order = centers
        .map((color, idx) => ({ color, count: counts[idx], idx }))
        .filter((e) => e.count > 0)
        .sort((a, b) => b.count - a.count);

    const remap = new Int32Array(centers.length).fill(-1);
    const palette: RGB[] = [];
    const outCounts: number[] = [];
    order.forEach((e, newIdx) => {
        remap[e.idx] = newIdx;
        palette.push([
            Math.max(0, Math.min(255, Math.round(e.color[0]))),
            Math.max(0, Math.min(255, Math.round(e.color[1]))),
            Math.max(0, Math.min(255, Math.round(e.color[2]))),
        ]);
        outCounts.push(e.count);
    });
    for (let oi = 0; oi < opaque.length; oi++) {
        indices[opaque[oi]] = remap[assign[oi]];
    }

    return { palette, indices, counts: outCounts };
}

/** [r,g,b] → "#rrggbb". */
export function rgbToHex([r, g, b]: RGB): string {
    const h = (v: number) =>
        Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
}
