/**
 * Background removal for the vectoriser.
 *
 * Clears a chosen colour to transparent BEFORE quantize/trace, so a logo lands
 * on a clean transparent ground — signage-ready. Two modes:
 *
 *   - global: every pixel within `tolerance` of the colour is cleared wherever
 *     it sits (knock one flat colour out everywhere).
 *   - contiguous: a flood fill from the clicked `seed` clears only the region of
 *     that colour connected to the click — so a white surround goes while white
 *     letter counters inside the logo survive. With no seed it floods from the
 *     image border (the usual "remove the edge-connected background").
 *
 * Pure + DOM-free (raw RGBA in, fresh RGBA out), so it stays Vitest-covered and
 * worker-ready like the rest of the tracer pipeline.
 */

export type RGB = [number, number, number];

export interface BgRemoveOptions {
    /** Colour to clear (typically sampled from the clicked pixel). */
    color: RGB;
    /** 0..100 — how far from `color` still counts (anti-aliased edges need a
     *  little headroom). */
    tolerance: number;
    /** Flood from the seed (true) or knock the colour out globally (false). */
    contiguous: boolean;
    /** Flood seed (x,y) for contiguous mode; omit to flood from the border. */
    seed?: [number, number] | null;
}

/** 0..100 tolerance → squared RGB-distance budget. */
function squaredBudget(tolerance: number): number {
    const d = Math.max(0, Math.min(100, tolerance)) * 1.6; // 0..160 in RGB space
    return d * d;
}

export function removeBackground(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    opts: BgRemoveOptions,
): Uint8ClampedArray {
    const out = new Uint8ClampedArray(rgba.length);
    out.set(rgba);

    const [cr, cg, cb] = opts.color;
    const budget = squaredBudget(opts.tolerance);
    const matches = (i: number): boolean => {
        if (out[i * 4 + 3] === 0) return false; // already transparent
        const dr = out[i * 4] - cr;
        const dg = out[i * 4 + 1] - cg;
        const db = out[i * 4 + 2] - cb;
        return dr * dr + dg * dg + db * db <= budget;
    };
    const clear = (i: number) => {
        out[i * 4 + 3] = 0;
    };

    if (!opts.contiguous) {
        const n = w * h;
        for (let i = 0; i < n; i++) if (matches(i)) clear(i);
        return out;
    }

    // Contiguous flood fill (4-connected, iterative).
    const seeds: number[] = [];
    if (opts.seed) {
        const x = Math.max(0, Math.min(w - 1, Math.round(opts.seed[0])));
        const y = Math.max(0, Math.min(h - 1, Math.round(opts.seed[1])));
        seeds.push(y * w + x);
    } else {
        for (let x = 0; x < w; x++) {
            seeds.push(x);
            seeds.push((h - 1) * w + x);
        }
        for (let y = 0; y < h; y++) {
            seeds.push(y * w);
            seeds.push(y * w + w - 1);
        }
    }

    const visited = new Uint8Array(w * h);
    const stack: number[] = [];
    for (const s of seeds) {
        if (!visited[s] && matches(s)) {
            visited[s] = 1;
            stack.push(s);
        }
    }
    while (stack.length) {
        const i = stack.pop() as number;
        clear(i);
        const x = i % w;
        const y = (i - x) / w;
        if (x > 0 && !visited[i - 1] && matches(i - 1)) {
            visited[i - 1] = 1;
            stack.push(i - 1);
        }
        if (x < w - 1 && !visited[i + 1] && matches(i + 1)) {
            visited[i + 1] = 1;
            stack.push(i + 1);
        }
        if (y > 0 && !visited[i - w] && matches(i - w)) {
            visited[i - w] = 1;
            stack.push(i - w);
        }
        if (y < h - 1 && !visited[i + w] && matches(i + w)) {
            visited[i + w] = 1;
            stack.push(i + w);
        }
    }
    return out;
}

/** Sample a pixel's RGB from an RGBA buffer (clamped to bounds). */
export function sampleColor(
    rgba: Uint8ClampedArray | number[],
    w: number,
    h: number,
    x: number,
    y: number,
): RGB {
    const cx = Math.max(0, Math.min(w - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(h - 1, Math.round(y)));
    const i = (cy * w + cx) * 4;
    return [rgba[i], rgba[i + 1], rgba[i + 2]];
}
