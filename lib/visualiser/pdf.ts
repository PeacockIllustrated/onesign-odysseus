/**
 * PDF exports — TRUE 1:1.
 *
 * Two flavours, same per-section layout (split signs stay split — each
 * section is its own cut-ready blank, never welded across the seam):
 *
 *   - REFERENCE: the dimensioned shop drawing. Spec block, colour legend,
 *     3D thumbnail, dashed fold lines, section labels and dimension lines.
 *     This is what the shop prints to read off.
 *
 *   - PRODUCTION: cut-only. Welded outer perimeter per section + apertures
 *     + fixings + keyline, drawn as continuous closed paths (one per
 *     contour via doc.lines() with closed=true, so the CAM picks them up
 *     as single shapes). No folds, no dimensions, no labels — a small
 *     info strip out of the way of the cuts. Stroke is hairline-thin so
 *     no CAM interpretation widens the cut.
 *
 * The page is sized to the actual flat blank so 1 mm on paper = 1 mm of
 * metal. If a part is so large it would exceed the PDF page limit we
 * fall back to a reduced-scale A4 sheet and say so on the drawing.
 *
 * Text is ASCII-only — jsPDF's built-in Helvetica is WinAnsi and renders
 * stray glyphs for things like x / ÷ / — / ·.
 *
 * Browser-only (jsPDF). Callers are client components.
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import {
    type PanelParams,
    type FlatPath,
    type SectionedExport,
    type MaterialPiece,
    type StandoffPiece,
    type PushThroughPiece,
} from './types';
import { outlinePerimeter } from './geometry';
import type { EmbeddedNest, EmbeddedNestSheet } from './nest-embed';
import { registerVisualiserFonts } from './pdf-fonts';
import { acrylicByHex } from './acrylic';
import { ralByCode } from './ral';

/** Distinct acrylic brand+code for a set of piece colours (else 'custom'). */
function acrylicNames(colors: string[]): string {
    const names = colors.map((c) => {
        const a = acrylicByHex(c);
        return a ? `${a.brand} ${a.code ?? a.name}` : 'custom';
    });
    const uniq = Array.from(new Set(names));
    return uniq.length ? uniq.join(', ') : '-';
}

/** Panel colour spec string: "RAL 9016 · Traffic white" (name resolved), else the hex. */
function panelColourSpec(params: PanelParams): string {
    if (params.panelRal) {
        const r = ralByCode(params.panelRal);
        return r ? `${params.panelRal} · ${r.name}` : params.panelRal;
    }
    return params.panelColor ?? '-';
}

/** PDF media box limit is ~14400 user units; stay well under it. */
const MAX_PAGE_MM = 14000;
/** Reference PDF cap — beyond this it scales down to A4 for readability. */
const REFERENCE_PAGE_CAP_MM = 4800;

/** Brand teal — strap, accent, active states. */
const BRAND_RGB: [number, number, number] = [78, 126, 140];
const BRAND_DARK_RGB: [number, number, number] = [58, 95, 106];

/**
 * Text passthrough — kept as a function for ergonomic call sites + a
 * future hook if we ever need to sanitise. With Gilroy embedded jsPDF
 * handles UTF-8 directly, so no character coercion is needed. When the
 * font load fails the doc falls back to helvetica (Latin-1) and any
 * out-of-range glyphs render as the WinAnsi substitute — acceptable
 * fallback for an offline shop.
 */
function txt(s: string): string {
    // Normalise the few "fancy" glyphs that creep into labels (em/en
    // dashes, smart quotes, ellipsis) to ASCII. With Gilroy embedded
    // these render fine, but if the font fails to load jsPDF falls back
    // to WinAnsi helvetica where U+2014 & friends become empty boxes —
    // and a box in the middle of a cut-file label is a production
    // hazard. Latin-1 marks the fallback DOES cover (· × ÷ °) are left
    // alone.
    return s
        .replace(/[—–]/g, '-') // em / en dash → hyphen
        .replace(/[‘’]/g, "'") // smart single quotes
        .replace(/[“”]/g, '"') // smart double quotes
        .replace(/…/g, '...'); // ellipsis
}

/** Short, stable document ID for the header strap. */
function docId(designId: string | null | undefined, fallbackName: string): string {
    if (designId) return designId.slice(0, 8).toUpperCase();
    // Unsaved designs: hash the name so two unsaved exports from the
    // same design produce the same ID, but renamed designs differ.
    let h = 0;
    for (let i = 0; i < fallbackName.length; i++) {
        h = (h * 31 + fallbackName.charCodeAt(i)) | 0;
    }
    const hex = (h >>> 0).toString(16).toUpperCase().padStart(6, '0');
    return `UNSAVED-${hex.slice(0, 6)}`;
}

export interface PdfOptions {
    sectionExport: SectionedExport;
    params: PanelParams;
    /** Supabase design row id (null for unsaved designs). Drives the
     *  doc-ID strap + the QR deep link. */
    designId?: string | null;
    /** Author of the export — shown in the rev block (reference PDF). */
    drawnBy?: string | null;
    /** Per-section path arrays, already in export-sheet coords. */
    apertureBySection?: FlatPath[][];
    keylineBySection?: FlatPath[][];
    /**
     * Per-section push-through keylines — the letter-shaped panel
     * holes that pushthrough-grouped paths cut into the face. These
     * are real panel cuts alongside the aperture cuts (each group can
     * set its own outward offset, so this is built per-piece rather
     * than via the global keylineMm).
     */
    pushThroughKeylineBySection?: FlatPath[][];
    /**
     * Per-section retained counter islands (shrunk-counter contours).
     * Cut on the panel-cut page so the cutter rings the metal island
     * inside each push-through counter with the keyline gap. The island
     * stays as panel metal (remounted on the backing), so the counter
     * reads as metal with a glowing keyline ring, not an open hole.
     */
    pushThroughIslandsBySection?: FlatPath[][];
    fixingsBySection?: FlatPath[][];
    /**
     * Per-section cable-routing holes (circle polys in export-sheet
     * coords). Real panel cuts — emitted on the panel-cut page and the
     * placement template, kept separate from standoff fixings so the
     * footer can count them distinctly.
     */
    cableHolesBySection?: FlatPath[][];
    referenceBySection?: FlatPath[][];
    /**
     * Mixed-material pieces in flat-development coords. Reference PDF
     * shows them per-material on dedicated pages; production PDF
     * ignores them entirely (they aren't cuts).
     */
    vinylPieces?: MaterialPiece[];
    acrylicPieces?: MaterialPiece[];
    solidPieces?: MaterialPiece[];
    standoffPieces?: StandoffPiece[];
    /**
     * Push-through inserts. Each piece carries an outer letter outline
     * + counters in `holes`. Production PDF emits these on the push-
     * through insert page as outer + each counter as SEPARATE closed
     * contours — the cutter produces N pieces per letter (outer + one
     * per counter), all in the same acrylic, mounted to a backing
     * board behind the panel.
     */
    pushThroughPieces?: PushThroughPiece[];
    /**
     * Backlit apertures — cut from the panel (also present in the aperture
     * cuts) with an opal diffuser behind, lit from behind so the cut glows.
     * The reference PDF shows a backlight page (shapes in their glow colour);
     * the production PDF adds an opal-backing sheet page + an LED-colour note.
     * `color` is the glow colour, `glowIntensity` the brightness.
     */
    backlightPieces?: MaterialPiece[];
    /**
     * Inner-counter outlines of aperture letters (the holes in R, O,
     * A, e, etc.), clipped per section in export-sheet coords.
     *
     * NEVER emitted on the panel cut: in a non-keyline aperture cut
     * the counter cannot be mechanically held without bridges, so
     * cutting its outline just adds a doomed waste piece. The counter
     * falls away with the letter-piece during fabrication either way.
     *
     * In KEYLINE mode (push-through), the panel cut uses the
     * outward-offset keyline (a simple letter-shaped hole, no
     * counter). The acrylic insert is then cut as the original
     * letter compound shape — outer outline + these counter outlines
     * as inner compound contours. The CAM cutter pierces both rings
     * and the insert pops out as a proper letter shape with a hole
     * through it. Counter on the assembled sign reads as "panel /
     * light-box visible behind the insert".
     */
    apertureHolesBySection?: FlatPath[][];
    /**
     * Printed full-colour vinyl: a transparent face-sized PNG of the real
     * artwork (colours + gradients), masked to the printed-vinyl shapes, plus
     * the flat-development face rect it maps onto (`faceRectMm`). When both are
     * present (and the sign isn't split), the vinyl pages render this as a
     * 1:1 colour print with the vinyl piece outlines as the contour cut line —
     * i.e. print-&-cut. Absent → the vinyl pages fall back to flat fills.
     */
    vinylPrintDataUrl?: string | null;
    faceRectMm?: { x: number; y: number; w: number; h: number } | null;
    /** PNG/JPEG data URL of the 3D preview, optional. */
    thumbnailDataUrl?: string;
    /**
     * Two-item job support. When a design has a projecting sign as well as the
     * main fascia, `secondary` carries the OTHER item's full options so both
     * generators emit both items in one document (each behind an item divider,
     * every page labelled with `itemLabel` so the workshop never confuses which
     * cut sheet belongs to which sign). `companionNote` is a one-line summary of
     * the other item + its mount, shown on the reference overview.
     */
    secondary?: PdfOptions;
    /** Item name shown on every page when this is part of a two-item job. */
    itemLabel?: string;
    /** Reference-overview callout describing the companion item + its mount. */
    companionNote?: string;
    /**
     * The design's saved nests (acrylic + metal faces), reproduced to packed
     * sheets by the caller (lib/visualiser/nest-embed). Rendered as extra pages:
     * reference fits each sheet to the page; production draws it 1:1. Empty /
     * absent → no nest pages.
     */
    embeddedNests?: EmbeddedNest[];
}

/**
 * Continuous closed polyline via jsPDF's lines() API — one PDF path with
 * 'Z' close, so CAM picks it up as a single welded shape rather than N
 * disconnected line segments.
 */
function drawClosedPolyline(
    doc: jsPDF,
    pts: Array<[number, number]>,
    style: 'S' | 'F' | 'FD' = 'S',
): void {
    if (pts.length < 2) return;
    // Strip the closing-dup point if present — closed=true adds the Z.
    const head = pts[0];
    const tail = pts[pts.length - 1];
    const ring =
        Math.abs(tail[0] - head[0]) < 1e-6 && Math.abs(tail[1] - head[1]) < 1e-6
            ? pts.slice(0, -1)
            : pts;
    if (ring.length < 2) return;
    const deltas: number[][] = [];
    for (let i = 1; i < ring.length; i++) {
        deltas.push([
            ring[i][0] - ring[i - 1][0],
            ring[i][1] - ring[i - 1][1],
        ]);
    }
    doc.lines(deltas, ring[0][0], ring[0][1], [1, 1], style, true);
}

/**
 * Draw one packed nest sheet — the sheet outline plus every placed piece's
 * rings — at top-left (dX, dY), mm → page units by `scale`. Shared by the
 * reference (fit-scaled) and production (1:1) nest pages.
 */
function drawNestSheet(
    doc: jsPDF,
    sheet: EmbeddedNestSheet,
    dX: number,
    dY: number,
    scale: number,
): void {
    doc.setDrawColor(150);
    doc.setLineWidth(0.2);
    doc.rect(dX, dY, sheet.widthMm * scale, sheet.heightMm * scale, 'S');

    doc.setDrawColor(0);
    doc.setLineWidth(scale >= 1 ? 0.1 : 0.2);
    for (const piece of sheet.pieces) {
        for (const ring of piece.rings) {
            if (ring.length < 2) continue;
            const pts = ring.map(
                ([x, y]) =>
                    [dX + x * scale, dY + y * scale] as [number, number],
            );
            drawClosedPolyline(doc, pts, 'S');
        }
    }
}

/** Reference-PDF nest page — one saved sheet fitted to the page. */
function drawNestSheetPageRef(
    ctx: PageContext,
    nest: EmbeddedNest,
    sheet: EmbeddedNestSheet,
    sheetNo: number,
    sheetTotal: number,
): void {
    const { doc, pageW, pageH, margin, font } = ctx;

    doc.setFont(font, 'bold');
    doc.setFontSize(13);
    doc.setTextColor(0);
    doc.text(txt(`Nest — ${nest.name}`), margin, margin + 4);
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(
        txt(
            `Sheet ${sheetNo}/${sheetTotal}  ·  ${Math.round(sheet.widthMm)} × ${Math.round(sheet.heightMm)} mm  ·  ${sheet.pieceCount} piece${sheet.pieceCount === 1 ? '' : 's'}  ·  ${Math.round(sheet.utilisation * 100)}% used  ·  scaled to fit`,
        ),
        margin,
        margin + 9,
    );
    doc.setTextColor(0);

    const topY = margin + 14;
    const availW = pageW - margin * 2;
    const availH = pageH - topY - margin;
    const scale = Math.min(availW / sheet.widthMm, availH / sheet.heightMm);
    const dX = margin + (availW - sheet.widthMm * scale) / 2;
    const dY = topY + (availH - sheet.heightMm * scale) / 2;
    drawNestSheet(doc, sheet, dX, dY, scale);

    drawCornerQr(doc, {
        pageW,
        pageH,
        margin,
        qrDataUrl: ctx.qrDataUrl,
        font,
    });
}

// =============================================================================
// REFERENCE PDF
// =============================================================================
//
// Multi-page A4 landscape document. Built around three audiences:
//
//   1. The shop foreman opening the file cold — page 1 (Overview) is a
//      one-glance summary: sign name, panel size, materials in use, and
//      a 3D thumbnail. Everything they need to know it's the right job.
//
//   2. The CAM operator setting up the cutter — page 2 (Flat layout)
//      shows the full flat blank with dimensions and fold lines.
//
//   3. The installer / finisher — one page per material group. Each
//      page isolates a single material (vinyl colour, acrylic sheet,
//      stood-off letterset, etc.) so it's obvious which parts they're
//      working on, with the relevant specs (colour, thickness, standoff
//      distance, count, total area) right there.
//
// All pages share the same A4 landscape size. Per-section / split-panel
// behaviour is preserved on the layout pages.

type PageContext = {
    doc: jsPDF;
    pageW: number;
    pageH: number;
    margin: number;
    params: PanelParams;
    opts: PdfOptions;
    pageNumber: number;
    totalPages: number;
    /** Resolved font family — Gilroy when the TTFs load successfully,
     *  helvetica otherwise. Passed into every text call so the doc
     *  renders in the brand wordmark when possible. */
    font: string;
    /** Pre-baked QR-back-to-design URL data URL, or null on failure. */
    qrDataUrl: string | null;
    /** Item name for a two-item job (e.g. "Main fascia"), shown in the header. */
    itemLabel?: string;
};

/**
 * Brand-teal strap drawn flush against the top of every page on both
 * the production and reference PDFs. Carries:
 *   - ONESIGN wordmark + design name + 8-char document ID (left)
 *   - Doc type ("PRODUCTION · CUT FILE · 1:1" or "REFERENCE · NOT A
 *     CUT FILE") + Page X/Y (right)
 *
 * Production strap uses the darker brand variant so a stack of pages
 * is distinguishable from reference at arm's length.
 */
