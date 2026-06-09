import type { Measurements } from './types';

// =============================================================================
// buildSurveySketch — turn a surveyor's measurements into a clean, dimensioned
// SVG diagram (front + side elevation with dimension arrows). Pure + framework-
// free so it renders identically in the live editor (client) and the printed
// survey pack (server). Generic by design: it draws labelled rectangles, not a
// specific sign construction (see plan — "generic dimensioned sketch").
// =============================================================================

export interface SketchOptions {
    /** Draw the return fold hint on the side elevation. */
    hasReturns?: boolean;
    /** Draw shadow-gap lip ticks on the side elevation. */
    shadowGap?: boolean;
    /** Title shown above the front elevation (e.g. the item label). */
    title?: string;
}

const FIT = 280; // longest face edge maps to this many SVG units
const PAD = 60; // room for dimension text around the drawing
const GAP = 64; // gap between front and side elevations
const INK = '#111';
const FAINT = '#9ca3af';
const FACE = '#f1f5f9';

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function fmtMm(v: number): string {
    return `${Math.round(v)} mm`;
}

/** Label with a translucent backing so it stays legible over drawing lines. */
function label(cx: number, cy: number, text: string, rotate = 0): string {
    const fs = 12;
    const w = text.length * fs * 0.62 + 10;
    const h = fs + 6;
    const tf = rotate ? ` transform="rotate(${rotate} ${cx} ${cy})"` : '';
    return (
        `<g${tf}>` +
        `<rect x="${(cx - w / 2).toFixed(1)}" y="${(cy - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="2" fill="#fff" opacity="0.88"/>` +
        `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="${fs}" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle" dominant-baseline="central" fill="${INK}">${esc(text)}</text>` +
        `</g>`
    );
}

/** Horizontal dimension below an edge: extension lines + double-arrow + label. */
function dimH(x1: number, x2: number, yEdge: number, yDim: number, text: string): string {
    return (
        `<line x1="${x1.toFixed(1)}" y1="${yEdge.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${(yDim + 5).toFixed(1)}" stroke="${FAINT}" stroke-width="1"/>` +
        `<line x1="${x2.toFixed(1)}" y1="${yEdge.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${(yDim + 5).toFixed(1)}" stroke="${FAINT}" stroke-width="1"/>` +
        `<line x1="${x1.toFixed(1)}" y1="${yDim.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${yDim.toFixed(1)}" stroke="${INK}" stroke-width="1" marker-start="url(#svy-arrow)" marker-end="url(#svy-arrow)"/>` +
        label((x1 + x2) / 2, yDim - 9, text)
    );
}

/** Vertical dimension beside an edge: extension lines + double-arrow + label. */
function dimV(y1: number, y2: number, xEdge: number, xDim: number, text: string): string {
    return (
        `<line x1="${xEdge.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${(xDim - 5).toFixed(1)}" y2="${y1.toFixed(1)}" stroke="${FAINT}" stroke-width="1"/>` +
        `<line x1="${xEdge.toFixed(1)}" y1="${y2.toFixed(1)}" x2="${(xDim - 5).toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${FAINT}" stroke-width="1"/>` +
        `<line x1="${xDim.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${xDim.toFixed(1)}" y2="${y2.toFixed(1)}" stroke="${INK}" stroke-width="1" marker-start="url(#svy-arrow)" marker-end="url(#svy-arrow)"/>` +
        label(xDim - 9, (y1 + y2) / 2, text, -90)
    );
}

function caption(cx: number, cy: number, text: string): string {
    return `<text x="${cx.toFixed(1)}" y="${cy.toFixed(1)}" font-size="11" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle" fill="${FAINT}" letter-spacing="0.08em">${esc(text.toUpperCase())}</text>`;
}

function wrap(vbw: number, vbh: number, title: string, body: string): string {
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${vbw.toFixed(0)} ${vbh.toFixed(0)}" ` +
        `style="width:100%;height:auto;display:block" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(title)}">` +
        `<defs><marker id="svy-arrow" markerWidth="9" markerHeight="9" refX="7.5" refY="4" orient="auto-start-reverse" markerUnits="userSpaceOnUse">` +
        `<path d="M0,0 L8,4 L0,8 Z" fill="${INK}"/></marker></defs>` +
        body +
        `</svg>`
    );
}

