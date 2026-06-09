// Client-side photo downscaling. Site photos straight off a phone are several
// MB; we draw them onto a canvas capped at maxDim and re-encode as JPEG before
// upload — smaller payloads, cheaper storage, and the survey pack doesn't need
// full-res. Returns base64 with NO data-URL prefix (the upload action expects
// raw base64). JPEG/PNG/WebP decode in every target browser; HEIC may not, so
// we surface a clear error rather than uploading something unrenderable.

export interface DownscaledImage {
    base64: string;
    contentType: 'image/jpeg';
    width: number;
    height: number;
}

function loadImage(file: File): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve(img);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(
                new Error(
                    "couldn't read that image — try a JPEG or PNG (HEIC isn't supported)",
                ),
            );
        };
        img.src = url;
    });
}

export async function fileToDownscaledBase64(
    file: File,
    maxDim = 2000,
    quality = 0.78,
): Promise<DownscaledImage> {
    const img = await loadImage(file);
    const { naturalWidth: w, naturalHeight: h } = img;
    const scale = Math.min(1, maxDim / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale));
    const ch = Math.max(1, Math.round(h * scale));

    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    // White matte so any transparency doesn't go black in JPEG.
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, cw, ch);
    ctx.drawImage(img, 0, 0, cw, ch);

    const dataUrl = canvas.toDataURL('image/jpeg', quality);
    const comma = dataUrl.indexOf(',');
    return {
        base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
        contentType: 'image/jpeg',
        width: cw,
        height: ch,
    };
}
