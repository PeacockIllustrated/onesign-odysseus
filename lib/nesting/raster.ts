/**
 * Conservative polygon rasterisation for the nesting engine.
 *
 * Pieces are tested for collisions on a bitmask grid (`resolutionMm` cells).
 * The mask must be a SUPERSET of the true shape — over-covering merely costs
 * a sliver of material; under-covering would let two pieces physically touch.
 * Two signals are OR-ed together to guarantee that:
 *
 *   1. even-odd scanline fill at cell centres (the interior), and
 *   2. stamping every cell the boundary passes through (sampled at res/3,
 *      so partial edge cells the centre-fill misses are still marked).
 *
 * The minimum-gap rule is enforced by dilating the *candidate* piece's mask
 * by the full gap (disc kernel) and testing it against the un-dilated masks
 * of already-placed pieces — pairwise clearance is therefore ≥ gap without
 * double-counting.
 *
 * DOM-free; runs in the worker and in Vitest's node environment.
 */

import type { Ring } from './types';

export interface RasterMask {
    wCells: number;
    hCells: number;
    /** Words per row. */
    rowWords: number;
    /** Row-major bitset, rowWords * hCells words. */
    words: Uint32Array;
}

export function createMask(wCells: number, hCells: number): RasterMask {
    const rowWords = Math.max(1, Math.ceil(wCells / 32));
    return {
        wCells,
        hCells,
        rowWords,
        words: new Uint32Array(rowWords * hCells),
    };
}

export function setBit(mask: RasterMask, x: number, y: number): void {
    if (x < 0 || y < 0 || x >= mask.wCells || y >= mask.hCells) return;
    mask.words[y * mask.rowWords + (x >> 5)] |= 1 << (x & 31);
}

export function getBit(mask: RasterMask, x: number, y: number): boolean {
    if (x < 0 || y < 0 || x >= mask.wCells || y >= mask.hCells) return false;
    return (mask.words[y * mask.rowWords + (x >> 5)] & (1 << (x & 31))) !== 0;
}

/** Set bits x0..x1 inclusive on one row (clamped). */
function fillRowRange(mask: RasterMask, y: number, x0: number, x1: number): void {
    if (y < 0 || y >= mask.hCells) return;
    const a = Math.max(0, x0);
    const b = Math.min(mask.wCells - 1, x1);
    if (a > b) return;
    const base = y * mask.rowWords;
    for (let w = a >> 5; w <= b >> 5; w++) {
        const lo = Math.max(a, w << 5) & 31;
        const hi = Math.min(b, (w << 5) + 31) & 31;
        const span = hi - lo + 1;
        const m = span === 32 ? 0xffffffff : (((1 << span) - 1) << lo) >>> 0;
        mask.words[base + w] |= m;
    }
}

/**
 * Rasterise a set of rings (even-odd rule across ALL of them) into a fresh
 * mask. Rings must already be normalised to a bounding box with min corner
 * (0,0); the mask covers [0, widthMm] × [0, heightMm].
 *
 * To treat holes as solid (hole-nesting disabled), simply pass the outer
 * ring only.
 */
export function rasterizeRings(
    rings: Ring[],
    widthMm: number,
    heightMm: number,
    resolutionMm: number,
): RasterMask {
    const wCells = Math.max(1, Math.ceil(widthMm / resolutionMm - 1e-9));
    const hCells = Math.max(1, Math.ceil(heightMm / resolutionMm - 1e-9));
    const mask = createMask(wCells, hCells);

    // 1. Interior: even-odd scanline fill at cell centres.
    const crossings: number[] = [];
    for (let r = 0; r < hCells; r++) {
        const yc = (r + 0.5) * resolutionMm;
        crossings.length = 0;
        for (const ring of rings) {
            const n = ring.length;
            for (let i = 0; i < n; i++) {
                const [ax, ay] = ring[i];
                const [bx, by] = ring[(i + 1) % n];
                if (ay > yc !== by > yc) {
                    crossings.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
                }
            }
        }
        crossings.sort((a, b) => a - b);
        for (let k = 0; k + 1 < crossings.length; k += 2) {
            const x0 = crossings[k];
            const x1 = crossings[k + 1];
            // Cells whose centre lies in [x0, x1).
            const c0 = Math.ceil(x0 / resolutionMm - 0.5);
            const c1 = Math.ceil(x1 / resolutionMm - 0.5) - 1;
            fillRowRange(mask, r, c0, c1);
        }
    }

    // 2. Boundary: stamp every cell the outline passes through.
    const step = resolutionMm / 3;
    const clampX = (c: number) => Math.min(wCells - 1, Math.max(0, c));
    const clampY = (c: number) => Math.min(hCells - 1, Math.max(0, c));
    for (const ring of rings) {
        const n = ring.length;
        for (let i = 0; i < n; i++) {
            const [ax, ay] = ring[i];
            const [bx, by] = ring[(i + 1) % n];
            const len = Math.hypot(bx - ax, by - ay);
            const samples = Math.max(1, Math.ceil(len / step));
            for (let s = 0; s <= samples; s++) {
                const t = s / samples;
                const x = ax + (bx - ax) * t;
                const y = ay + (by - ay) * t;
                setBit(
                    mask,
                    clampX(Math.floor(x / resolutionMm)),
                    clampY(Math.floor(y / resolutionMm)),
                );
            }
        }
    }

    return mask;
}