type DocKind = 'production' | 'reference';

const STRAP_H = 9; // mm

function drawDocStrap(
    doc: jsPDF,
    args: {
        pageW: number;
        margin: number;
        kind: DocKind;
        designName: string;
        designIdShort: string;
        pageNumber: number;
        totalPages: number;
        font: string;
        subtitle?: string;
    },
): void {
    const {
        pageW,
        margin,
        kind,
        designName,
        designIdShort,
        pageNumber,
        totalPages,
        font,
        subtitle,
    } = args;
    const teal = kind === 'production' ? BRAND_DARK_RGB : BRAND_RGB;

    // Strap background — full-bleed brand teal across the very top.
    doc.setFillColor(teal[0], teal[1], teal[2]);
    doc.rect(0, 0, pageW, STRAP_H, 'F');

    // Left block: ONESIGN wordmark + design name + doc ID.
    doc.setTextColor(255, 255, 255);
    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.text(txt('ONESIGN'), margin, 6.2);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(
        txt(`${designName}  ·  ${designIdShort}`),
        margin + 22,
        6.2,
    );

    // Right block: doc kind label + page numbering.
    const kindLabel =
        kind === 'production'
            ? 'PRODUCTION · CUT FILE · 1:1'
            : 'REFERENCE · NOT A CUT FILE';
    doc.setFont(font, 'bold');
    doc.setFontSize(9);
    doc.text(
        txt(`${kindLabel}  ·  PAGE ${pageNumber}/${totalPages}`),
        pageW - margin,
        6.2,
        { align: 'right' },
    );
    doc.setTextColor(0);

    // Page title below the strap — the operator's "what is this page"
    // cue when flipping a stack. Bold + dark so it wins over the
    // geometry; the first clause (up to the dash) is the headline, any
    // trailing detail stays lighter so the title reads at a glance.
    if (subtitle) {
        // Split "Headline — trailing detail" at the first dash
        // (em / en / hyphen) so the headline can be emphasised.
        const m = subtitle.match(/^(.*?)\s[—–-]\s(.*)$/);
        const head = m ? m[1] : subtitle;
        const tail = m ? m[2] : '';
        doc.setFont(font, 'bold');
        doc.setFontSize(11);
        doc.setTextColor(40);
        doc.text(txt(head), margin, STRAP_H + 5.5);
        if (tail) {
            const headW = doc.getTextWidth(txt(head));
            doc.setFont(font, 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(120);
            doc.text(txt(tail), margin + headW + 3, STRAP_H + 5.5);
        }
        doc.setTextColor(0);
    }
}

/** Compatibility shim — the reference PDF code still calls this. */
function drawHeaderBar(ctx: PageContext, title: string): void {
    drawDocStrap(ctx.doc, {
        pageW: ctx.pageW,
        margin: ctx.margin,
        kind: 'reference',
        designName: ctx.params.name,
        designIdShort: docId(ctx.opts.designId, ctx.params.name),
        pageNumber: ctx.pageNumber,
        totalPages: ctx.totalPages,
        font: ctx.font,
        // Prefix the item name on a two-item job so each page is clearly the
        // fascia's or the projecting sign's.
        subtitle: ctx.itemLabel ? `${ctx.itemLabel} · ${title}` : title,
    });
}

/**
 * Bottom-of-page footer with QR back to the digital design + small
 * info strip + (production only) PRINT AT 100% warning. The QR
 * dataURL is pre-baked once per export so this helper stays sync.
 */
function drawDocFooter(
    doc: jsPDF,
    args: {
        pageW: number;
        pageH: number;
        margin: number;
        kind: DocKind;
        infoLines: string[];
        qrDataUrl: string | null;
        font: string;
    },
): void {
    const { pageW, pageH, margin, kind, infoLines, qrDataUrl, font } = args;

    const qrSize = 16; // mm
    const qrX = pageW - margin - qrSize;
    const qrY = pageH - margin - qrSize;
    if (qrDataUrl) {
        try {
            doc.addImage(
                qrDataUrl,
                'PNG',
                qrX,
                qrY,
                qrSize,
                qrSize,
                undefined,
                'FAST',
            );
            doc.setFont(font, 'normal');
            doc.setFontSize(6);
            doc.setTextColor(140);
            doc.text(
                txt('Scan to open in app'),
                qrX + qrSize / 2,
                qrY + qrSize + 3,
                { align: 'center' },
            );
            doc.setTextColor(0);
        } catch {
            /* best-effort */
        }
    }

    // Info lines stacked to the left of the QR.
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90);
    const lineH = 4;
    let y = pageH - margin - qrSize + 4;
    for (const line of infoLines) {
        doc.text(txt(line), margin, y);
        y += lineH;
    }
    doc.setTextColor(0);

    // Print-warning — production only, bottom-left, brand teal.
    if (kind === 'production') {
        doc.setFont(font, 'bold');
        doc.setFontSize(8);
        doc.setTextColor(
            BRAND_DARK_RGB[0],
            BRAND_DARK_RGB[1],
            BRAND_DARK_RGB[2],
        );
        doc.text(
            txt('PRINT AT 100% — DO NOT SCALE'),
            margin,
            pageH - margin + 2,
        );
        doc.setTextColor(0);
    }
}

/**
 * Place the QR code in the bottom-right corner of a reference page.
 * Smaller than the production footer QR because reference pages have
 * their own info strip and we don't want to fight for space.
 */
function drawCornerQr(
    doc: jsPDF,
    args: {
        pageW: number;
        pageH: number;
        margin: number;
        qrDataUrl: string | null;
        font: string;
    },
): void {
    const { pageW, pageH, margin, qrDataUrl, font } = args;
    if (!qrDataUrl) return;
    const qrSize = 12;
    const qrX = pageW - margin - qrSize;
    const qrY = pageH - margin - qrSize;
    try {
        doc.addImage(
            qrDataUrl,
            'PNG',
            qrX,
            qrY,
            qrSize,
            qrSize,
            undefined,
            'FAST',
        );
        doc.setFont(font, 'normal');
        doc.setFontSize(5.5);
        doc.setTextColor(140);
        doc.text(
            txt('Scan to open'),
            qrX + qrSize / 2,
            qrY + qrSize + 2.2,
            { align: 'center' },
        );
        doc.setTextColor(0);
    } catch {
        /* best-effort */
    }
}

/** Pre-generate the QR dataURL once per export (URL is constant). */
async function buildQrCode(designId: string | null | undefined): Promise<string | null> {
    try {
        const origin =
            typeof window !== 'undefined' && window.location?.origin
                ? window.location.origin
                : 'https://onesign.app';
        const url = designId
            ? `${origin}/admin/visualiser?id=${encodeURIComponent(designId)}`
            : `${origin}/admin/visualiser`;
        return await QRCode.toDataURL(url, {
            margin: 0,
            scale: 6,
            color: { dark: '#1a1f23', light: '#ffffff' },
        });
    } catch {
        return null;
    }
}

function fitScale(
    boxW: number,
    boxH: number,
    partW: number,
    partH: number,
): number {
    if (partW <= 0 || partH <= 0) return 1;
    return Math.min(boxW / partW, boxH / partH);
}

function pathDPolyline(
    pts: Array<[number, number]>,
    closed: boolean,
): { deltas: number[][]; start: [number, number] } | null {
    if (pts.length < 2) return null;
    const head = pts[0];
    const tail = pts[pts.length - 1];
    const ring =
        closed &&
        Math.abs(tail[0] - head[0]) < 1e-6 &&
        Math.abs(tail[1] - head[1]) < 1e-6
            ? pts.slice(0, -1)
            : pts;
    if (ring.length < 2) return null;
    const deltas: number[][] = [];
    for (let i = 1; i < ring.length; i++) {
        deltas.push([ring[i][0] - ring[i - 1][0], ring[i][1] - ring[i - 1][1]]);
    }
    return { deltas, start: [ring[0][0], ring[0][1]] };
}

/**
 * Draw the panel's flat development outline (cut perimeter + fold lines).
 * All other layers (cuts, materials, dimensions) are drawn on top.
 * Returns the projection helpers so the caller can place additional
 * geometry in the same coordinate space.
 */
function drawFlatBlank(
    doc: jsPDF,
    sectionExport: SectionedExport,
    dX: number,
    dY: number,
    scale: number,
    options: {
        outlineWeight?: number;
        foldDashWeight?: number;
        showFolds?: boolean;
        showDims?: boolean;
        dimFont?: number;
        /** Fill the panel face with this colour (the panel material colour). */
        fillColor?: [number, number, number];
    } = {},
): {
    px: (x: number) => number;
    py: (y: number) => number;
} {
    const showFolds = options.showFolds ?? true;
    const showDims = options.showDims ?? false;
    const outlineWeight = options.outlineWeight ?? 0.5;
    const foldDashWeight = options.foldDashWeight ?? 0.3;

    const px = (x: number) => dX + x * scale;
    const py = (y: number) => dY + y * scale;

    // Panel-material colour fill behind everything, so the drawing reads in the
    // real panel colour and retained islands (uncovered panel) show that colour.
    if (options.fillColor) {
        const [fr, fg, fb] = options.fillColor;
        doc.setFillColor(fr, fg, fb);
        sectionExport.sections.forEach((section) => {
            const ox = section.layoutOriginXMm;
            for (const seg of section.development.segments) {
                doc.rect(
                    px(seg.xMm + ox),
                    py(seg.yMm),
                    seg.wMm * scale,
                    seg.hMm * scale,
                    'F',
                );
            }
        });
    }

    // Per-section outer perimeter — one continuous polyline per section.
    sectionExport.sections.forEach((section) => {
        const ox = section.layoutOriginXMm;
        doc.setDrawColor(20);
        doc.setLineWidth(outlineWeight);
        const perimeter = outlinePerimeter(section.development);
        if (perimeter) {
            const pts = perimeter.points;
            for (let k = 0; k + 1 < pts.length; k++) {
                doc.line(
                    px(pts[k][0] + ox),
                    py(pts[k][1]),
                    px(pts[k + 1][0] + ox),
                    py(pts[k + 1][1]),
                );
            }
        } else {
            for (const seg of section.development.segments) {
                doc.rect(
                    px(seg.xMm + ox),
                    py(seg.yMm),
                    seg.wMm * scale,
                    seg.hMm * scale,
                );
            }
        }

        if (showFolds) {
            doc.setDrawColor(200, 0, 0);
            doc.setLineWidth(foldDashWeight);
            doc.setLineDashPattern([1.4, 1.0], 0);
            for (const f of section.development.foldLines) {
                doc.line(
                    px(f.x1 + ox),
                    py(f.y1),
                    px(f.x2 + ox),
                    py(f.y2),
                );
            }
            doc.setLineDashPattern([], 0);
        }
    });

    if (showDims) {
        const partW = sectionExport.totalLayoutWMm;
        const partH = sectionExport.totalLayoutHMm;
        const dimFont = options.dimFont ?? 9;
        const tick = 1.6;
        // Width dim under each section
        sectionExport.sections.forEach((section) => {
            const ox = section.layoutOriginXMm;
            dimH(
                doc,
                px(ox),
                px(ox + section.development.totalFlatWMm),
                py(section.development.totalFlatHMm) + 6,
                txt(
                    `${Math.round(section.development.totalFlatWMm)} mm`,
                ),
                dimFont,
                tick,
            );
        });
        dimV(
            doc,
            py(0),
            py(partH),
            px(0) - 6,
            txt(`${Math.round(partH)} mm`),
            dimFont,
            tick,
        );
        // Suppress unused warning for partW (used implicitly via section widths).
        void partW;
    }

    return { px, py };
}

function drawApertureCuts(
    doc: jsPDF,
    apertureBySection: FlatPath[][] | undefined,
    sectionExport: SectionedExport,
    px: (x: number) => number,
    py: (y: number) => number,
    color: [number, number, number],
    weight: number,
) {
    if (!apertureBySection) return;
    const sc = px(1) - px(0); // layout scale, for the white hole fill
    sectionExport.sections.forEach((_section, i) => {
        const list = apertureBySection[i] ?? [];
        // Holes are cut clean through the panel — fill them white first so they
        // read as removed material against the panel-colour fill, then stroke
        // the cut line on top.
        doc.setFillColor(255, 255, 255);
        for (const p of list) {
            if (!p.closed || p.points.length < 3) continue;
            const head = p.points[0];
            const tail = p.points[p.points.length - 1];
            const pts =
                Math.abs(tail[0] - head[0]) < 1e-6 &&
                Math.abs(tail[1] - head[1]) < 1e-6
                    ? p.points.slice(0, -1)
                    : p.points;
            if (pts.length < 3) continue;
            const deltas: number[][] = [];
            for (let k = 1; k < pts.length; k++) {
                deltas.push([pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]]);
            }
            doc.lines(deltas, px(pts[0][0]), py(pts[0][1]), [sc, sc], 'F', true);
        }
        doc.setDrawColor(color[0], color[1], color[2]);
        doc.setLineWidth(weight);
        for (const p of list) {
            for (let k = 0; k + 1 < p.points.length; k++) {
                doc.line(
                    px(p.points[k][0]),
                    py(p.points[k][1]),
                    px(p.points[k + 1][0]),
                    py(p.points[k + 1][1]),
                );
            }
        }
    });
}

function drawMaterialPiece(
    doc: jsPDF,
    piece: MaterialPiece | StandoffPiece,
    px: (x: number) => number,
    py: (y: number) => number,
    scale: number,
    fill: [number, number, number],
    stroke: [number, number, number],
    weight: number,
    style: 'F' | 'FD' | 'S',
    /** Colour a punched counter is filled with. Defaults to white (a clean
     * hole on a white page); pass the PANEL colour where the piece sits on the
     * panel, so the counter reveals the panel — matching the finished sign. */
    holeFill: [number, number, number] = [255, 255, 255],
) {
    if (piece.path.points.length < 3) return;
    doc.setFillColor(fill[0], fill[1], fill[2]);
    doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
    doc.setLineWidth(weight);
    // Compound path: outer + holes via doc.lines() with the page-fit
    // scale applied to the deltas. Without this the polyline is drawn
    // at 1:1 mm regardless of the page scale, which is the bug that
    // made standoff letters look huge on A4 material pages.
    const drawOne = (pts: Array<[number, number]>, sub: 'F' | 'FD' | 'S') => {
        if (pts.length < 2) return;
        const head = pts[0];
        const tail = pts[pts.length - 1];
        const ring =
            Math.abs(tail[0] - head[0]) < 1e-6 &&
                Math.abs(tail[1] - head[1]) < 1e-6
                ? pts.slice(0, -1)
                : pts;
        if (ring.length < 2) return;
        const deltas: number[][] = [];
        for (let i = 1; i < ring.length; i++) {
            deltas.push([
                ring[i][0] - ring[i - 1][0],
                ring[i][1] - ring[i - 1][1],
            ]);
        }
        doc.lines(
            deltas,
            px(ring[0][0]),
            py(ring[0][1]),
            [scale, scale],
            sub,
            true,
        );
    };
    drawOne(piece.path.points, style);
    if (piece.holes && piece.holes.length > 0) {
        // Counters filled with holeFill (panel colour where the piece sits on
        // the panel), and STROKED too (style 'FD', not 'F') so the cut outline
        // of every counter shows — otherwise a letter reads as a solid blob and
        // would be cut / plotted without its counters.
        doc.setFillColor(holeFill[0], holeFill[1], holeFill[2]);
        for (const h of piece.holes) {
            drawOne(h.points, style === 'S' ? 'S' : 'FD');
        }
        doc.setFillColor(fill[0], fill[1], fill[2]);
    }
}