function placeholder(): string {
    return wrap(
        360,
        160,
        'Sketch placeholder',
        `<rect x="1" y="1" width="358" height="158" rx="6" fill="${FACE}" stroke="#e5e7eb" stroke-dasharray="5 4"/>` +
            `<text x="180" y="84" font-size="13" font-family="ui-sans-serif, system-ui, sans-serif" text-anchor="middle" fill="${FAINT}">Enter width &amp; height to draw the item</text>`,
    );
}

export function buildSurveySketch(m: Measurements, opts: SketchOptions = {}): string {
    const w = m.width_mm ?? 0;
    const h = m.height_mm ?? 0;
    if (w <= 0 || h <= 0) return placeholder();

    const s = FIT / Math.max(w, h);
    const fw = w * s;
    const fh = h * s;

    const depthMm = m.depth_mm ?? m.return_depth_mm ?? 0;
    const drawSide = depthMm > 0 || !!opts.hasReturns || !!opts.shadowGap;
    const sd = drawSide ? Math.min(Math.max((depthMm || 40) * s, 16), 120) : 0;

    const frontX = PAD;
    const frontY = PAD;
    const sideX = frontX + fw + GAP;

    const vbw = drawSide ? sideX + sd + PAD : frontX + fw + PAD;
    const vbh = frontY + fh + PAD;

    let body = '';

    // Front elevation
    body += caption(frontX + fw / 2, frontY - 22, 'Front');
    body += `<rect x="${frontX.toFixed(1)}" y="${frontY.toFixed(1)}" width="${fw.toFixed(1)}" height="${fh.toFixed(1)}" fill="${FACE}" stroke="${INK}" stroke-width="1.5"/>`;
    // Width dim (below) + height dim (left)
    body += dimH(frontX, frontX + fw, frontY + fh, frontY + fh + 30, fmtMm(w));
    body += dimV(frontY, frontY + fh, frontX, frontX - 30, fmtMm(h));

    // Side elevation
    if (drawSide) {
        body += caption(sideX + sd / 2, frontY - 22, 'Side');
        body += `<rect x="${sideX.toFixed(1)}" y="${frontY.toFixed(1)}" width="${sd.toFixed(1)}" height="${fh.toFixed(1)}" fill="${FACE}" stroke="${INK}" stroke-width="1.5"/>`;
        // Face edge marker (the visible front of the sign on the side view).
        body += `<line x1="${sideX.toFixed(1)}" y1="${frontY.toFixed(1)}" x2="${sideX.toFixed(1)}" y2="${(frontY + fh).toFixed(1)}" stroke="${INK}" stroke-width="3"/>`;

        if (opts.shadowGap || m.shadow_gap_mm) {
            // Inward lip ticks top + bottom near the face edge.
            const lip = Math.min(sd * 0.5, 12);
            body += `<line x1="${sideX.toFixed(1)}" y1="${(frontY + 6).toFixed(1)}" x2="${(sideX + lip).toFixed(1)}" y2="${(frontY + 6).toFixed(1)}" stroke="${INK}" stroke-width="1"/>`;
            body += `<line x1="${sideX.toFixed(1)}" y1="${(frontY + fh - 6).toFixed(1)}" x2="${(sideX + lip).toFixed(1)}" y2="${(frontY + fh - 6).toFixed(1)}" stroke="${INK}" stroke-width="1"/>`;
        }

        if (depthMm > 0) {
            body += dimH(sideX, sideX + sd, frontY + fh, frontY + fh + 30, fmtMm(depthMm));
        } else {
            body += caption(sideX + sd / 2, frontY + fh + 24, opts.hasReturns ? 'Returns' : 'Depth t.b.c.');
        }
    }

    const title = opts.title ? `Sketch — ${opts.title}` : 'Survey item sketch';
    return wrap(vbw, vbh, title, body);
}
