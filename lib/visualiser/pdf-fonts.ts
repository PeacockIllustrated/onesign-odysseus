/**
 * jsPDF font loader for the visualiser PDFs.
 *
 * The brand's wordmark font is Gilroy and the TTFs live under
 * /public/fonts/. We fetch them once on first PDF generation, base64-
 * encode them, register them in jsPDF's virtual file system, and then
 * cache the success so subsequent generations are synchronous-fast.
 *
 * Falls back to the built-in 'helvetica' family if either TTF cannot
 * be fetched — better than failing the whole export over a 404.
 */
import type { jsPDF } from 'jspdf';

const FONT_FAMILY = 'Gilroy';
const REGULAR_URL = '/fonts/Gilroy-Regular.ttf';
const BOLD_URL = '/fonts/Gilroy-Bold.ttf';

type LoadedFonts = {
    /** Family name to pass to doc.setFont() — Gilroy on success, helvetica on fallback. */
    family: string;
    /** True when both regular + bold were embedded. False = fallback fonts. */
    embedded: boolean;
};

let cached: { regular: string; bold: string } | null = null;
let loadPromise: Promise<{ regular: string; bold: string } | null> | null =
    null;

async function fetchAsBase64(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const buf = await res.arrayBuffer();
    // Convert binary → base64. btoa() only accepts strings, so walk
    // the bytes and build a binary string first.
    let bin = '';
    const bytes = new Uint8Array(buf);
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        bin += String.fromCharCode.apply(
            null,
            Array.from(bytes.subarray(i, i + chunk)),
        );
    }
    return btoa(bin);
}

async function loadFontPairOnce(): Promise<{
    regular: string;
    bold: string;
} | null> {
    if (cached) return cached;
    if (loadPromise) return loadPromise;
    loadPromise = (async () => {
        try {
            const [regular, bold] = await Promise.all([
                fetchAsBase64(REGULAR_URL),
                fetchAsBase64(BOLD_URL),
            ]);
            cached = { regular, bold };
            return cached;
        } catch {
            return null;
        }
    })();
    return loadPromise;
}

/**
 * Register Gilroy with the given doc. Safe to call multiple times —
 * jsPDF's addFileToVFS dedupes by name and addFont is idempotent.
 * Returns the resolved family + whether embedding succeeded so the
 * caller can decide whether it's safe to emit non-ASCII text.
 */
export async function registerVisualiserFonts(
    doc: jsPDF,
): Promise<LoadedFonts> {
    const pair = await loadFontPairOnce();
    if (!pair) {
        return { family: 'helvetica', embedded: false };
    }
    doc.addFileToVFS('Gilroy-Regular.ttf', pair.regular);
    doc.addFileToVFS('Gilroy-Bold.ttf', pair.bold);
    doc.addFont('Gilroy-Regular.ttf', FONT_FAMILY, 'normal');
    doc.addFont('Gilroy-Bold.ttf', FONT_FAMILY, 'bold');
    return { family: FONT_FAMILY, embedded: true };
}