/** OR `src` into `dst` with the bits shifted right (positive dx) by dx cells. */
function orRowShifted(
    dst: Uint32Array,
    dstOffset: number,
    dstWords: number,
    src: Uint32Array,
    srcOffset: number,
    srcWords: number,
    dx: number,
): void {
    const wordShift = dx >> 5;
    const bitShift = dx & 31;
    for (let w = 0; w < srcWords; w++) {
        const v = src[srcOffset + w];
        if (v === 0) continue;
        const lo = wordShift + w;
        if (bitShift === 0) {
            if (lo >= 0 && lo < dstWords) dst[dstOffset + lo] |= v;
        } else {
            if (lo >= 0 && lo < dstWords) dst[dstOffset + lo] |= v << bitShift;
            const hi = lo + 1;
            if (hi >= 0 && hi < dstWords) dst[dstOffset + hi] |= v >>> (32 - bitShift);
        }
    }
}

/**
 * Morphological dilation by a disc of `radiusCells`. The result is larger
 * than the input by `radiusCells` on every side — callers must remember the
 * (-radius, -radius) origin shift when positioning it.
 */
export function dilateMask(mask: RasterMask, radiusCells: number): RasterMask {
    if (radiusCells <= 0) return mask;
    const r = radiusCells;
    const out = createMask(mask.wCells + 2 * r, mask.hCells + 2 * r);
    for (let y = 0; y < mask.hCells; y++) {
        const srcOffset = y * mask.rowWords;
        // Skip empty source rows quickly.
        let empty = true;
        for (let w = 0; w < mask.rowWords; w++) {
            if (mask.words[srcOffset + w] !== 0) {
                empty = false;
                break;
            }
        }
        if (empty) continue;
        for (let dy = -r; dy <= r; dy++) {
            const wExt = Math.floor(Math.sqrt(r * r - dy * dy) + 1e-9);
            const outY = y + r + dy;
            const dstOffset = outY * out.rowWords;
            for (let dx = -wExt; dx <= wExt; dx++) {
                orRowShifted(
                    out.words,
                    dstOffset,
                    out.rowWords,
                    mask.words,
                    srcOffset,
                    mask.rowWords,
                    dx + r,
                );
            }
        }
    }
    return out;
}

/**
 * Per-row run-length extraction: each row becomes a flat [start, end,
 * start, end, …] array of half-open cell intervals. Runs are what the
 * placement sweep consumes — interval tests against the occupancy rows.
 */
export function runsFromMask(mask: RasterMask): number[][] {
    const rows: number[][] = new Array(mask.hCells);
    for (let y = 0; y < mask.hCells; y++) {
        const runs: number[] = [];
        const base = y * mask.rowWords;
        let x = 0;
        while (x < mask.wCells) {
            // Next set bit at or after x.
            let w = x >> 5;
            let word = mask.words[base + w] & (0xffffffff << (x & 31));
            while (word === 0 && ++w < mask.rowWords) word = mask.words[base + w];
            if (w >= mask.rowWords) break;
            const s = (w << 5) + (31 - Math.clz32(word & -word));
            if (s >= mask.wCells) break;
            // Next clear bit at or after s.
            let w2 = s >> 5;
            let inv = ~mask.words[base + w2] & (0xffffffff << (s & 31));
            while (inv === 0 && ++w2 < mask.rowWords) inv = ~mask.words[base + w2];
            let e =
                w2 >= mask.rowWords
                    ? mask.wCells
                    : (w2 << 5) + (31 - Math.clz32(inv & -inv));
            if (e > mask.wCells) e = mask.wCells;
            runs.push(s, e);
            x = e;
        }
        rows[y] = runs;
    }
    return rows;
}

/** Count of set cells (debug / stats). */
export function maskPopCount(mask: RasterMask): number {
    let n = 0;
    for (const w of mask.words) {
        let v = w;
        v -= (v >>> 1) & 0x55555555;
        v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
        n += (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
    }
    return n;
}