/**
 * True when a full-colour printed-vinyl image is available to drop onto the
 * face. Gated on a single section: the raster is the WHOLE face, so it maps
 * 1:1 only when the sign isn't split across sheets (a split sign falls back to
 * flat vinyl fills, which already clip per section).
 */
function hasFullColourVinyl(opts: PdfOptions): boolean {
    return (
        !!opts.vinylPrintDataUrl &&
        !!opts.faceRectMm &&
        opts.sectionExport.sections.length === 1 &&
        (opts.vinylPieces ?? []).some((p) => p.fullColor)
    );
}

/**
 * Drop the printed-vinyl colour image onto the face via the page's px/py
 * mapping. Width/height derive from the mapping itself, so it works at any
 * scale (fit-to-page reference, 1:1 production). The PNG is pre-masked to the
 * vinyl shapes, so no clipping is needed — only the printed vinyl shows.
 */
function drawVinylPrintImage(
    doc: jsPDF,
    dataUrl: string,
    faceRect: { x: number; y: number; w: number; h: number },
    px: (x: number) => number,
    py: (y: number) => number,
): void {
    const x0 = px(faceRect.x);
    const y0 = py(faceRect.y);
    const w = px(faceRect.x + faceRect.w) - x0;
    const h = py(faceRect.y + faceRect.h) - y0;
    if (w <= 0 || h <= 0) return;
    doc.addImage(dataUrl, 'PNG', x0, y0, w, h, undefined, 'FAST');
}

/** Stroke a vinyl piece's outer + counter outlines as the contour cut line
 *  (no fill) — drawn over the colour print for print-&-cut. */
function drawVinylContour(
    doc: jsPDF,
    piece: MaterialPiece,
    px: (x: number) => number,
    py: (y: number) => number,
    weight: number,
): void {
    doc.setDrawColor(20, 20, 20);
    doc.setLineWidth(weight);
    for (const ring of [piece.path, ...(piece.holes ?? [])]) {
        if (!ring.closed || ring.points.length < 3) continue;
        const pts = ring.points.map(
            ([x, y]) => [px(x), py(y)] as [number, number],
        );
        drawClosedPolyline(doc, pts, 'S');
    }
}

interface MaterialPageSpec {
    kind:
        | 'cut'
        | 'vinyl'
        | 'acrylic'
        | 'solid'
        | 'standoff'
        | 'pushthrough'
        | 'backlight';
    label: string;
    color: [number, number, number];
    /** Brief specs for the right-side info strip. */
    specs: Array<[string, string]>;
    /** Per-section paths that belong to this material. */
    paths: FlatPath[];
    /** When true, this is a per-piece material — drawn as filled shapes. */
    pieces?: Array<MaterialPiece | StandoffPiece | PushThroughPiece>;
}

function buildMaterialPages(opts: PdfOptions): MaterialPageSpec[] {
    const pages: MaterialPageSpec[] = [];
    const apCount = (opts.apertureBySection ?? []).reduce(
        (a, arr) => a + arr.length,
        0,
    );
    if (apCount > 0) {
        const allPaths: FlatPath[] = [];
        for (const arr of opts.apertureBySection ?? []) allPaths.push(...arr);
        pages.push({
            kind: 'cut',
            label: 'Cut apertures',
            color: [30, 90, 200],
            specs: [
                ['Type', 'Cut from panel'],
                ['Count', `${apCount} aperture${apCount === 1 ? '' : 's'}`],
                ['Panel', panelColourSpec(opts.params)],
                [
                    'Stroke',
                    'Sent to the CAM cutter as the production output',
                ],
            ],
            paths: allPaths,
        });
    }
    // Group pieces by material so each material type gets ONE
    // consolidated page (rather than one page per letter). All
    // standoff pieces show on the standoff page, all vinyl pieces on
    // the vinyl page, etc. Specs summarise across pieces — if every
    // piece shares the same colour / thickness, show it once; if they
    // vary, list the distinct values.
    const summariseVariants = (values: string[]): string => {
        const uniq = Array.from(new Set(values));
        if (uniq.length === 0) return '-';
        if (uniq.length === 1) return uniq[0];
        return uniq.join(', ');
    };

    const vinylPieces = opts.vinylPieces ?? [];
    if (vinylPieces.length > 0) {
        const colours = vinylPieces.map((p) => p.color.toUpperCase());
        // Use the first piece's colour as the page accent; per-piece
        // colours still drive the drawing.
        const accent = hexToRgb(vinylPieces[0].color);
        const fc = hasFullColourVinyl(opts);
        pages.push({
            kind: 'vinyl',
            label: fc ? 'Vinyl — printed' : 'Vinyl appliqués',
            color: accent,
            specs: [
                [
                    'Type',
                    fc
                        ? 'Printed vinyl — full colour, print & cut'
                        : 'Vinyl appliqué — flat',
                ],
                [
                    'Pieces',
                    `${vinylPieces.length} piece${vinylPieces.length === 1 ? '' : 's'}`,
                ],
                [
                    'Colour',
                    fc
                        ? 'Full-colour digital print (gradients preserved)'
                        : summariseVariants(colours),
                ],
            ],
            paths: vinylPieces.flatMap((p) => [p.path, ...(p.holes ?? [])]),
            pieces: vinylPieces,
        });
    }

    const backlightPieces = opts.backlightPieces ?? [];
    if (backlightPieces.length > 0) {
        const colours = backlightPieces.map((p) => p.color.toUpperCase());
        const accent = hexToRgb(backlightPieces[0].color);
        pages.push({
            kind: 'backlight',
            label: 'Backlit apertures',
            color: accent,
            specs: [
                ['Type', 'Backlit aperture — panel cut, opal backing, LED-lit'],
                [
                    'Pieces',
                    `${backlightPieces.length} piece${backlightPieces.length === 1 ? '' : 's'}`,
                ],
                ['Glow', summariseVariants(colours)],
                ['Backing', 'Opal diffuser behind the cut; LEDs to suit'],
            ],
            paths: backlightPieces.flatMap((p) => [p.path, ...(p.holes ?? [])]),
            pieces: backlightPieces,
        });
    }

    const acrylicPieces = opts.acrylicPieces ?? [];
    if (acrylicPieces.length > 0) {
        const accent = hexToRgb(acrylicPieces[0].color);
        const colours = acrylicPieces.map((p) => p.color.toUpperCase());
        const thicknesses = acrylicPieces.map(
            (p) => `${(p.thicknessMm ?? 5)} mm`,
        );
        pages.push({
            kind: 'acrylic',
            label: 'Acrylic — face stuck',
            color: accent,
            specs: [
                ['Type', 'Acrylic — bonded to face'],
                [
                    'Pieces',
                    `${acrylicPieces.length} piece${acrylicPieces.length === 1 ? '' : 's'}`,
                ],
                ['Acrylic', acrylicNames(acrylicPieces.map((p) => p.color))],
                ['Colour', summariseVariants(colours)],
                ['Thickness', summariseVariants(thicknesses)],
            ],
            paths: acrylicPieces.flatMap((p) => [
                p.path,
                ...(p.holes ?? []),
            ]),
            pieces: acrylicPieces,
        });
    }

    const solidPieces = opts.solidPieces ?? [];
    if (solidPieces.length > 0) {
        const colours = solidPieces.map((p) => p.color.toUpperCase());
        const accent = hexToRgb(solidPieces[0].color);
        pages.push({
            kind: 'solid',
            label: 'Solid panel pieces',
            color: accent,
            specs: [
                ['Type', 'Solid — kept as part of the panel'],
                [
                    'Pieces',
                    `${solidPieces.length} piece${solidPieces.length === 1 ? '' : 's'}`,
                ],
                ['Colour', summariseVariants(colours)],
                [
                    'Note',
                    'Counter / floating areas left uncut — sit flush with the panel face',
                ],
            ],
            paths: solidPieces.flatMap((p) => [p.path, ...(p.holes ?? [])]),
            pieces: solidPieces,
        });
    }

    const pushThroughPieces = opts.pushThroughPieces ?? [];
    if (pushThroughPieces.length > 0) {
        const accent = hexToRgb(pushThroughPieces[0].color);
        const colours = pushThroughPieces.map((p) =>
            p.color.toUpperCase(),
        );
        const thicknesses = pushThroughPieces.map(
            (p) => `${p.thicknessMm} mm`,
        );
        const offsets = pushThroughPieces.map(
            (p) => `${p.keylineOffsetMm} mm`,
        );
        const counterCount = pushThroughPieces.reduce(
            (n, p) => n + (p.holes?.length ?? 0),
            0,
        );
        pages.push({
            kind: 'pushthrough',
            label: 'Push-through inserts',
            color: accent,
            specs: [
                ['Type', 'Push-through — acrylic pressed through panel'],
                [
                    'Pieces',
                    `${pushThroughPieces.length} letter${pushThroughPieces.length === 1 ? '' : 's'} + ${counterCount} counter${counterCount === 1 ? '' : 's'}`,
                ],
                ['Acrylic', acrylicNames(pushThroughPieces.map((p) => p.color))],
                ['Colour', summariseVariants(colours)],
                ['Thickness', summariseVariants(thicknesses)],
                ['Keyline offset', summariseVariants(offsets)],
                [
                    'Note',
                    'Outer letter + each counter cut as SEPARATE pieces; both glued to backing board behind panel',
                ],
            ],
            paths: pushThroughPieces.flatMap((p) => [
                p.path,
                ...(p.holes ?? []),
            ]),
            pieces: pushThroughPieces,
        });
    }

    const standoffPieces = opts.standoffPieces ?? [];
    if (standoffPieces.length > 0) {
        const accent = hexToRgb(standoffPieces[0].color);
        const colours = standoffPieces.map((p) => p.color.toUpperCase());
        const thicknesses = standoffPieces.map(
            (p) => `${p.thicknessMm} mm`,
        );
        const distances = standoffPieces.map(
            (p) => `${p.standoffDistanceMm} mm`,
        );
        // Stud spec — fixings the back-shop procures. Defaults derived
        // from the largest standoff distance + a 15 mm penetration
        // allowance into the substrate when the operator hasn't set
        // anything explicitly.
        const stud = opts.params.standoffStudSpec ?? {};
        const maxDistance = standoffPieces.reduce(
            (m, p) => Math.max(m, p.standoffDistanceMm),
            0,
        );
        const studThread = stud.thread ?? 'M8';
        const studLength =
            stud.lengthMm ?? Math.max(20, Math.round(maxDistance + 15));
        const studFinish = stud.finish ?? 'Stainless A2';
        const studSummary = `${studThread} × ${studLength} mm, ${studFinish}`;
        const studSupplier = stud.supplier;
        pages.push({
            kind: 'standoff',
            label: 'Stood-off lettering',
            color: accent,
            specs: [
                ['Type', 'Stood-off letterset'],
                [
                    'Pieces',
                    `${standoffPieces.length} letter${standoffPieces.length === 1 ? '' : 's'}`,
                ],
                ['Acrylic', acrylicNames(standoffPieces.map((p) => p.color))],
                ['Colour', summariseVariants(colours)],
                ['Thickness', summariseVariants(thicknesses)],
                ['Standoff', summariseVariants(distances)],
                ['Stud', studSummary],
                ...(studSupplier
                    ? ([['Supplier', studSupplier]] as Array<[string, string]>)
                    : []),
            ],
            paths: standoffPieces.flatMap((p) => [
                p.path,
                ...(p.holes ?? []),
            ]),
            pieces: standoffPieces,
        });
    }

    return pages;
}

function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    return [
        parseInt(h.substring(0, 2), 16),
        parseInt(h.substring(2, 4), 16),
        parseInt(h.substring(4, 6), 16),
    ];
}

function returnsLabelCompact(p: PanelParams): string {
    const on = (['top', 'bottom', 'left', 'right'] as const).filter(
        (e) => p.returns[e],
    );
    return on.length === 4
        ? 'All four edges'
        : on.length === 0
          ? 'None'
          : on.join(', ');
}

