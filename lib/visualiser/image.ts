// =============================================================================
// THUMBNAIL TRIM
// =============================================================================
//
// The 3D preview is captured with the sign floating in a margin of background
// (the orbit camera frames it loosely). For the backshop board we want the
// sign cropped to fit — filling its banner rather than sitting tiny in a sea
// of empty space. `findContentBounds` is the pure, testable core: given raw
// RGBA pixels it returns the bounding box of the "content" (everything that
// differs from the background colour sampled at the corners). The canvas
// wrapper `trimImageDataUrl` does the DOM bits and always falls back to the
// original image if anything is off.

export interface Bounds {
    x: number;
    y: number;
    w: number;
    h: number;
}

interface FindOpts {
    /** Per-pixel colour-distance (sum of |ΔR|+|ΔG|+|ΔB|) above which a pixel
     *  counts as content. */
    tolerance?: number;
    /** Alpha at/under which a pixel is treated as background regardless of
     *  colour (for transparent captures). */
    alphaFloor?: number;
}

/**
 * Bounding box of the non-background content, or null when the image is
 * effectively uniform or the content already fills the frame (nothing to
 * crop). Background is sampled from the four corners.
 */
export function findContentBounds(
    data: Uint8ClampedArray,
    width: number,
    height: number,
    opts: FindOpts = {},
): Bounds | null {
    if (width <= 0 || height <= 0 || data.length < width * height * 4) {
        return null;
    }
    const tol = opts.tolerance ?? 28;
    const alphaFloor = opts.alphaFloor ?? 12;

    const at = (x: number, y: number) => (y * width + x) * 4;
    // Average the four corners for a stable background reference.
    const corners = [
        at(0, 0),
        at(width - 1, 0),
        at(0, height - 1),
        at(width - 1, height - 1),
    ];
    let br = 0,
        bg = 0,
        bb = 0,
        ba = 0;
    for (const c of corners) {
        br += data[c];
        bg += data[c + 1];
        bb += data[c + 2];
        ba += data[c + 3];
    }
    br /= corners.length;
    bg /= corners.length;
    bb /= corners.length;
    ba /= corners.length;
    // Transparent background → any opaque pixel is content, regardless of
    // colour (a black sign on a transparent canvas has zero colour-distance
    // from the all-zero corners). Opaque background → compare colour.
    const transparentBg = ba <= alphaFloor;

    let minX = width,
        minY = height,
        maxX = -1,
        maxY = -1;
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = at(x, y);
            const a = data[i + 3];
            if (a <= alphaFloor) continue; // transparent → background
            if (!transparentBg) {
                const dist =
                    Math.abs(data[i] - br) +
                    Math.abs(data[i + 1] - bg) +
                    Math.abs(data[i + 2] - bb);
                if (dist <= tol) continue;
            }
            if (x < minX) minX = x;
            if (y < minY) minY = y;
            if (x > maxX) maxX = x;
            if (y > maxY) maxY = y;
        }
    }

    if (maxX < minX || maxY < minY) return null; // uniform — nothing to crop
    // Already (essentially) full-frame — not worth cropping.
    if (minX === 0 && minY === 0 && maxX === width - 1 && maxY === height - 1) {
        return null;
    }
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

/**
 * Crop a PNG/JPEG data URL to its non-background content (with a small pad),
 * returning a fresh PNG data URL. Falls back to the original on any failure
 * or when there's nothing meaningful to crop. Browser-only (uses canvas).
 */
export async function trimImageDataUrl(dataUrl: string): Promise<string> {
    if (typeof document === 'undefined') return dataUrl;
    try {
        const img = await new Promise<HTMLImageElement>((resolve, reject) => {
            const im = new window.Image();
            im.onload = () => resolve(im);
            im.onerror = () => reject(new Error('image load failed'));
            im.src = dataUrl;
        });
        const w = img.naturalWidth;
        const h = img.naturalHeight;
        if (!w || !h) return dataUrl;

        const src = document.createElement('canvas');
        src.width = w;
        src.height = h;
        const sctx = src.getContext('2d', { willReadFrequently: true });
        if (!sctx) return dataUrl;
        sctx.drawImage(img, 0, 0);
        const { data } = sctx.getImageData(0, 0, w, h);

        const bounds = findContentBounds(data, w, h);
        if (!bounds) return dataUrl;

        // Pad a touch so the sign isn't flush to the edge.
        const pad = Math.round(Math.min(w, h) * 0.02);
        const x = Math.max(0, bounds.x - pad);
        const y = Math.max(0, bounds.y - pad);
        const cw = Math.min(w - x, bounds.w + pad * 2);
        const ch = Math.min(h - y, bounds.h + pad * 2);

        const out = document.createElement('canvas');
        out.width = cw;
        out.height = ch;
        const octx = out.getContext('2d');
        if (!octx) return dataUrl;
        octx.drawImage(img, x, y, cw, ch, 0, 0, cw, ch);
        return out.toDataURL('image/png');
    } catch {
        return dataUrl;
    }
}
