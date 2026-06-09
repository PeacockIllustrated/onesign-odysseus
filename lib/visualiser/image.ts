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

// =============================================================================
// FULL-COLOUR ARTWORK RASTER (printed vinyl)
// =============================================================================
//
// Printed vinyl has to keep the artwork's real colours + gradients — which the
// cut pipeline throws away (it flattens every path to polylines + one solid
// colour, dropping gradients entirely). Rather than reconstruct gradients in
// three different renderers, we rasterise the true artwork ONCE into a single
// face-coordinate PNG: a transparent image the size of the panel face, with
// each artwork layer drawn at its placed position. Vinyl pieces then sample
// that image (3D texture / clipped <image> / PDF addImage), so colour +
// gradients fall out for free everywhere, and the vinyl piece polygons stay
// as the contour cut line — i.e. print-&-cut.

/** One artwork layer placed on the panel face, in mm (origin = face top-left). */
export interface PlacedArtwork {
    /** Raw SVG string — colours + gradients intact (NOT the flattened one). */
    svg: string;
    xMm: number;
    yMm: number;
    wMm: number;
    hMm: number;
    /**
     * The artwork's CONTENT bounding box in its own SVG units. Forced onto the
     * rasterised <svg> as the viewBox so the content bbox (not a padded
     * artboard) maps to the placed rect — keeping the print aligned with the
     * flattened cut polylines, which are anchored to the same content bbox.
     */
    viewBox?: { x: number; y: number; w: number; h: number };
}

/** A closed shape (outer ring minus holes) the artwork is masked to, in the
 *  same face-top-left mm coordinates as PlacedArtwork. */
export interface MaskShape {
    outer: Array<[number, number]>;
    holes?: Array<Array<[number, number]>>;
}

/**
 * Force explicit pixel width/height (and a viewBox when asked / inferable)
 * onto the root <svg> so canvas drawImage always has a non-zero intrinsic
 * size to scale from — some browsers render a viewBox-only or unsized SVG at
 * 0×0. The destination box in drawImage is explicit anyway; this only
 * guarantees the source rasterises at all and keeps its aspect / origin.
 */
export function svgWithPixelSize(
    svg: string,
    wPx: number,
    hPx: number,
    viewBox?: { x: number; y: number; w: number; h: number },
): string {
    return svg.replace(/<svg\b([^>]*?)>/i, (_full, attrs: string) => {
        const hasViewBox = /\bviewBox\s*=/i.test(attrs);
        const wM = /\bwidth\s*=\s*["']?\s*([\d.]+)/i.exec(attrs);
        const hM = /\bheight\s*=\s*["']?\s*([\d.]+)/i.exec(attrs);
        let a = attrs.replace(
            /\s(width|height)\s*=\s*("[^"]*"|'[^']*'|[\d.]+)/gi,
            '',
        );
        // An explicit content bbox wins (keeps the print aligned to the cut
        // geometry); else synth one from numeric width/height; else leave any
        // existing viewBox untouched.
        if (viewBox) {
            a = a.replace(/\sviewBox\s*=\s*("[^"]*"|'[^']*')/gi, '');
            a += ` viewBox="${viewBox.x} ${viewBox.y} ${viewBox.w} ${viewBox.h}"`;
        } else if (!hasViewBox && wM && hM) {
            a += ` viewBox="0 0 ${wM[1]} ${hM[1]}"`;
        }
        return `<svg ${a.trim()} width="${wPx}" height="${hPx}">`;
    });
}

function loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const im = new window.Image();
        im.onload = () => resolve(im);
        im.onerror = () => reject(new Error('image load failed'));
        im.src = src;
    });
}

/**
 * Rasterise placed artwork layers into one transparent face-sized PNG data
 * URL (mm → px). Resolution is capped on the longest side so a 3 m sign can't
 * blow up the canvas / GPU texture; large-format print is forgiving of low
 * absolute DPI. Returns null off the main thread or if nothing rendered.
 * Browser-only (uses canvas).
 */
export async function rasterizeFaceArtwork(
    layers: PlacedArtwork[],
    faceWMm: number,
    faceHMm: number,
    opts: { maxPx?: number; pxPerMm?: number; mask?: MaskShape[] } = {},
): Promise<string | null> {
    if (typeof document === 'undefined') return null;
    if (!layers.length || faceWMm <= 0 || faceHMm <= 0) return null;
    try {
        const longestMm = Math.max(faceWMm, faceHMm);
        const maxPx = opts.maxPx ?? 2048;
        let pxPerMm = opts.pxPerMm ?? 3; // ~76 dpi at 1:1
        if (longestMm * pxPerMm > maxPx) pxPerMm = maxPx / longestMm;
        pxPerMm = Math.max(0.2, pxPerMm);

        const cw = Math.max(1, Math.round(faceWMm * pxPerMm));
        const ch = Math.max(1, Math.round(faceHMm * pxPerMm));
        const canvas = document.createElement('canvas');
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;

        for (const layer of layers) {
            const lwPx = Math.max(1, Math.round(layer.wMm * pxPerMm));
            const lhPx = Math.max(1, Math.round(layer.hMm * pxPerMm));
            const sized = svgWithPixelSize(
                layer.svg,
                lwPx,
                lhPx,
                layer.viewBox,
            );
            const url =
                'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized);
            const img = await loadImage(url);
            ctx.drawImage(
                img,
                layer.xMm * pxPerMm,
                layer.yMm * pxPerMm,
                lwPx,
                lhPx,
            );
        }

        // Mask the artwork down to the vinyl shapes (outer rings minus their
        // counters) so the single image only paints where vinyl actually is —
        // the renderers can then drop it straight onto the face with no
        // clipping. Even-odd fill so a letter's counter stays unprinted.
        if (opts.mask && opts.mask.length > 0) {
            ctx.globalCompositeOperation = 'destination-in';
            ctx.beginPath();
            for (const shape of opts.mask) {
                const ring = shape.outer;
                if (ring.length < 3) continue;
                ctx.moveTo(ring[0][0] * pxPerMm, ring[0][1] * pxPerMm);
                for (let i = 1; i < ring.length; i++)
                    ctx.lineTo(ring[i][0] * pxPerMm, ring[i][1] * pxPerMm);
                ctx.closePath();
                for (const hole of shape.holes ?? []) {
                    if (hole.length < 3) continue;
                    ctx.moveTo(hole[0][0] * pxPerMm, hole[0][1] * pxPerMm);
                    for (let i = 1; i < hole.length; i++)
                        ctx.lineTo(hole[i][0] * pxPerMm, hole[i][1] * pxPerMm);
                    ctx.closePath();
                }
            }
            ctx.fill('evenodd');
            ctx.globalCompositeOperation = 'source-over';
        }

        return canvas.toDataURL('image/png');
    } catch {
        return null;
    }
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