function drawOverviewPage(ctx: PageContext): void {
    const { doc, pageW, pageH, margin, params, opts } = ctx;
    const T = (s: string) => txt(s);
    drawHeaderBar(ctx, 'Overview — sign specification');

    const top = margin + 14;
    const colW = (pageW - margin * 2 - 8) / 2;

    // Left column: spec block. Stale rows ("Default for ungrouped",
    // "Materials in use") were dropped — the segmented control behind
    // the first is gone, and the dedicated materials table below is
    // the authoritative source for everything on the sign.
    const matLabel = params.materialLabel
        ? params.materialLabel.length > 30
            ? params.materialLabel.slice(0, 29) + '...'
            : params.materialLabel
        : '—';
    const apCount = (opts.apertureBySection ?? []).reduce(
        (a, arr) => a + arr.length,
        0,
    );
    const spec: Array<[string, string]> = [
        ['Sign face', `${params.panelWidthMm} × ${params.panelHeightMm} mm`],
        ['Returns', returnsLabelCompact(params)],
        ['Return depth', `${params.returnDepthMm} mm`],
        [
            'Shadow gap',
            params.shadowGapMm > 0 ? `${params.shadowGapMm} mm` : '—',
        ],
        ['Material', matLabel],
        ['Panel colour', panelColourSpec(params)],
        ['Thickness', `${params.materialThicknessMm} mm`],
        [
            'Sections',
            opts.sectionExport.sections.length > 1
                ? `${opts.sectionExport.sections.length} (centre full)`
                : 'Single panel',
        ],
        [
            'Flat blank',
            `${Math.round(opts.sectionExport.totalLayoutWMm)} × ${Math.round(opts.sectionExport.totalLayoutHMm)} mm`,
        ],
    ];

    doc.setFont(ctx.font, 'bold');
    doc.setFontSize(10);
    doc.text(T('SIGN SPECIFICATION'), margin, top);
    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(9);
    spec.forEach(([k, v], i) => {
        const y = top + 6 + i * 5.5;
        doc.setTextColor(120);
        doc.text(T(k), margin, y);
        doc.setTextColor(0);
        doc.text(T(v), margin + 36, y);
        // A colour chip next to the panel colour so the office/client can sanity-
        // check the RAL at a glance (the rest of the row is just the code+name).
        if (k === 'Panel colour' && params.panelColor) {
            const rgb = hexToRgb(params.panelColor);
            const vw = doc.getTextWidth(T(v));
            doc.setFillColor(rgb[0], rgb[1], rgb[2]);
            doc.setDrawColor(200);
            doc.setLineWidth(0.2);
            doc.rect(margin + 36 + vw + 2, y - 3, 4, 4, 'FD');
        }
    });

    // Right column: 3D thumbnail
    const thumbX = margin + colW + 8;
    const thumbTop = top;
    const thumbW = colW;
    const thumbH = colW * 0.55;
    if (opts.thumbnailDataUrl) {
        doc.setFont(ctx.font, 'bold');
        doc.setFontSize(10);
        doc.text(T('3D PREVIEW'), thumbX, thumbTop);
        try {
            doc.addImage(
                opts.thumbnailDataUrl,
                'PNG',
                thumbX,
                thumbTop + 4,
                thumbW,
                thumbH,
                undefined,
                'FAST',
            );
        } catch {
            /* thumbnail best-effort */
        }
        doc.setDrawColor(200);
        doc.setLineWidth(0.2);
        doc.rect(thumbX, thumbTop + 4, thumbW, thumbH);
    }

    // Companion-item callout — only on the main fascia's overview when the job
    // also has a projecting sign. States the relationship + mount once, where
    // the office/client reads it, so the rest of the document is unambiguous.
    let companionBottom = thumbTop + thumbH + 4;
    if (opts.companionNote) {
        const cy = thumbTop + thumbH + 9;
        const cH = 16;
        doc.setFillColor(232, 240, 243); // brand light
        doc.setDrawColor(BRAND_RGB[0], BRAND_RGB[1], BRAND_RGB[2]);
        doc.setLineWidth(0.3);
        doc.rect(thumbX, cy, thumbW, cH, 'FD');
        doc.setTextColor(BRAND_DARK_RGB[0], BRAND_DARK_RGB[1], BRAND_DARK_RGB[2]);
        doc.setFont(ctx.font, 'bold');
        doc.setFontSize(8.5);
        doc.text(T('ALSO IN THIS JOB'), thumbX + 3, cy + 5);
        doc.setFont(ctx.font, 'normal');
        doc.setFontSize(8);
        doc.text(T(opts.companionNote), thumbX + 3, cy + 10, {
            maxWidth: thumbW - 6,
        });
        doc.setTextColor(0);
        doc.setDrawColor(0);
        companionBottom = cy + cH;
    }

    // Materials table (bottom of page)
    const matY = Math.max(
        top + 6 + spec.length * 5.5 + 6,
        companionBottom + 10,
    );
    doc.setFont(ctx.font, 'bold');
    doc.setFontSize(10);
    doc.text(T('MATERIALS IN THIS SIGN'), margin, matY);
    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(8.5);
    const rows: Array<[string, string, string]> = [];
    if (apCount > 0) {
        rows.push([
            'Cut',
            `${apCount} aperture${apCount === 1 ? '' : 's'}`,
            'Production cut from panel face',
        ]);
    }
    for (const v of opts.vinylPieces ?? [])
        rows.push(['Vinyl', v.color.toUpperCase(), 'Flat appliqué']);
    for (const a of opts.acrylicPieces ?? [])
        rows.push([
            'Acrylic',
            `${(a.thicknessMm ?? 5)} mm ${a.color.toUpperCase()}`,
            'Face-stuck',
        ]);
    for (const sol of opts.solidPieces ?? [])
        rows.push([
            'Solid',
            sol.color.toUpperCase(),
            'Kept as part of the panel face',
        ]);
    for (const s of opts.standoffPieces ?? [])
        rows.push([
            'Stood off',
            `${s.thicknessMm} mm ${s.color.toUpperCase()}`,
            `${s.standoffDistanceMm} mm offset`,
        ]);
    for (const pt of opts.pushThroughPieces ?? [])
        rows.push([
            'Push through',
            `${pt.thicknessMm} mm ${pt.color.toUpperCase()}`,
            `${pt.keylineOffsetMm} mm keyline · ${(pt.holes?.length ?? 0)} counter${(pt.holes?.length ?? 0) === 1 ? '' : 's'}`,
        ]);

    if (rows.length === 0) {
        doc.setTextColor(140);
        doc.text(
            T('Panel-only sign — no SVG artwork applied.'),
            margin,
            matY + 6,
        );
        doc.setTextColor(0);
    } else {
        const headerY = matY + 5;
        doc.setDrawColor(220);
        doc.setLineWidth(0.2);
        doc.line(margin, headerY + 1.5, pageW - margin, headerY + 1.5);
        doc.setTextColor(110);
        doc.text(T('Material'), margin, headerY);
        doc.text(T('Spec'), margin + 50, headerY);
        doc.text(T('Notes'), margin + 130, headerY);
        doc.setTextColor(0);
        rows.forEach((r, i) => {
            const y = headerY + 6 + i * 5;
            if (y > pageH - margin - 36) return; // truncate to leave room for legend / rev / QR
            doc.text(T(r[0]), margin, y);
            doc.text(T(r[1]), margin + 50, y);
            doc.text(T(r[2]), margin + 130, y);
        });
    }

    // ---- Bottom-of-page metadata strip --------------------------------
    // Three blocks: legend (left), revision/approval (right of legend),
    // QR-back-to-design (corner). Sit just above the page footer.
    const stripY = pageH - margin - 24;

    // Legend — explains the line-style vocabulary the rest of the
    // drawing uses. Keyed to the same colours / patterns drawn on
    // the per-material pages and the placement template.
    doc.setFont(ctx.font, 'bold');
    doc.setFontSize(8.5);
    doc.text(T('LEGEND'), margin, stripY);
    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(7.5);
    // Conditional key — only the path types this design actually uses, with
    // explicit CUT vs RETAIN vs NOT-CUT instructions so production can never
    // misread a counter / island / stood-off footprint. Applies to every
    // letter and any subtext (the same path types repeat across them all).
    const panelRgb = hexToRgb(opts.params.panelColor ?? '#d6d6d6');
    const swatch =
        (fill: [number, number, number], stroke: [number, number, number]) =>
        (x: number, y: number) => {
            doc.setFillColor(fill[0], fill[1], fill[2]);
            doc.setDrawColor(stroke[0], stroke[1], stroke[2]);
            doc.setLineWidth(0.3);
            doc.rect(x, y - 2.2, 9, 4.4, 'FD');
        };
    const hasAperture = (opts.apertureBySection ?? []).some((a) => a.length > 0);
    const hasPush =
        (opts.pushThroughKeylineBySection ?? []).some((a) => a.length > 0) ||
        (opts.pushThroughPieces?.length ?? 0) > 0;
    const hasIslands = (opts.pushThroughIslandsBySection ?? []).some(
        (a) => a.length > 0,
    );
    const hasSolid = (opts.solidPieces?.length ?? 0) > 0;
    const hasStandoff = (opts.standoffPieces?.length ?? 0) > 0;
    const legendItems: Array<{
        draw: (x: number, y: number) => void;
        label: string;
    }> = [];
    legendItems.push({
        label: 'Fold line (bend, not a cut)',
        draw: (x, y) => {
            doc.setDrawColor(200, 0, 0);
            doc.setLineWidth(0.3);
            doc.setLineDashPattern([1.4, 1.0], 0);
            doc.line(x, y, x + 9, y);
            doc.setLineDashPattern([], 0);
        },
    });
    legendItems.push({
        label: 'Cut line — perimeter',
        draw: (x, y) => {
            doc.setDrawColor(20);
            doc.setLineWidth(0.5);
            doc.line(x, y, x + 9, y);
        },
    });
    if (hasAperture || hasPush) {
        legendItems.push({
            label: hasPush
                ? 'Cut line — aperture / keyline (hole cut through the panel)'
                : 'Cut line — aperture (hole cut through the panel)',
            draw: (x, y) => {
                doc.setDrawColor(30, 90, 200);
                doc.setLineWidth(0.5);
                doc.line(x, y, x + 9, y);
            },
        });
    }
    if (hasIslands) {
        legendItems.push({
            label: 'Retained metal island — KEEP this panel piece; keyline cut rings it; remount on backing (do NOT discard)',
            draw: swatch(panelRgb, [0, 150, 170]),
        });
    }
    if (hasSolid) {
        legendItems.push({
            label: 'Retained panel piece — stays as panel material, NOT a cut-out',
            draw: swatch(panelRgb, [90, 90, 90]),
        });
    }
    if (hasStandoff) {
        legendItems.push({
            label: 'Stood-off lettering — fabricated separately, NOT cut from this panel',
            draw: (x, y) => {
                doc.setDrawColor(60, 60, 60);
                doc.setLineWidth(0.35);
                doc.setLineDashPattern([1.2, 0.8], 0);
                doc.rect(x, y - 2.2, 9, 4.4, 'S');
                doc.setLineDashPattern([], 0);
            },
        });
    }
    legendItems.forEach((item, i) => {
        const y = stripY + 4 + i * 3.6;
        item.draw(margin, y);
        doc.setDrawColor(0);
        doc.setTextColor(80);
        doc.text(T(item.label), margin + 13, y + 1.2);
    });
    doc.setTextColor(0);

    // Revision / approval block — bottom-right above the QR.
    const revX = pageW - margin - 90;
    doc.setFont(ctx.font, 'bold');
    doc.setFontSize(8.5);
    doc.text(T('REVISION & APPROVAL'), revX, stripY);
    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(8);
    const today = new Date().toLocaleDateString('en-GB');
    const drawnBy = opts.drawnBy || '—';
    const revRows: Array<[string, string]> = [
        ['Rev', '01'],
        ['Drawn by', drawnBy],
        ['Date', today],
        ['Approved', '_____________________'],
    ];
    revRows.forEach(([k, v], i) => {
        const y = stripY + 4 + i * 4;
        doc.setTextColor(120);
        doc.text(T(k), revX, y);
        doc.setTextColor(0);
        doc.text(T(v), revX + 20, y);
    });

    drawCornerQr(doc, {
        pageW,
        pageH,
        margin,
        qrDataUrl: ctx.qrDataUrl,
        font: ctx.font,
    });
}

function drawFlatLayoutPage(ctx: PageContext): void {
    const { doc, pageW, pageH, margin, params, opts } = ctx;
    const T = (s: string) => txt(s);
    drawHeaderBar(ctx, 'Flat development — cutting layout');

    const drawTop = margin + 18;
    const drawW = pageW - margin * 2;
    const drawH = pageH - drawTop - margin - 10;
    const partW = Math.max(1, opts.sectionExport.totalLayoutWMm);
    const partH = Math.max(1, opts.sectionExport.totalLayoutHMm);
    const scale = fitScale(drawW - 18, drawH - 8, partW, partH);
    const dX = margin + (drawW - partW * scale) / 2;
    const dY = drawTop;

    // Panel face filled in the panel colour (so the layout reads in the real
    // material colour + retained islands show as that colour), then perimeter,
    // folds + dims on top. panelRgb is reused as the counter fill for every
    // face material so each counter reveals the panel — continuity with the
    // finished sign.
    const panelRgb = hexToRgb(params.panelColor ?? '#d6d6d6');
    const { px, py } = drawFlatBlank(doc, opts.sectionExport, dX, dY, scale, {
        outlineWeight: 0.4 * Math.max(1, scale),
        showFolds: true,
        showDims: true,
        dimFont: Math.max(8, Math.min(14, scale * 4)),
        fillColor: panelRgb,
    });

    // Aperture cuts (dark blue)
    drawApertureCuts(
        doc,
        opts.apertureBySection,
        opts.sectionExport,
        px,
        py,
        [30, 90, 200],
        0.3 * Math.max(1, scale),
    );

    // Material pieces — drawn filled with their colour; counters reveal the
    // panel (holeFill = panelRgb) for continuity with the finished sign.
    for (const p of opts.vinylPieces ?? []) {
        drawMaterialPiece(
            doc,
            p,
            px,
            py,
            scale,
            hexToRgb(p.color),
            [40, 40, 40],
            0.15,
            'FD',
            panelRgb,
        );
    }
    for (const p of opts.acrylicPieces ?? []) {
        drawMaterialPiece(
            doc,
            p,
            px,
            py,
            scale,
            hexToRgb(p.color),
            [20, 20, 20],
            0.4,
            'FD',
            panelRgb,
        );
    }
    // Solid pieces — floating bits of letters / panel that stay as
    // panel material. Drawn filled in the (panel-matching) colour, with
    // a light stroke so the operator can still see them on the layout.
    for (const p of opts.solidPieces ?? []) {
        drawMaterialPiece(
            doc,
            p,
            px,
            py,
            scale,
            hexToRgb(p.color),
            [60, 60, 60],
            0.15,
            'FD',
            panelRgb,
        );
    }
    // Push-through inserts — acrylic DONUT: outer letter filled in its real
    // colour, counter filled with the PANEL colour (the retained metal island
    // shows through the acrylic counter — so the island reads as the panel, not
    // a white hole or a dark blob). Drawn before standoff so dashed standoff
    // outlines overlay cleanly.
    {
        const panelRgb = hexToRgb(params.panelColor ?? '#d6d6d6');
        for (const p of opts.pushThroughPieces ?? []) {
            const fillRgb = hexToRgb(p.color);
            const drawShape = (
                ring: FlatPath,
                fill: [number, number, number],
            ) => {
                if (!ring.closed || ring.points.length < 3) return;
                drawMaterialPiece(
                    doc,
                    {
                        pathIndex: -1,
                        path: ring,
                        color: p.color,
                    },
                    px,
                    py,
                    scale,
                    fill,
                    [20, 20, 20],
                    0.3,
                    'FD',
                );
            };
            drawShape(p.path, fillRgb);
            for (const h of p.holes ?? []) drawShape(h, panelRgb);
        }
    }

    // Retained metal islands — the counter centre that STAYS as panel metal.
    // Drawn as just the teal keyline-CUT RING around the (white) counter — NO
    // fill, so the island keeps its natural colour and is never a solid dark
    // blob that reads as "something it isn't". The ring + the legend entry are
    // what say "retained island, keyline gap rings it".
    {
        for (const arr of opts.pushThroughIslandsBySection ?? []) {
            for (const isl of arr) {
                if (!isl.closed || isl.points.length < 3) continue;
                drawMaterialPiece(
                    doc,
                    {
                        pathIndex: -1,
                        path: isl,
                        color: params.panelColor ?? '#d6d6d6',
                    },
                    px,
                    py,
                    scale,
                    [0, 0, 0], // unused (stroke-only)
                    [0, 150, 170], // teal = the keyline cut around the island
                    0.4,
                    'S',
                );
            }
        }
    }

    // Standoff pieces — filled in their real colour (counters reveal the panel
    // behind) so the body reads as the part to cut, not just an outline, then a
    // DASHED dark outline on top to keep the "sits OFF the panel" cue that the
    // flush face-stuck pieces don't carry.
    for (const p of opts.standoffPieces ?? []) {
        drawMaterialPiece(
            doc,
            p,
            px,
            py,
            scale,
            hexToRgb(p.color),
            [60, 60, 60],
            0.15,
            'F',
            panelRgb,
        );
        doc.setDrawColor(60, 60, 60);
        doc.setLineWidth(0.35);
        doc.setLineDashPattern([1.2, 0.8], 0);
        for (const ring of [p.path, ...(p.holes ?? [])]) {
            const pl = pathDPolyline(ring.points, ring.closed);
            if (pl) {
                doc.lines(
                    pl.deltas,
                    px(pl.start[0]),
                    py(pl.start[1]),
                    [scale, scale],
                    'S',
                    ring.closed,
                );
            }
        }
        doc.setLineDashPattern([], 0);
    }

    // Fixings (filled blue dots)
    for (const arr of opts.fixingsBySection ?? []) {
        doc.setFillColor(30, 90, 200);
        doc.setDrawColor(30, 90, 200);
        for (const f of arr) {
            if (f.points.length < 3) continue;
            let cx = 0;
            let cy = 0;
            for (const q of f.points) {
                cx += q[0];
                cy += q[1];
            }
            cx /= f.points.length;
            cy /= f.points.length;
            let rMm = 0;
            for (const q of f.points)
                rMm += Math.hypot(q[0] - cx, q[1] - cy);
            rMm /= f.points.length;
            doc.circle(px(cx), py(cy), rMm * scale, 'FD');
        }
    }

    // Section labels
    if (opts.sectionExport.sections.length > 1) {
        doc.setFont(ctx.font, 'bold');
        doc.setFontSize(Math.max(9, scale * 4));
        doc.setTextColor(80);
        opts.sectionExport.sections.forEach((section) => {
            const sFace = section.development.segments.find(
                (s) => s.role === 'face',
            );
            if (!sFace) return;
            const ox = section.layoutOriginXMm;
            doc.text(
                T(
                    `SECTION ${section.index + 1}/${section.count} - ${Math.round(section.sectionWidthMm)} mm`,
                ),
                px(sFace.xMm + sFace.wMm / 2 + ox),
                py(sFace.yMm + sFace.hMm / 2),
                { align: 'center' },
            );
        });
        doc.setTextColor(0);
    }

    // Footer note
    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(
        T(
            `Scale 1:${scale < 1 ? Math.round(1 / scale) : '1'}  ·  Blank ${Math.round(partW)} × ${Math.round(partH)} mm  ·  Bend allowance: ${params.materialThicknessMm / 2} mm per side of every fold`,
        ),
        margin,
        pageH - margin + 4,
    );
    doc.setTextColor(0);
    drawCornerQr(doc, {
        pageW,
        pageH,
        margin,
        qrDataUrl: ctx.qrDataUrl,
        font: ctx.font,
    });
}

