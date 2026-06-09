import type { Annotation } from './types';

// Render a photo + its annotation markup as a single self-contained SVG string
// for the survey pack (server-side). Embedding the photo via <image> on a
// viewBox sized to the image's pixel dimensions guarantees the markup stays
// pin-aligned and uniformly scaled at any print size — no letterbox drift.
// Visual language matches the interactive PhotoAnnotator.

const MEASURE = '#e11d48';
const PIN = '#2563eb';
const NOTE_BG = '#111827';

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function labelTag(
    x: number,
    y: number,
    text: string,
    u: number,
    bg: string,
    fg: string,
    anchor: 'middle' | 'start',
): string {
    const fs = u * 3;
    const w = text.length * fs * 0.6 + u * 2;
    const h = fs + u * 1.4;
    const rx = anchor === 'start' ? x : x - w / 2;
    const tx = anchor === 'start' ? x + u : x;
    return (
        `<rect x="${rx.toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" rx="${(u * 0.6).toFixed(1)}" fill="${bg}" opacity="0.92"/>` +
        `<text x="${tx.toFixed(1)}" y="${y.toFixed(1)}" font-size="${fs.toFixed(1)}" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="600" text-anchor="${anchor}" dominant-baseline="central" fill="${fg}">${esc(text)}</text>`
    );
}

/** Annotation primitives only (no wrapper / defs). Coordinates in px space. */
export function annotationsToSvg(
    annotations: Annotation[],
    w: number,
    h: number,
): string {
    const u = Math.max(w, h) / 100;
    let out = '';
    for (const a of annotations) {
        if (a.kind === 'measure') {
            const ax = a.a[0] * w,
                ay = a.a[1] * h,
                bx = a.b[0] * w,
                by = a.b[1] * h;
            out +=
                `<line x1="${ax.toFixed(1)}" y1="${ay.toFixed(1)}" x2="${bx.toFixed(1)}" y2="${by.toFixed(1)}" stroke="${MEASURE}" stroke-width="${(u * 0.45).toFixed(2)}" marker-start="url(#svy-pack-arrow)" marker-end="url(#svy-pack-arrow)"/>`;
            if (a.label)
                out += labelTag((ax + bx) / 2, (ay + by) / 2, a.label, u, '#fff', '#111', 'middle');
        } else if (a.kind === 'pin') {
            const x = a.at[0] * w,
                y = a.at[1] * h;
            out +=
                `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(u * 2.4).toFixed(1)}" fill="${PIN}" stroke="#fff" stroke-width="${(u * 0.4).toFixed(2)}"/>` +
                `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" font-size="${(u * 2.8).toFixed(1)}" font-family="ui-sans-serif, system-ui, sans-serif" font-weight="700" text-anchor="middle" dominant-baseline="central" fill="#fff">${a.n}</text>`;
        } else if (a.kind === 'note') {
            const x = a.at[0] * w,
                y = a.at[1] * h;
            out +=
                `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(u * 0.8).toFixed(1)}" fill="${NOTE_BG}"/>` +
                labelTag(x + u * 1.2, y, a.text || 'note', u, NOTE_BG, '#fff', 'start');
        } else {
            // rect
            const x = a.x * w,
                y = a.y * h;
            out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(a.w * w).toFixed(1)}" height="${(a.h * h).toFixed(1)}" fill="none" stroke="${MEASURE}" stroke-width="${(u * 0.45).toFixed(2)}"/>`;
            if (a.label) out += labelTag(x + (a.w * w) / 2, y, a.label, u, '#fff', '#111', 'middle');
        }
    }
    return out;
}

/** Full <svg> embedding the photo + its annotations, sized to the image. */
export function buildPhotoSvg(
    url: string,
    annotations: Annotation[],
    w: number,
    h: number,
): string {
    const u = Math.max(w, h) / 100;
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;display:block">` +
        `<defs><marker id="svy-pack-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">` +
        `<path d="M0,0 L${u.toFixed(1)},${(u / 2).toFixed(1)} L0,${u.toFixed(1)} Z" fill="${MEASURE}"/></marker></defs>` +
        `<image href="${esc(url)}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet"/>` +
        annotationsToSvg(annotations, w, h) +
        `</svg>`
    );
}