/**
 * Vinyl page — drawn on ONE continuous face, never split by the panel seams.
 *
 * Vinyl is applied as a single appliqué across the assembled sign, so splitting
 * it into the section blanks (which sit at gap-offset origins) throws off the
 * scale + centring of the artwork (the design ends up compressed with a gap on
 * one side). Here we draw the full face continuously and overlay the seam(s)
 * for reference. The vinyl pieces + faceRect share the development frame, so a
 * single linear projection places everything correctly; full-colour printed
 * vinyl now renders for split signs too (it couldn't before, because the
 * sectioned layout had nowhere coherent to drop the raster).
 */
function drawVinylFacePage(
    ctx: PageContext,
    spec: MaterialPageSpec,
    faceRect: { x: number; y: number; w: number; h: number },
): void {
    const { doc, pageW, pageH, margin, opts } = ctx;
    const panelRgb = hexToRgb(opts.params.panelColor ?? '#d6d6d6');

    const specW = 76;
    const specX = pageW - margin - specW;
    const drawTop = margin + 18;
    const drawW = specX - margin - 8;
    const drawH = pageH - drawTop - margin - 10;
    const scale = fitScale(drawW - 6, drawH - 8, faceRect.w, faceRect.h);
    const dX = margin + (drawW - faceRect.w * scale) / 2;
    const dY = drawTop;
    const px = (x: number) => dX + (x - faceRect.x) * scale;
    const py = (y: number) => dY + (y - faceRect.y) * scale;

    // Faded continuous face outline.
    doc.setDrawColor(150);
    doc.setLineWidth(0.3);
    doc.rect(px(faceRect.x), py(faceRect.y), faceRect.w * scale, faceRect.h * scale, 'S');

    // Full-colour print (masked to the vinyl shapes) when available, else flat
    // fills below.
    const vinylFC = !!opts.vinylPrintDataUrl;
    if (vinylFC && opts.vinylPrintDataUrl) {
        drawVinylPrintImage(doc, opts.vinylPrintDataUrl, faceRect, px, py);
    }
    for (const piece of spec.pieces ?? []) {
        if (vinylFC && (piece as MaterialPiece).fullColor && 'path' in piece) {
            drawVinylContour(doc, piece as MaterialPiece, px, py, 0.3);
        } else {
            drawMaterialPiece(
                doc,
                piece,
                px,
                py,
                scale,
                hexToRgb((piece as MaterialPiece).color),
                [20, 20, 20],
                0.4,
                'FD',
                panelRgb,
            );
        }
    }

    // Seam line(s) where the panels split — dashed, labelled, for reference
    // (the vinyl crosses them unbroken).
    const sections = opts.sectionExport.sections;
    if (sections.length > 1) {
        doc.setDrawColor(120);
        doc.setLineWidth(0.35);
        doc.setLineDashPattern([2, 1.4], 0);
        for (let i = 1; i < sections.length; i++) {
            const seamX = faceRect.x + sections[i].faceSliceXMm;
            doc.line(px(seamX), py(faceRect.y), px(seamX), py(faceRect.y + faceRect.h));
        }
        doc.setLineDashPattern([], 0);
        doc.setFont(ctx.font, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(120);
        doc.text(
            txt('panel seam'),
            px(faceRect.x + sections[1].faceSliceXMm) + 1,
            py(faceRect.y) + 4,
        );
        doc.setTextColor(0);
    }

    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(
        txt(
            'Vinyl is one continuous appliqué across the assembled sign — seam shown for reference only.',
        ),
        margin,
        pageH - margin + 4,
    );
    doc.setTextColor(0);
    drawCornerQr(doc, {
        pageW,
        pageH,
        margin,
        qrDataUrl: ctx.qrDataUrl,
        font: ctx.font,
    });
}

function drawMaterialPage(ctx: PageContext, spec: MaterialPageSpec): void {
    const { doc, pageW, pageH, margin, opts } = ctx;
    const T = (s: string) => txt(s);
    drawHeaderBar(ctx, `${spec.label}`);
    // Counters of face materials reveal the panel — fill them the panel colour
    // for continuity with the finished sign.
    const panelRgb = hexToRgb(opts.params.panelColor ?? '#d6d6d6');

    // Specs strip on the right
    const specW = 76;
    const specX = pageW - margin - specW;
    const specY = margin + 14;
    doc.setFont(ctx.font, 'bold');
    doc.setFontSize(10);
    doc.text(T('MATERIAL'), specX, specY);
    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(9);
    // Colour swatch
    doc.setFillColor(spec.color[0], spec.color[1], spec.color[2]);
    doc.rect(specX, specY + 3, 8, 8, 'F');
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.rect(specX, specY + 3, 8, 8, 'S');
    doc.text(T(spec.label), specX + 10, specY + 8.5);

    let rowY = specY + 18;
    doc.setFontSize(8.5);
    // Value column wraps within the specs strip so long notes (e.g. the CAM
    // "Stroke" description) never run off the right edge of the page.
    const valueX = specX + 24;
    const valueW = specX + specW - valueX;
    spec.specs.forEach(([k, v]) => {
        doc.setTextColor(120);
        doc.text(T(k), specX, rowY);
        doc.setTextColor(0);
        const lines = doc.splitTextToSize(T(v), valueW) as string[];
        doc.text(lines, valueX, rowY);
        rowY += Math.max(1, lines.length) * 4.4 + 1;
    });

    // Vinyl is one continuous appliqué — never split by the panel seams. For a
    // SPLIT sign, draw the face whole (with the seams marked) so the artwork
    // keeps its scale + centring, instead of being chopped across the sectioned
    // blanks. Single-panel signs already render continuously, so leave them be.
    if (
        spec.kind === 'vinyl' &&
        opts.faceRectMm &&
        opts.sectionExport.sections.length > 1
    ) {
        drawVinylFacePage(ctx, spec, opts.faceRectMm);
        return;
    }

    // Drawing area — left of the specs strip
    const drawTop = margin + 18;
    const drawW = specX - margin - 8;
    const drawH = pageH - drawTop - margin - 10;
    const partW = Math.max(1, opts.sectionExport.totalLayoutWMm);
    const partH = Math.max(1, opts.sectionExport.totalLayoutHMm);
    const scale = fitScale(drawW - 6, drawH - 8, partW, partH);
    const dX = margin + (drawW - partW * scale) / 2;
    const dY = drawTop;

    // Faded panel outline + folds (so the operator sees the sign shape
    // without the focused material being lost in detail).
    const { px, py } = drawFlatBlank(doc, opts.sectionExport, dX, dY, scale, {
        outlineWeight: 0.3,
        showFolds: false,
        showDims: false,
    });

    // Each material page shows ONLY its own material (filled solid below) plus
    // the faded panel outline + section labels drawn above. We deliberately do
    // NOT ghost the other materials here: a faint outline of, say, a vinyl
    // decal on the "Cut apertures" page reads as "cut this too", which is
    // exactly the misread we want to avoid. The panel outline alone gives
    // enough spatial context. `apAll` is reused by the cut page below.
    const apAll = (opts.apertureBySection ?? []).flatMap((a) => a);

    // THIS material — drawn boldly. Multiple pieces of the same
    // material share one page, each drawn with its own colour /
    // thickness if they differ.
    if (spec.kind === 'cut') {
        doc.setDrawColor(spec.color[0], spec.color[1], spec.color[2]);
        doc.setLineWidth(0.5);
        for (const p of apAll) {
            for (let k = 0; k + 1 < p.points.length; k++) {
                doc.line(
                    px(p.points[k][0]),
                    py(p.points[k][1]),
                    px(p.points[k + 1][0]),
                    py(p.points[k + 1][1]),
                );
            }
        }
        // Overlay inner-counter "solid" islands inside the cut. The
        // production PDF emits these as compound shapes so the cutter
        // leaves them as panel material — surfacing the same boundary
        // here makes the reference drawing match the actual cut.
        const solids = opts.solidPieces ?? [];
        if (solids.length > 0) {
            const panelColor = opts.params.panelColor ?? '#d6d6d6';
            for (const piece of solids) {
                const fillRgb = hexToRgb(piece.color || panelColor);
                const usePanel =
                    fillRgb[0] === panelRgb[0] &&
                    fillRgb[1] === panelRgb[1] &&
                    fillRgb[2] === panelRgb[2];
                drawMaterialPiece(
                    doc,
                    piece,
                    px,
                    py,
                    scale,
                    usePanel ? panelRgb : fillRgb,
                    [80, 80, 80],
                    0.25,
                    'FD',
                    panelRgb,
                );
            }
        }
    } else if (spec.pieces) {
        // Printed full-colour vinyl: drop the real artwork (colours +
        // gradients) onto the face once, masked to the vinyl shapes. Each
        // full-colour piece then gets just its contour cut line on top
        // (print-&-cut); solid-colour vinyl pieces still flat-fill below.
        const vinylFC =
            spec.kind === 'vinyl' &&
            hasFullColourVinyl(opts) &&
            !!opts.vinylPrintDataUrl &&
            !!opts.faceRectMm;
        if (vinylFC && opts.vinylPrintDataUrl && opts.faceRectMm) {
            drawVinylPrintImage(
                doc,
                opts.vinylPrintDataUrl,
                opts.faceRectMm,
                px,
                py,
            );
        }
        for (const piece of spec.pieces) {
            const fillForPiece = hexToRgb(piece.color);
            const strokeRgb: [number, number, number] = [20, 20, 20];
            if (
                vinylFC &&
                (piece as MaterialPiece).fullColor &&
                'path' in piece
            ) {
                drawVinylContour(
                    doc,
                    piece as MaterialPiece,
                    px,
                    py,
                    0.3,
                );
            } else if (spec.kind === 'standoff') {
                // Stood-off letters filled in their real colour (counters
                // punched white) so the whole body reads as the part to
                // cut, not just an outline — same intent as the acrylic
                // pages. This dedicated page's title already flags that
                // the letters sit OFF the panel, so no dashed cue here.
                drawMaterialPiece(
                    doc,
                    piece,
                    px,
                    py,
                    scale,
                    fillForPiece,
                    strokeRgb,
                    0.4,
                    'FD',
                    panelRgb,
                );
            } else if (spec.kind === 'pushthrough') {
                // Acrylic DONUT: outer letter filled in its real colour,
                // counter filled with the PANEL colour (the retained metal
                // island shows through it — see the panel-cut page). Both edges
                // keep a cut stroke. Mirrors the production insert page so the
                // two documents never disagree on what's acrylic vs island.
                doc.setDrawColor(strokeRgb[0], strokeRgb[1], strokeRgb[2]);
                doc.setLineWidth(0.35);
                const drawShape = (
                    ring: FlatPath,
                    fill: [number, number, number],
                ) => {
                    if (!ring.closed || ring.points.length < 3) return;
                    const head = ring.points[0];
                    const tail = ring.points[ring.points.length - 1];
                    const pts =
                        Math.abs(tail[0] - head[0]) < 1e-6 &&
                            Math.abs(tail[1] - head[1]) < 1e-6
                            ? ring.points.slice(0, -1)
                            : ring.points;
                    if (pts.length < 2) return;
                    const deltas: number[][] = [];
                    for (let k = 1; k < pts.length; k++) {
                        deltas.push([
                            pts[k][0] - pts[k - 1][0],
                            pts[k][1] - pts[k - 1][1],
                        ]);
                    }
                    doc.setFillColor(fill[0], fill[1], fill[2]);
                    doc.lines(
                        deltas,
                        px(pts[0][0]),
                        py(pts[0][1]),
                        [scale, scale],
                        'FD',
                        true,
                    );
                };
                drawShape(piece.path, fillForPiece);
                for (const h of piece.holes ?? []) drawShape(h, panelRgb);
            } else {
                drawMaterialPiece(
                    doc,
                    piece,
                    px,
                    py,
                    scale,
                    fillForPiece,
                    strokeRgb,
                    0.3,
                    'FD',
                    panelRgb,
                );
            }
        }
    }

    // Footer
    doc.setFont(ctx.font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(
        T(
            `This page shows the ${spec.label} only.  ·  Scale 1:${scale < 1 ? Math.round(1 / scale) : '1'}`,
        ),
        margin,
        pageH - margin + 4,
    );
    doc.setTextColor(0);
    drawCornerQr(doc, {
        pageW,
        pageH,
        margin,
        qrDataUrl: ctx.qrDataUrl,
        font: ctx.font,
    });
}

export async function generateReferencePdfBlob(
    opts: PdfOptions,
): Promise<Blob> {
    const PAGE_W = 297;
    const PAGE_H = 210;
    const margin = 14;
    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
    });
    const fontRes = await registerVisualiserFonts(doc);
    const font = fontRes.family;
    const qrDataUrl = await buildQrCode(opts.designId ?? null);
    doc.setProperties({
        title: `${opts.params.name} — reference drawing`,
        subject: 'Reference PDF — dimensioned shop drawing',
        author: opts.drawnBy ?? 'Onesign Odysseus',
        keywords: 'reference, drawing, signage, onesign',
    });

    // One item (main fascia) or two (fascia + projecting sign). Each item gets
    // the SAME page set — overview, flat layout, one page per material — so the
    // reader scans them identically; every page is labelled with the item name.
    const items: PdfOptions[] = [
        opts,
        ...(opts.secondary ? [opts.secondary] : []),
    ];
    const itemMaterialPages = items.map((it) => buildMaterialPages(it));
    const nestPageCount = (opts.embeddedNests ?? []).reduce(
        (n, x) => n + x.sheets.length,
        0,
    );
    const totalPages =
        items.reduce((n, _it, i) => n + 2 + itemMaterialPages[i].length, 0) +
        nestPageCount;

    let pageNumber = 0;
    let firstPage = true;
    const newCtx = (itemOpts: PdfOptions, itemLabel?: string): PageContext => {
        if (!firstPage) doc.addPage('a4', 'landscape');
        firstPage = false;
        pageNumber += 1;
        return {
            doc,
            pageW: PAGE_W,
            pageH: PAGE_H,
            margin,
            params: itemOpts.params,
            opts: itemOpts,
            pageNumber,
            totalPages,
            font,
            qrDataUrl,
            itemLabel,
        };
    };

    items.forEach((it, i) => {
        const itemLabel =
            items.length > 1
                ? (it.itemLabel ?? (i === 0 ? 'Main fascia' : 'Projecting sign'))
                : undefined;
        // Page 1 — Overview (the main item's overview also carries the
        // companion note describing the other item + its mount)
        drawOverviewPage(newCtx(it, itemLabel));
        // Page 2 — Flat cutting layout
        drawFlatLayoutPage(newCtx(it, itemLabel));
        // Pages 3+ — one per material group
        for (const page of itemMaterialPages[i]) {
            drawMaterialPage(newCtx(it, itemLabel), page);
        }
    });

    // Nest pages (per design) — after the items, each saved sheet fitted to the
    // page, so the reference doc carries the actual cut nests too.
    for (const nest of opts.embeddedNests ?? []) {
        nest.sheets.forEach((sheet, si) => {
            drawNestSheetPageRef(
                newCtx(opts),
                nest,
                sheet,
                si + 1,
                nest.sheets.length,
            );
        });
    }

    return doc.output('blob');
}

/**
 * PRODUCTION PDF — cut-only, welded perimeters, hairline stroke.
 *
 * Per-section layout is preserved (split signs stay split — never weld
 * sections together). Each section gets its own continuous outer cut
 * contour + closed aperture / keyline paths + fixing circles. No folds,
 * no dimensions, no labels, no legends. A tiny single-line info strip
 * sits below the cut area so the operator can sanity-check the file
 * without it interfering with the geometry.
 */
/**
 * Production PDF — multi-page CAM bundle at 1:1.
 *
 * Design:
 *   - Every page is the SAME sheet size (the largest required for any
 *     individual page's content). Office printers stop silently
 *     mis-scaling; a stack of printouts off the plotter is one paper
 *     size.
 *   - Brand-teal strap across the top of every page (kind=production,
 *     darker variant) so the bundle is impossible to confuse with the
 *     reference PDF at arm's length.
 *   - QR code in the bottom-right of every page deep-links back to
 *     /admin/visualiser?id=<designId>. "PRINT AT 100% — DO NOT SCALE"
 *     warning in the footer.
 *   - Each page's content is horizontally centred inside the sheet
 *     and top-aligned below the strap, so the operator's eye lands in
 *     the same place every page.
 *   - A thin border 2 mm inside the sheet edge gives the operator a
 *     known-dimension target to measure for a quick scale sanity check.
 */
export async function generateProductionPdfBlob(
    opts: PdfOptions,
): Promise<Blob> {
    const { sectionExport, params } = opts;

    // ---- Phase 1: build the list of pages to emit ------------------
    // Every page job knows its content bbox + how to draw itself at a
    // given (dX, dY) origin. Emission order is fixed: panel cut →
    // push-through → acrylic → vinyl → standoff → placement template.
    // Each is conditional on its data existing.

    type ProdPageJob = {
        /** Short label shown in the page subtitle line. */
        subtitle: string;
        /** Content width in mm. */
        partW: number;
        /** Content height in mm. */
        partH: number;
        /** Lines for the footer info strip (left of the QR). */
        footerInfo: string[];
        /** Draws the content using the supplied (dX, dY) top-left. */
        draw: (dX: number, dY: number) => void;
    };

    const today = new Date().toLocaleDateString('en-GB');

    // Build the page jobs for ONE item (panel). Run once for the main fascia
    // and again for the projecting sign when present, so a two-item job emits
    // both items' cut sheets in one document. The body below is the original
    // single-panel logic verbatim — `opts`/`params`/`sectionExport` here alias
    // the item passed in, so each call produces that item's sheets.
    const buildJobs = (src: PdfOptions): ProdPageJob[] => {
        const opts = src;
        const params = src.params;
        const sectionExport = src.sectionExport;
        const itemLabel = src.itemLabel ?? null;
        const jobs: ProdPageJob[] = [];

    // Hairline stroke that scales mildly with part size, capped well
    // below any sensible kerf so no CAM interpretation widens the cut.
    const layoutW = Math.max(1, sectionExport.totalLayoutWMm);
    const layoutH = Math.max(1, sectionExport.totalLayoutHMm);
    const productionStroke = Math.max(
        0.05,
        Math.min(0.2, Math.max(layoutW, layoutH) / 5000),
    );

    // Counter-survival check — when aperture counters exist AND no
    // section carries a global keyline, the counters can't survive
    // the panel-only cut (they fall out with the letter-piece during
    // fabrication). The in-app banner warns about this, but once the
    // PDF leaves the building the warning is lost — so stamp it on
    // the page too, in the operator's face. Push-through groups carry
    // their counters as separate insert pieces, so don't count those.
    const apertureCounterCount = (opts.apertureHolesBySection ?? [])
        .flat()
        .filter((p) => p.closed && p.points.length >= 3).length;
    const hasAnyKeyline = (opts.keylineBySection ?? []).some(
        (arr) => arr.length > 0,
    );
    const counterSurvivalWarning =
        apertureCounterCount > 0 && !hasAnyKeyline
            ? `WARNING: ${apertureCounterCount} letter counter${apertureCounterCount === 1 ? '' : 's'} cannot survive this cut — counter falls away with letter-piece during fabrication. To preserve counters as illuminated acrylic, re-export with a keyline + push-through group.`
            : null;
    const warningBandH = counterSurvivalWarning ? 18 : 0;

    const cableHoleCount = (opts.cableHolesBySection ?? [])
        .flat()
        .filter((p) => p.points.length >= 3).length;
    const cableHoleDia = opts.params.cableHoleDiameterMm ?? 10;
    const islandCount = (opts.pushThroughIslandsBySection ?? [])
        .flat()
        .filter((p) => p.closed && p.points.length >= 3).length;

    // ---- Page 1: panel cut -----------------------------------------
    jobs.push({
        subtitle: cableHoleCount > 0
            ? 'Panel cut — perimeter + apertures + stand-off + cable holes'
            : 'Panel cut — perimeter + apertures + stand-off holes',
        partW: layoutW,
        partH: layoutH + warningBandH,
        footerInfo: [
            `${params.materialLabel || 'material -'}${params.panelRal ? '  ·  ' + params.panelRal : ''}  ·  ${params.materialThicknessMm} mm`,
            [
                `face ${params.panelWidthMm} × ${params.panelHeightMm} mm`,
                sectionExport.sections.length > 1
                    ? `${sectionExport.sections.length} sections`
                    : '1 panel',
                cableHoleCount > 0
                    ? `${cableHoleCount} cable hole${cableHoleCount === 1 ? '' : 's'} (Ø${cableHoleDia})`
                    : '',
                islandCount > 0
                    ? `${islandCount} retained counter island${islandCount === 1 ? '' : 's'} (remount on backing)`
                    : '',
                today,
            ]
                .filter(Boolean)
                .join('  ·  '),
        ],
        draw: (dX, dY) => {
            // Counter-survival warning band — yellow band at the top
            // of the content area, content shifted down beneath it.
            if (counterSurvivalWarning) {
                doc.setFillColor(255, 243, 205); // soft amber
                doc.setDrawColor(217, 154, 0);
                doc.setLineWidth(0.35);
                doc.rect(dX, dY, layoutW, warningBandH - 3, 'FD');
                doc.setTextColor(120, 80, 0);
                doc.setFont(font, 'bold');
                doc.setFontSize(8.5);
                doc.text(
                    txt(counterSurvivalWarning),
                    dX + 4,
                    dY + 6,
                    {
                        maxWidth: layoutW - 8,
                    },
                );
                doc.setFont(font, 'normal');
                doc.setTextColor(0);
                doc.setDrawColor(0);
            }
            const yOffset = warningBandH;
            const px = (x: number) => dX + x;
            const py = (y: number) => dY + yOffset + y;
            sectionExport.sections.forEach((section, i) => {
                const ox = section.layoutOriginXMm;
                const sectionAp = opts.apertureBySection?.[i] ?? [];
                const sectionKl = opts.keylineBySection?.[i] ?? [];
                const sectionPtKl =
                    opts.pushThroughKeylineBySection?.[i] ?? [];
                // Aperture-cut paths: keyline-when-present supersedes the
                // raw aperture (legacy global-keyline push-through flow).
                // Push-through-group paths emit their per-group keyline
                // alongside — these are real face holes regardless of the
                // global keyline setting.
                const sectionPtIsland =
                    opts.pushThroughIslandsBySection?.[i] ?? [];
                const panelCuts = [
                    ...(sectionKl.length > 0 ? sectionKl : sectionAp),
                    ...sectionPtKl,
                    // Counter islands: cut the keyline ring around the
                    // retained metal island so it frees + the gap lights.
                    ...sectionPtIsland,
                ];
                const sectionFx = opts.fixingsBySection?.[i] ?? [];
                const sectionCable = opts.cableHolesBySection?.[i] ?? [];

                // Outer perimeter — one continuous welded contour.
                const perimeter = outlinePerimeter(section.development);
                doc.setDrawColor(0);
                doc.setLineWidth(productionStroke);
                if (perimeter) {
                    const pts = perimeter.points.map(
                        ([x, y]) =>
                            [px(x + ox), py(y)] as [number, number],
                    );
                    drawClosedPolyline(doc, pts, 'S');
                } else {
                    for (const seg of section.development.segments) {
                        doc.rect(
                            px(seg.xMm + ox),
                            py(seg.yMm),
                            seg.wMm,
                            seg.hMm,
                        );
                    }
                }

                // Panel cuts — keyline if present, else aperture.
                for (const ap of panelCuts) {
                    const pts = ap.points.map(
                        ([x, y]) =>
                            [px(x), py(y)] as [number, number],
                    );
                    if (ap.closed) drawClosedPolyline(doc, pts, 'S');
                    else if (pts.length >= 2) {
                        const deltas: number[][] = [];
                        for (let k = 1; k < pts.length; k++) {
                            deltas.push([
                                pts[k][0] - pts[k - 1][0],
                                pts[k][1] - pts[k - 1][1],
                            ]);
                        }
                        doc.lines(
                            deltas,
                            pts[0][0],
                            pts[0][1],
                            [1, 1],
                            'S',
                            false,
                        );
                    }
                }

                // NOTE: inner counters (R / O / A counters etc.) are
                // deliberately NOT emitted here. Without bridges the
                // counter cannot survive a panel cut — the letter-
                // piece falls out of the panel and the counter falls
                // out of the letter-piece. Emitting the counter
                // contour just makes the cutter destroy a doomed
                // piece for nothing. Counters reach the cutter only
                // on the push-through insert page (keyline mode) or
                // via the per-material pages (face-stuck inserts).

                // Stand-off fixings + cable holes — both are single
                // welded circles cut in the panel. Same emission; the
                // footer counts them separately.
                for (const f of [...sectionFx, ...sectionCable]) {
                    const cx =
                        f.points.reduce((a, q) => a + q[0], 0) /
                        f.points.length;
                    const cy =
                        f.points.reduce((a, q) => a + q[1], 0) /
                        f.points.length;
                    const rMm =
                        f.points.reduce(
                            (a, q) =>
                                a + Math.hypot(q[0] - cx, q[1] - cy),
                            0,
                        ) / f.points.length;
                    doc.circle(px(cx), py(cy), rMm, 'S');
                }
            });
        },
    });

    // ---- Page 2: push-through inserts ------------------------------
    //
    // Inserts come from two sources, both end up on this single page:
    //
    //   1. Explicit push-through groups (PushThroughPiece) — outer
    //      letter outline + each counter as a separate closed contour.
    //      Production: each letter is N pieces of acrylic (outer + one
    //      per counter), all in the SAME material, mounted to a backing
    //      board behind the panel in their original positions. Counter
    //      shows through the panel hole next to the outer piece.
    //
    //   2. Legacy: aperture-cut paths with a global keyline (the
    //      original "Enable keyline" flow). Outer aperture outline +
    //      counter outlines as separate contours, same idea.
    //
    // Either way, every contour on this page is a CUT — never
    // compound-with-hole. That keeps the production assembly honest:
    // the cutter produces individual pieces, the operator glues them
    // to the backing board in their proper positions.
    const hasGlobalKeyline =
        (opts.keylineBySection ?? []).some((arr) => arr.length > 0);
    const allApertures: FlatPath[] = (opts.apertureBySection ?? []).flatMap(
        (a) => a,
    );
    const apertureHolesFlat: FlatPath[] = (
        opts.apertureHolesBySection ?? []
    )
        .flatMap((a) => a)
        .filter((p) => p.closed && p.points.length >= 3);
    const pushThroughPiecesAll = opts.pushThroughPieces ?? [];

    // Outer outlines + counter outlines (separate pieces) coming from
    // either source. The bbox + page draw use them as a single flat
    // list of contours.
    const insertOuters: FlatPath[] = [
        ...(hasGlobalKeyline ? allApertures : []),
        ...pushThroughPiecesAll.map((p) => p.path),
    ];
    const insertCounters: FlatPath[] = [
        ...(hasGlobalKeyline ? apertureHolesFlat : []),
        ...pushThroughPiecesAll.flatMap((p) =>
            (p.holes ?? []).filter(
                (h) => h.closed && h.points.length >= 3,
            ),
        ),
    ];
    if (insertOuters.length > 0) {
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const p of [...insertOuters, ...insertCounters]) {
            for (const [x, y] of p.points) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        const insertW = Math.max(1, maxX - minX);
        const insertH = Math.max(1, maxY - minY);
        // Material specs vary across push-through groups (different
        // thicknesses / colours). Summarise distinct values so the
        // operator can pick the right sheet stock.
        const ptColours = Array.from(
            new Set(
                pushThroughPiecesAll.map((p) => p.color.toUpperCase()),
            ),
        );
        const ptThicknesses = Array.from(
            new Set(
                pushThroughPiecesAll.map((p) => `${p.thicknessMm} mm`),
            ),
        );
        const specsTrailer =
            pushThroughPiecesAll.length > 0
                ? [
                      ptColours.length > 0
                          ? `acrylic ${ptColours.join(' / ')}`
                          : '',
                      ptThicknesses.length > 0
                          ? `thickness ${ptThicknesses.join(' / ')}`
                          : '',
                  ]
                      .filter(Boolean)
                      .join('  ·  ')
                : '';
        jobs.push({
            subtitle:
                'Push-through inserts — acrylic letter donut (outer outline + counter as a hole through the acrylic). The counter is filled by a retained METAL island from the panel (see panel-cut page), not acrylic.',
            partW: insertW,
            partH: insertH,
            footerInfo: [
                `${insertOuters.length} letter${insertOuters.length === 1 ? '' : 's'}  ·  ${insertCounters.length} counter hole${insertCounters.length === 1 ? '' : 's'} (cut through the acrylic)`,
                [
                    `bbox ${Math.round(insertW)} × ${Math.round(insertH)} mm`,
                    specsTrailer,
                    today,
                ]
                    .filter(Boolean)
                    .join('  ·  '),
                'ASSEMBLY: bond acrylic donuts to the diffuser backing (next page); the metal counter islands sit in the counter holes, keyline gap all round; press from REAR of face panel.',
            ],
            draw: (dX, dY) => {
                const ipx = (x: number) => dX + (x - minX);
                const ipy = (y: number) => dY + (y - minY);
                // Each acrylic letter is a DONUT: the outer outline is
                // filled in its real acrylic colour, the counter is a
                // hole filled WHITE (the retained metal island shows
                // through it — see the panel-cut page). Filling the body
                // makes it unmistakable that the whole coloured shape is
                // the acrylic part to cut, not just an outline; the white
                // counter keeps the donut honest so production never cuts
                // a spurious acrylic disc. BOTH edges keep the hairline
                // cut stroke — the counter's inner edge is a real cut.
                doc.setDrawColor(0);
                doc.setLineWidth(productionStroke);
                for (const p of pushThroughPiecesAll) {
                    if (!p.path.closed || p.path.points.length < 3) continue;
                    const outer = p.path.points.map(
                        ([x, y]) => [ipx(x), ipy(y)] as [number, number],
                    );
                    const fill = hexToRgb(p.color);
                    doc.setFillColor(fill[0], fill[1], fill[2]);
                    drawClosedPolyline(doc, outer, 'FD');
                    // White-fill + cut-stroke each counter on top.
                    doc.setFillColor(255, 255, 255);
                    for (const h of p.holes ?? []) {
                        if (!h.closed || h.points.length < 3) continue;
                        const hp = h.points.map(
                            ([x, y]) => [ipx(x), ipy(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, hp, 'FD');
                    }
                }
                // Legacy global-keyline apertures carry no per-piece
                // colour or hole grouping. Fill each aperture body in a
                // neutral acrylic tint (or the first group's colour),
                // then punch every counter white on top so they still
                // read as donuts.
                if (hasGlobalKeyline) {
                    const legacyFill: [number, number, number] =
                        pushThroughPiecesAll[0]
                            ? hexToRgb(pushThroughPiecesAll[0].color)
                            : [225, 228, 232];
                    doc.setDrawColor(0);
                    doc.setLineWidth(productionStroke);
                    for (const ap of allApertures) {
                        const pts = ap.points.map(
                            ([x, y]) =>
                                [ipx(x), ipy(y)] as [number, number],
                        );
                        doc.setFillColor(
                            legacyFill[0],
                            legacyFill[1],
                            legacyFill[2],
                        );
                        if (ap.closed && pts.length >= 3) {
                            drawClosedPolyline(doc, pts, 'FD');
                        } else if (pts.length >= 2) {
                            const deltas: number[][] = [];
                            for (let k = 1; k < pts.length; k++) {
                                deltas.push([
                                    pts[k][0] - pts[k - 1][0],
                                    pts[k][1] - pts[k - 1][1],
                                ]);
                            }
                            doc.lines(deltas, pts[0][0], pts[0][1], [1, 1], 'S', false);
                        }
                    }
                    doc.setFillColor(255, 255, 255);
                    for (const sp of apertureHolesFlat) {
                        const pts = sp.points.map(
                            ([x, y]) =>
                                [ipx(x), ipy(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, pts, 'FD');
                    }
                }
            },
        });

        // ---- Push-through diffuser backing page -----------------------
        //
        // The opal backing panel the letter pieces (and counters) glue
        // to before the assembly is pressed into the rear of the face
        // panel. Visible from the front through the keyline shoulder
        // as a soft halo around each letter when backlit.
        //
        // Cut at the union bbox of all push-through pieces (with the
        // same 12 mm pad used in the 3D scene) — production typically
        // uses an off-the-shelf opal acrylic sheet. The cut file is
        // just the panel outline; assembly happens by hand.
        const BACKING_PAD = 12;
        const BACKING_THICKNESS_MM = 5;
        const backingW = insertW + BACKING_PAD * 2;
        const backingH = insertH + BACKING_PAD * 2;
        jobs.push({
            subtitle:
                'Push-through diffuser backing — opal acrylic panel. Letter pieces + counters glue to FRONT; assembly press-fits against REAR of face panel.',
            partW: backingW,
            partH: backingH,
            footerInfo: [
                `Opal acrylic  ·  ${BACKING_THICKNESS_MM} mm thick  ·  ${Math.round(backingW)} × ${Math.round(backingH)} mm`,
                'Light diffuses through this panel; halo visible at keyline shoulder around each letter when backlit.',
                today,
            ],
            draw: (dX, dY) => {
                doc.setDrawColor(0);
                doc.setLineWidth(productionStroke);
                // Outline — single rectangle the cutter follows.
                doc.rect(dX, dY, backingW, backingH, 'S');
                // Ghost letter outlines INSIDE the rectangle (light
                // grey, dashed) so the operator can verify the
                // backing footprint covers every piece. Not cut —
                // reference only.
                doc.setDrawColor(170);
                doc.setLineWidth(0.2);
                doc.setLineDashPattern([1.2, 0.8], 0);
                for (const ap of insertOuters) {
                    if (!ap.closed || ap.points.length < 3) continue;
                    const pts = ap.points.map(
                        ([x, y]) =>
                            [
                                dX + BACKING_PAD + (x - minX),
                                dY + BACKING_PAD + (y - minY),
                            ] as [number, number],
                    );
                    drawClosedPolyline(doc, pts, 'S');
                }
                for (const sp of insertCounters) {
                    if (!sp.closed || sp.points.length < 3) continue;
                    const pts = sp.points.map(
                        ([x, y]) =>
                            [
                                dX + BACKING_PAD + (x - minX),
                                dY + BACKING_PAD + (y - minY),
                            ] as [number, number],
                    );
                    drawClosedPolyline(doc, pts, 'S');
                }
                doc.setLineDashPattern([], 0);
                doc.setDrawColor(0);
            },
        });
    }

    // ---- Backlight opal-backing page ------------------------------
    //
    // Backlit apertures are already cut on the panel-cut page. This adds the
    // opal diffuser sheet that sits behind them with LEDs behind it: light
    // diffuses through the opal and the solid cut shape glows. Same backing
    // construction as the keyline-illumination diffuser, sized to the union
    // bbox of the backlit shapes (off-the-shelf opal sheet, hand-assembled).
    const backlightForBacking = opts.backlightPieces ?? [];
    if (backlightForBacking.length > 0) {
        let bMinX = Infinity,
            bMinY = Infinity,
            bMaxX = -Infinity,
            bMaxY = -Infinity;
        for (const piece of backlightForBacking) {
            for (const path of [piece.path, ...(piece.holes ?? [])]) {
                for (const [x, y] of path.points) {
                    if (x < bMinX) bMinX = x;
                    if (y < bMinY) bMinY = y;
                    if (x > bMaxX) bMaxX = x;
                    if (y > bMaxY) bMaxY = y;
                }
            }
        }
        if (Number.isFinite(bMinX)) {
            const PAD = 12;
            const THK = 5;
            const bw = bMaxX - bMinX + PAD * 2;
            const bh = bMaxY - bMinY + PAD * 2;
            const colours = Array.from(
                new Set(backlightForBacking.map((p) => p.color.toUpperCase())),
            );
            jobs.push({
                subtitle:
                    'Backlight diffuser backing — opal acrylic behind the cut apertures, LEDs behind. The solid cut shapes glow.',
                partW: bw,
                partH: bh,
                footerInfo: [
                    `Opal acrylic  ·  ${THK} mm thick  ·  ${Math.round(bw)} × ${Math.round(bh)} mm`,
                    `LED colour ${colours.join(' / ')}  ·  light diffuses through the opal so the solid aperture cut glows.`,
                    today,
                ],
                draw: (dX, dY) => {
                    doc.setDrawColor(0);
                    doc.setLineWidth(productionStroke);
                    doc.rect(dX, dY, bw, bh, 'S');
                    // Ghost the backlit aperture outlines so the operator can
                    // confirm the opal covers every cut. Reference only.
                    doc.setDrawColor(170);
                    doc.setLineWidth(0.2);
                    doc.setLineDashPattern([1.2, 0.8], 0);
                    for (const piece of backlightForBacking) {
                        for (const ring of [
                            piece.path,
                            ...(piece.holes ?? []),
                        ]) {
                            if (!ring.closed || ring.points.length < 3) continue;
                            const pts = ring.points.map(
                                ([x, y]) =>
                                    [
                                        dX + PAD + (x - bMinX),
                                        dY + PAD + (y - bMinY),
                                    ] as [number, number],
                            );
                            drawClosedPolyline(doc, pts, 'S');
                        }
                    }
                    doc.setLineDashPattern([], 0);
                    doc.setDrawColor(0);
                },
            });
        }
    }

    // ---- Per-material cut pages ------------------------------------
    type MaterialPieceBundle = {
        kind: 'acrylic' | 'vinyl' | 'standoff';
        title: string;
        subtitle: string;
        pieces: MaterialPiece[];
    };
    // Printed full-colour vinyl turns the vinyl page into a print-&-cut sheet:
    // the real artwork at 1:1 plus a contour cut line, rather than a flat
    // spot-colour cut.
    const vinylFC = hasFullColourVinyl(opts);
    const materialBundles: MaterialPieceBundle[] = [
        {
            kind: 'acrylic',
            title: 'ACRYLIC',
            subtitle: 'Acrylic face-stuck — 1:1 cut file for the acrylic sheet',
            pieces: opts.acrylicPieces ?? [],
        },
        {
            kind: 'vinyl',
            title: 'VINYL',
            subtitle: vinylFC
                ? 'Printed vinyl — full-colour print at 1:1, then contour-cut the outlines'
                : 'Vinyl appliqué — 1:1 cut file for the vinyl plotter',
            pieces: opts.vinylPieces ?? [],
        },
        {
            kind: 'standoff',
            title: 'STOOD-OFF',
            subtitle: 'Stood-off lettering — 1:1 cut file for the standoff material',
            pieces: (opts.standoffPieces ?? []).map((p) => ({
                pathIndex: p.pathIndex,
                path: p.path,
                holes: p.holes,
                color: p.color,
                thicknessMm: p.thicknessMm,
            })),
        },
    ];
    for (const bundle of materialBundles) {
        if (bundle.pieces.length === 0) continue;
        let minX = Infinity,
            minY = Infinity,
            maxX = -Infinity,
            maxY = -Infinity;
        for (const piece of bundle.pieces) {
            for (const path of [piece.path, ...(piece.holes ?? [])]) {
                for (const [x, y] of path.points) {
                    if (x < minX) minX = x;
                    if (y < minY) minY = y;
                    if (x > maxX) maxX = x;
                    if (y > maxY) maxY = y;
                }
            }
        }
        const partW = Math.max(1, maxX - minX);
        const partH = Math.max(1, maxY - minY);
        const colours = Array.from(
            new Set(bundle.pieces.map((p) => p.color.toUpperCase())),
        );
        const thicknesses = Array.from(
            new Set(
                bundle.pieces
                    .map((p) =>
                        p.thicknessMm != null ? `${p.thicknessMm}mm` : null,
                    )
                    .filter((s): s is string => s !== null),
            ),
        );
        const footerInfo = [
            `${bundle.title} — ${bundle.pieces.length} piece${bundle.pieces.length === 1 ? '' : 's'}`,
            [
                colours.length > 0 ? `colour ${colours.join(' / ')}` : '',
                thicknesses.length > 0
                    ? `thickness ${thicknesses.join(' / ')}`
                    : '',
                `bbox ${Math.round(partW)} × ${Math.round(partH)} mm`,
                today,
            ]
                .filter(Boolean)
                .join('  ·  '),
        ];
        jobs.push({
            subtitle: bundle.subtitle,
            partW,
            partH,
            footerInfo,
            draw: (dX, dY) => {
                const px = (x: number) => dX + (x - minX);
                const py = (y: number) => dY + (y - minY);

                // Printed full-colour vinyl → print-&-cut: drop the real
                // artwork (masked to the vinyl shapes; its opaque content sits
                // exactly in this part's bbox) at 1:1, then draw each piece's
                // outline as the contour cut line. Solid-colour vinyl pieces in
                // the same bundle still flat-fill below.
                const printThisBundle =
                    bundle.kind === 'vinyl' &&
                    vinylFC &&
                    !!opts.vinylPrintDataUrl &&
                    !!opts.faceRectMm;
                if (printThisBundle && opts.vinylPrintDataUrl && opts.faceRectMm) {
                    drawVinylPrintImage(
                        doc,
                        opts.vinylPrintDataUrl,
                        opts.faceRectMm,
                        px,
                        py,
                    );
                }

                // Fill each piece in its real colour with the hairline
                // cut stroke on top (FD). The fill makes it unmistakable
                // that the WHOLE shape is the part — not just an outline
                // to follow — while the crisp stroke stays the cut path.
                // Counters are filled WHITE so donuts read, but KEEP
                // their cut stroke: the inner edge is a real cut too.
                doc.setDrawColor(0);
                doc.setLineWidth(productionStroke);
                for (const piece of bundle.pieces) {
                    // Full-colour piece: the print supplies the colour, so just
                    // stroke the contour cut line (outer + counters).
                    if (printThisBundle && piece.fullColor) {
                        drawVinylContour(doc, piece, px, py, productionStroke);
                        continue;
                    }
                    if (piece.path.closed && piece.path.points.length >= 3) {
                        const fill = hexToRgb(piece.color);
                        doc.setFillColor(fill[0], fill[1], fill[2]);
                        const pts = piece.path.points.map(
                            ([x, y]) =>
                                [px(x), py(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, pts, 'FD');
                    }
                    doc.setFillColor(255, 255, 255);
                    for (const hole of piece.holes ?? []) {
                        if (!hole.closed || hole.points.length < 3) continue;
                        const pts = hole.points.map(
                            ([x, y]) =>
                                [px(x), py(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, pts, 'FD');
                    }
                }
            },
        });
    }

    // ---- Placement template page (face 1:1) ------------------------
    const allFixings: FlatPath[] = (opts.fixingsBySection ?? []).flatMap(
        (a) => a,
    );
    const allCableHoles: FlatPath[] = (opts.cableHolesBySection ?? []).flatMap(
        (a) => a,
    );
    const allReferences: FlatPath[] = (opts.referenceBySection ?? []).flatMap(
        (a) => a,
    );
    const needsTemplate =
        allFixings.length > 0 ||
        allCableHoles.length > 0 ||
        allReferences.length > 0 ||
        allApertures.length > 0;
    if (needsTemplate) {
        const firstFace = sectionExport.sections[0]?.development.segments.find(
            (s) => s.role === 'face',
        );
        const faceYInLayout = firstFace?.yMm ?? 0;
        const faceW = sectionExport.totalLayoutWMm;
        const faceH = params.panelHeightMm;
        jobs.push({
            subtitle: 'Placement template — face 1:1, lay on panel and prick centres',
            partW: faceW,
            partH: faceH,
            footerInfo: [
                [
                    allFixings.length > 0
                        ? `${allFixings.length} fixing hole${allFixings.length === 1 ? '' : 's'}`
                        : 'No fixings',
                    allCableHoles.length > 0
                        ? `${allCableHoles.length} cable hole${allCableHoles.length === 1 ? '' : 's'} (Ø${opts.params.cableHoleDiameterMm ?? 10})`
                        : '',
                ]
                    .filter(Boolean)
                    .join('  ·  '),
                `face ${Math.round(params.panelWidthMm)} × ${Math.round(params.panelHeightMm)} mm  ·  ${today}`,
                'LEGEND: + stud hole  ·  O cable hole  ·  - - letter position  ·  .... aperture cut' +
                    (islandCount > 0
                        ? '  ·  retained metal island = KEEP + remount on backing (keyline cut rings it)'
                        : ''),
            ],
            draw: (dX, dY) => {
                const px = (x: number) => dX + x;
                const py = (y: number) => dY + (y - faceYInLayout);

                // Panel face outline at 1:1 — per-section so seams show.
                doc.setDrawColor(0);
                doc.setLineWidth(productionStroke);
                sectionExport.sections.forEach((section) => {
                    const ox = section.layoutOriginXMm;
                    const face = section.development.segments.find(
                        (s) => s.role === 'face',
                    );
                    if (!face) return;
                    doc.rect(
                        px(face.xMm + ox),
                        py(face.yMm),
                        face.wMm,
                        face.hMm,
                    );
                });

                // Letter reference outlines — dashed.
                if (allReferences.length > 0) {
                    doc.setDrawColor(140);
                    doc.setLineWidth(0.25);
                    doc.setLineDashPattern([1.2, 0.8], 0);
                    for (const ref of allReferences) {
                        if (!ref.closed || ref.points.length < 3) continue;
                        const pts = ref.points.map(
                            ([x, y]) =>
                                [px(x), py(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, pts, 'S');
                    }
                    doc.setLineDashPattern([], 0);
                }
                // Aperture outlines — dotted.
                if (allApertures.length > 0) {
                    doc.setDrawColor(180);
                    doc.setLineWidth(0.25);
                    doc.setLineDashPattern([0.6, 0.6], 0);
                    for (const ap of allApertures) {
                        if (!ap.closed || ap.points.length < 3) continue;
                        const pts = ap.points.map(
                            ([x, y]) =>
                                [px(x), py(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, pts, 'S');
                    }
                    doc.setLineDashPattern([], 0);
                }
                // Fixing centres — hole + crosshair + prick.
                doc.setDrawColor(0);
                doc.setFillColor(0, 0, 0);
                doc.setLineWidth(productionStroke);
                for (const f of allFixings) {
                    if (f.points.length < 3) continue;
                    let cx = 0,
                        cy = 0;
                    for (const q of f.points) {
                        cx += q[0];
                        cy += q[1];
                    }
                    cx /= f.points.length;
                    cy /= f.points.length;
                    let rMm = 0;
                    for (const q of f.points)
                        rMm += Math.hypot(q[0] - cx, q[1] - cy);
                    rMm /= f.points.length;
                    doc.circle(px(cx), py(cy), rMm, 'S');
                    const xh = rMm * 1.5;
                    doc.line(
                        px(cx) - xh,
                        py(cy),
                        px(cx) + xh,
                        py(cy),
                    );
                    doc.line(
                        px(cx),
                        py(cy) - xh,
                        px(cx),
                        py(cy) + xh,
                    );
                    // Visible + print-survivable centre cross (1.5 mm
                    // each side, brand teal) so the prick mark doesn't
                    // disappear when photocopied.
                    doc.setDrawColor(
                        BRAND_RGB[0],
                        BRAND_RGB[1],
                        BRAND_RGB[2],
                    );
                    doc.setLineWidth(0.4);
                    doc.line(
                        px(cx) - 1.5,
                        py(cy),
                        px(cx) + 1.5,
                        py(cy),
                    );
                    doc.line(
                        px(cx),
                        py(cy) - 1.5,
                        px(cx),
                        py(cy) + 1.5,
                    );
                    doc.setDrawColor(0);
                }

                // Cable holes — hole + crosshair, drawn in purple so the
                // operator can tell them from the stud holes above. No
                // centre prick: these are clearance holes for a cable,
                // not a stud location that needs marking out precisely.
                for (const f of allCableHoles) {
                    if (f.points.length < 3) continue;
                    let cx = 0,
                        cy = 0;
                    for (const q of f.points) {
                        cx += q[0];
                        cy += q[1];
                    }
                    cx /= f.points.length;
                    cy /= f.points.length;
                    let rMm = 0;
                    for (const q of f.points)
                        rMm += Math.hypot(q[0] - cx, q[1] - cy);
                    rMm /= f.points.length;
                    doc.setDrawColor(124, 58, 237); // purple
                    doc.setLineWidth(productionStroke);
                    doc.circle(px(cx), py(cy), rMm, 'S');
                    const xh = rMm * 1.5;
                    doc.line(px(cx) - xh, py(cy), px(cx) + xh, py(cy));
                    doc.line(px(cx), py(cy) - xh, px(cx), py(cy) + xh);
                    doc.setDrawColor(0);
                }
            },
        });
    }

        // Two-item job: tag every page with the item name so a loose cut
        // sheet on the bench is never mistaken for the other sign.
        if (itemLabel) {
            for (const job of jobs) {
                job.subtitle = `${itemLabel} · ${job.subtitle}`;
                job.footerInfo = [itemLabel, ...job.footerInfo];
            }
        }
        return jobs;
    };

    // Main fascia, then the projecting sign if the design has one. Labelled
    // so the workshop can tell the cut sheets apart at a glance.
    const jobs: ProdPageJob[] = [
        ...buildJobs(opts),
        ...(opts.secondary ? buildJobs(opts.secondary) : []),
    ];

    // ---- Phase 2: compute single fixed sheet size ------------------
    // The whole bundle uses one paper size so office printers can't
    // silently mis-scale a page that's smaller than the others.
    const M_TOP = STRAP_H + 9; // strap (9 mm) + bold page title + breathing room
    const M_BOTTOM = 28; // QR (16 mm) + label + warning + breathing
    const M_SIDE = 14;
    let maxPartW = 0;
    let maxPartH = 0;
    for (const job of jobs) {
        if (job.partW > maxPartW) maxPartW = job.partW;
        if (job.partH > maxPartH) maxPartH = job.partH;
    }
    const sheetW = maxPartW + 2 * M_SIDE;
    const sheetH = maxPartH + M_TOP + M_BOTTOM;
    if (sheetW > MAX_PAGE_MM || sheetH > MAX_PAGE_MM) {
        throw new Error(
            `Production PDF would need a page ${Math.round(sheetW)}×${Math.round(sheetH)} mm, larger than the PDF user-space limit. Split the sign into smaller sections first.`,
        );
    }

    const doc = new jsPDF({
        unit: 'mm',
        format: [sheetW, sheetH],
        orientation: sheetW >= sheetH ? 'landscape' : 'portrait',
    });
    const fontRes = await registerVisualiserFonts(doc);
    const font = fontRes.family;
    const qrDataUrl = await buildQrCode(opts.designId ?? null);
    doc.setProperties({
        title: `${params.name} — production cut file`,
        subject: 'Production PDF — 1:1 CAM-ready cut file',
        author: opts.drawnBy ?? 'Onesign Odysseus',
        keywords: 'production, cut, CAM, signage, onesign',
    });

    const designIdShort = docId(opts.designId, params.name);
    // Nest pages ride on their OWN 1:1 sheet size (a full acrylic sheet is far
    // bigger than a panel — folding it into the uniform panel-page size would
    // blow every page up to sheet size). Flattened here for page numbering.
    const nestSheets: Array<{
        nest: EmbeddedNest;
        sheet: EmbeddedNestSheet;
        no: number;
        total: number;
    }> = [];
    for (const nest of opts.embeddedNests ?? []) {
        nest.sheets.forEach((sheet, si) =>
            nestSheets.push({ nest, sheet, no: si + 1, total: nest.sheets.length }),
        );
    }
    const totalPages = jobs.length + nestSheets.length;

    // ---- Phase 3: emit pages ---------------------------------------
    jobs.forEach((job, index) => {
        if (index > 0) {
            doc.addPage(
                [sheetW, sheetH],
                sheetW >= sheetH ? 'landscape' : 'portrait',
            );
        }
        // Top strap
        drawDocStrap(doc, {
            pageW: sheetW,
            margin: M_SIDE,
            kind: 'production',
            designName: params.name,
            designIdShort,
            pageNumber: index + 1,
            totalPages,
            font,
            subtitle: job.subtitle,
        });

        // Thin border 2 mm inside the page edge — operator can measure
        // border-to-border to verify the print is at 100%.
        doc.setDrawColor(200);
        doc.setLineWidth(0.15);
        doc.rect(2, STRAP_H + 1.5, sheetW - 4, sheetH - STRAP_H - 3);

        // Content — horizontally centred, top-aligned just below the strap.
        const dX = M_SIDE + (maxPartW - job.partW) / 2;
        const dY = M_TOP;
        job.draw(dX, dY);

        // Footer — info strip + sheet sizing + QR + scale warning.
        drawDocFooter(doc, {
            pageW: sheetW,
            pageH: sheetH,
            margin: M_SIDE,
            kind: 'production',
            infoLines: [
                ...job.footerInfo,
                `Sheet ${Math.round(sheetW)} × ${Math.round(sheetH)} mm  ·  ${designIdShort}`,
            ],
            qrDataUrl,
            font,
        });
    });

    // ---- Phase 4: nest pages, each on its own 1:1 sheet ------------
    const NEST_SIDE = 14;
    const NEST_TOP = STRAP_H + 9;
    const NEST_BOTTOM = 22;
    nestSheets.forEach((ns, k) => {
        const { sheet } = ns;
        // 1:1, unless the sheet + margins would exceed the PDF user-space
        // limit (a safety net — real acrylic sheets are well under it).
        let scale = 1;
        let pageW = sheet.widthMm + 2 * NEST_SIDE;
        let pageH = sheet.heightMm + NEST_TOP + NEST_BOTTOM;
        if (pageW > MAX_PAGE_MM || pageH > MAX_PAGE_MM) {
            scale = Math.min(
                (MAX_PAGE_MM - 2 * NEST_SIDE) / sheet.widthMm,
                (MAX_PAGE_MM - NEST_TOP - NEST_BOTTOM) / sheet.heightMm,
                1,
            );
            pageW = sheet.widthMm * scale + 2 * NEST_SIDE;
            pageH = sheet.heightMm * scale + NEST_TOP + NEST_BOTTOM;
        }
        // A panel cut page is always emitted first, so a nest page is never
        // page 1 — safe to always addPage.
        doc.addPage([pageW, pageH], pageW >= pageH ? 'landscape' : 'portrait');
        drawDocStrap(doc, {
            pageW,
            margin: NEST_SIDE,
            kind: 'production',
            designName: params.name,
            designIdShort,
            pageNumber: jobs.length + k + 1,
            totalPages,
            font,
            subtitle: `Nest — ${ns.nest.name} · sheet ${ns.no}/${ns.total}`,
        });
        doc.setDrawColor(200);
        doc.setLineWidth(0.15);
        doc.rect(2, STRAP_H + 1.5, pageW - 4, pageH - STRAP_H - 3);
        drawNestSheet(doc, sheet, NEST_SIDE, NEST_TOP, scale);
        drawDocFooter(doc, {
            pageW,
            pageH,
            margin: NEST_SIDE,
            kind: 'production',
            infoLines: [
                `${sheet.pieceCount} piece${sheet.pieceCount === 1 ? '' : 's'}  ·  ${Math.round(sheet.utilisation * 100)}% used`,
                scale === 1
                    ? 'Acrylic / metal-face nest — PRINT AT 100%, DO NOT SCALE'
                    : `Nest scaled to fit (${Math.round(scale * 100)}%) — over the 1:1 page limit`,
                `Sheet ${Math.round(sheet.widthMm)} × ${Math.round(sheet.heightMm)} mm  ·  ${designIdShort}`,
            ],
            qrDataUrl,
            font,
        });
    });

    return doc.output('blob');
}


/** Horizontal dimension: dashed line + end ticks + centred value. */
function dimH(
    doc: jsPDF,
    x1: number,
    x2: number,
    y: number,
    label: string,
    font: number,
    tick: number,
): void {
    doc.setDrawColor(120);
    doc.setLineWidth(0.2 * Math.max(1, tick / 1.4));
    doc.setLineDashPattern([tick, tick * 0.7], 0);
    doc.line(x1, y, x2, y);
    doc.setLineDashPattern([], 0);
    doc.line(x1, y - tick, x1, y + tick);
    doc.line(x2, y - tick, x2, y + tick);
    doc.setFontSize(font);
    doc.text(label, (x1 + x2) / 2, y + tick * 2 + font * 0.18, {
        align: 'center',
    });
}

/** Vertical dimension: dashed line + end ticks + rotated value. */
function dimV(
    doc: jsPDF,
    y1: number,
    y2: number,
    x: number,
    label: string,
    font: number,
    tick: number,
): void {
    doc.setDrawColor(120);
    doc.setLineWidth(0.2 * Math.max(1, tick / 1.4));
    doc.setLineDashPattern([tick, tick * 0.7], 0);
    doc.line(x, y1, x, y2);
    doc.setLineDashPattern([], 0);
    doc.line(x - tick, y1, x + tick, y1);
    doc.line(x - tick, y2, x + tick, y2);
    doc.setFontSize(font);
    doc.text(label, x - tick * 2 - font * 0.18, (y1 + y2) / 2, {
        align: 'center',
        angle: 90,
    });
}

function drawPaths(
    doc: jsPDF,
    paths: FlatPath[],
    px: (n: number) => number,
    py: (n: number) => number,
    rgb: [number, number, number],
    width: number,
) {
    if (!paths.length) return;
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(width);
    for (const p of paths) {
        for (let i = 0; i + 1 < p.points.length; i++) {
            const a = p.points[i];
            const b = p.points[i + 1];
            doc.line(px(a[0]), py(a[1]), px(b[0]), py(b[1]));
        }
    }
}

function returnsLabel(p: PanelParams): string {
    const on = (['top', 'bottom', 'left', 'right'] as const).filter(
        (e) => p.returns[e],
    );
    return on.length === 4
        ? 'All four edges'
        : on.length === 0
          ? 'None'
          : on.join(', ');
}

export function pdfFilename(
    params: PanelParams,
    mode: 'reference' | 'production' = 'reference',
): string {
    const safe = params.name
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '');
    const suffix = mode === 'production' ? 'production' : 'reference';
    return `${safe || 'panel'}-${Math.round(params.panelWidthMm)}x${Math.round(
        params.panelHeightMm,
    )}-${suffix}.pdf`;
}
