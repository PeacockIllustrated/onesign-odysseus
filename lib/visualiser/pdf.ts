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
import { registerVisualiserFonts } from './pdf-fonts';

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
    return s;
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

interface PdfOptions {
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
    fixingsBySection?: FlatPath[][];
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
    /** PNG/JPEG data URL of the 3D preview, optional. */
    thumbnailDataUrl?: string;
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

    // Optional subtitle below the strap (page-specific context like
    // "Overview", "Flat layout", or the material name). Sits in the
    // top margin between strap and content.
    if (subtitle) {
        doc.setFont(font, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(110);
        doc.text(txt(subtitle), margin, STRAP_H + 4);
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
        subtitle: title,
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
    doc.setDrawColor(color[0], color[1], color[2]);
    doc.setLineWidth(weight);
    sectionExport.sections.forEach((_section, i) => {
        const list = apertureBySection[i] ?? [];
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
        doc.setFillColor(255, 255, 255);
        for (const h of piece.holes) {
            drawOne(h.points, 'F');
        }
        doc.setFillColor(fill[0], fill[1], fill[2]);
    }
}

interface MaterialPageSpec {
    kind:
        | 'cut'
        | 'vinyl'
        | 'acrylic'
        | 'solid'
        | 'standoff'
        | 'pushthrough';
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
        pages.push({
            kind: 'vinyl',
            label: 'Vinyl appliqués',
            color: accent,
            specs: [
                ['Type', 'Vinyl appliqué — flat'],
                [
                    'Pieces',
                    `${vinylPieces.length} piece${vinylPieces.length === 1 ? '' : 's'}`,
                ],
                ['Colour', summariseVariants(colours)],
            ],
            paths: vinylPieces.flatMap((p) => [p.path, ...(p.holes ?? [])]),
            pieces: vinylPieces,
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
                ['Colour', summariseVariants(colours)],
                ['Thickness', summariseVariants(thicknesses)],
                ['Standoff', summariseVariants(distances)],
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

    // Materials table (bottom of page)
    const matY = Math.max(
        top + 6 + spec.length * 5.5 + 6,
        thumbTop + thumbH + 14,
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
    const legendItems: Array<{
        draw: (x: number, y: number) => void;
        label: string;
    }> = [
        {
            label: 'Fold line',
            draw: (x, y) => {
                doc.setDrawColor(200, 0, 0);
                doc.setLineWidth(0.3);
                doc.setLineDashPattern([1.4, 1.0], 0);
                doc.line(x, y, x + 10, y);
                doc.setLineDashPattern([], 0);
            },
        },
        {
            label: 'Cut perimeter',
            draw: (x, y) => {
                doc.setDrawColor(20);
                doc.setLineWidth(0.5);
                doc.line(x, y, x + 10, y);
            },
        },
        {
            label: 'Aperture / push-through',
            draw: (x, y) => {
                doc.setDrawColor(30, 90, 200);
                doc.setLineWidth(0.4);
                doc.line(x, y, x + 10, y);
            },
        },
        {
            label: 'Material outline (current page)',
            draw: (x, y) => {
                doc.setDrawColor(20);
                doc.setLineWidth(0.6);
                doc.line(x, y, x + 10, y);
            },
        },
        {
            label: 'Other materials (ghosted)',
            draw: (x, y) => {
                doc.setDrawColor(200);
                doc.setLineWidth(0.2);
                doc.line(x, y, x + 10, y);
            },
        },
    ];
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

    // Outer perimeter + folds + dims
    const { px, py } = drawFlatBlank(doc, opts.sectionExport, dX, dY, scale, {
        outlineWeight: 0.4 * Math.max(1, scale),
        showFolds: true,
        showDims: true,
        dimFont: Math.max(8, Math.min(14, scale * 4)),
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

    // Material pieces — drawn filled with their colour
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
        );
    }
    // Push-through inserts — outer + each counter drawn as separate
    // filled shapes (production reality is two acrylic pieces glued to
    // a backing board behind the panel, NOT one compound piece with a
    // hole). Drawn before standoff so any dashed standoff outlines
    // overlay cleanly.
    for (const p of opts.pushThroughPieces ?? []) {
        const fillRgb = hexToRgb(p.color);
        const drawShape = (ring: FlatPath) => {
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
                fillRgb,
                [20, 20, 20],
                0.3,
                'FD',
            );
        };
        drawShape(p.path);
        for (const h of p.holes ?? []) drawShape(h);
    }

    // Standoff pieces — outlined dashed, not filled (they sit OFF the panel)
    for (const p of opts.standoffPieces ?? []) {
        doc.setDrawColor(...hexToRgb(p.color));
        doc.setLineWidth(0.35);
        doc.setLineDashPattern([1.2, 0.8], 0);
        const pl = pathDPolyline(p.path.points, p.path.closed);
        if (pl) {
            doc.lines(
                pl.deltas,
                px(pl.start[0]),
                py(pl.start[1]),
                [scale, scale],
                'S',
                p.path.closed,
            );
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

function drawMaterialPage(ctx: PageContext, spec: MaterialPageSpec): void {
    const { doc, pageW, pageH, margin, opts } = ctx;
    const T = (s: string) => txt(s);
    drawHeaderBar(ctx, `${spec.label}`);

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
    spec.specs.forEach(([k, v]) => {
        doc.setTextColor(120);
        doc.text(T(k), specX, rowY);
        doc.setTextColor(0);
        doc.text(T(v), specX + 30, rowY);
        rowY += 5.2;
    });

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

    // Faded outlines of OTHER materials so it's clear where this
    // material sits relative to the rest of the sign.
    doc.setDrawColor(220);
    doc.setLineWidth(0.15);
    const apAll = (opts.apertureBySection ?? []).flatMap((a) => a);
    if (spec.kind !== 'cut') {
        for (const p of apAll) {
            const pl = pathDPolyline(p.points, p.closed);
            if (pl)
                doc.lines(
                    pl.deltas,
                    px(pl.start[0]),
                    py(pl.start[1]),
                    [scale, scale],
                    'S',
                    p.closed,
                );
        }
    }
    if (spec.kind !== 'vinyl') {
        for (const p of opts.vinylPieces ?? []) {
            const pl = pathDPolyline(p.path.points, p.path.closed);
            if (pl)
                doc.lines(
                    pl.deltas,
                    px(pl.start[0]),
                    py(pl.start[1]),
                    [scale, scale],
                    'S',
                    p.path.closed,
                );
        }
    }
    if (spec.kind !== 'acrylic') {
        for (const p of opts.acrylicPieces ?? []) {
            const pl = pathDPolyline(p.path.points, p.path.closed);
            if (pl)
                doc.lines(
                    pl.deltas,
                    px(pl.start[0]),
                    py(pl.start[1]),
                    [scale, scale],
                    'S',
                    p.path.closed,
                );
        }
    }
    if (spec.kind !== 'solid') {
        for (const p of opts.solidPieces ?? []) {
            const pl = pathDPolyline(p.path.points, p.path.closed);
            if (pl)
                doc.lines(
                    pl.deltas,
                    px(pl.start[0]),
                    py(pl.start[1]),
                    [scale, scale],
                    'S',
                    p.path.closed,
                );
        }
    }
    if (spec.kind !== 'standoff') {
        for (const p of opts.standoffPieces ?? []) {
            const pl = pathDPolyline(p.path.points, p.path.closed);
            if (pl)
                doc.lines(
                    pl.deltas,
                    px(pl.start[0]),
                    py(pl.start[1]),
                    [scale, scale],
                    'S',
                    p.path.closed,
                );
        }
    }
    if (spec.kind !== 'pushthrough') {
        for (const p of opts.pushThroughPieces ?? []) {
            for (const ring of [p.path, ...(p.holes ?? [])]) {
                const pl = pathDPolyline(ring.points, ring.closed);
                if (pl)
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
    }

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
            const panelRgb = hexToRgb(panelColor);
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
                );
            }
        }
    } else if (spec.pieces) {
        for (const piece of spec.pieces) {
            const fillForPiece = hexToRgb(piece.color);
            const strokeRgb: [number, number, number] = [20, 20, 20];
            if (spec.kind === 'standoff') {
                doc.setDrawColor(
                    fillForPiece[0],
                    fillForPiece[1],
                    fillForPiece[2],
                );
                doc.setLineWidth(0.6);
                const pl = pathDPolyline(
                    piece.path.points,
                    piece.path.closed,
                );
                if (pl)
                    doc.lines(
                        pl.deltas,
                        px(pl.start[0]),
                        py(pl.start[1]),
                        [scale, scale],
                        'S',
                        piece.path.closed,
                    );
                for (const h of piece.holes ?? []) {
                    const pl2 = pathDPolyline(h.points, h.closed);
                    if (pl2)
                        doc.lines(
                            pl2.deltas,
                            px(pl2.start[0]),
                            py(pl2.start[1]),
                            [scale, scale],
                            'S',
                            h.closed,
                        );
                }
            } else if (spec.kind === 'pushthrough') {
                // Outer letter + each counter as SEPARATE filled
                // shapes — never compound-with-hole. Production
                // reality: counters are real pieces of acrylic
                // sitting beside the outer piece on the backing
                // board.
                doc.setFillColor(
                    fillForPiece[0],
                    fillForPiece[1],
                    fillForPiece[2],
                );
                doc.setDrawColor(strokeRgb[0], strokeRgb[1], strokeRgb[2]);
                doc.setLineWidth(0.35);
                const drawShape = (ring: FlatPath) => {
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
                    doc.lines(
                        deltas,
                        px(pts[0][0]),
                        py(pts[0][1]),
                        [scale, scale],
                        'FD',
                        true,
                    );
                };
                drawShape(piece.path);
                for (const h of piece.holes ?? []) drawShape(h);
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
            `Other materials shown faded for reference.  ·  Scale 1:${scale < 1 ? Math.round(1 / scale) : '1'}`,
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

    const materialPages = buildMaterialPages(opts);
    const totalPages = 2 + materialPages.length;
    let pageNumber = 0;

    const nextCtx = (): PageContext => {
        pageNumber += 1;
        return {
            doc,
            pageW: PAGE_W,
            pageH: PAGE_H,
            margin,
            params: opts.params,
            opts,
            pageNumber,
            totalPages,
            font,
            qrDataUrl,
        };
    };

    // Page 1 — Overview
    drawOverviewPage(nextCtx());

    // Page 2 — Flat cutting layout
    doc.addPage('a4', 'landscape');
    drawFlatLayoutPage(nextCtx());

    // Pages 3+ — one per material group
    for (const page of materialPages) {
        doc.addPage('a4', 'landscape');
        drawMaterialPage(nextCtx(), page);
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
    const jobs: ProdPageJob[] = [];

    // Hairline stroke that scales mildly with part size, capped well
    // below any sensible kerf so no CAM interpretation widens the cut.
    const layoutW = Math.max(1, sectionExport.totalLayoutWMm);
    const layoutH = Math.max(1, sectionExport.totalLayoutHMm);
    const productionStroke = Math.max(
        0.05,
        Math.min(0.2, Math.max(layoutW, layoutH) / 5000),
    );

    // ---- Page 1: panel cut -----------------------------------------
    jobs.push({
        subtitle: 'Panel cut — perimeter + apertures + stand-off holes',
        partW: layoutW,
        partH: layoutH,
        footerInfo: [
            `${params.materialLabel || 'material -'}  ·  ${params.materialThicknessMm} mm`,
            `face ${params.panelWidthMm} × ${params.panelHeightMm} mm  ·  ${
                sectionExport.sections.length > 1
                    ? `${sectionExport.sections.length} sections`
                    : '1 panel'
            }  ·  ${today}`,
        ],
        draw: (dX, dY) => {
            const px = (x: number) => dX + x;
            const py = (y: number) => dY + y;
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
                const panelCuts = [
                    ...(sectionKl.length > 0 ? sectionKl : sectionAp),
                    ...sectionPtKl,
                ];
                const sectionFx = opts.fixingsBySection?.[i] ?? [];

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

                // Stand-off fixings — naturally welded single circles.
                for (const f of sectionFx) {
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
                'Push-through inserts — outer letter + each counter as a SEPARATE piece, mount on backing board behind panel',
            partW: insertW,
            partH: insertH,
            footerInfo: [
                `${insertOuters.length} outer${insertOuters.length === 1 ? '' : 's'}  ·  ${insertCounters.length} counter${insertCounters.length === 1 ? '' : 's'}`,
                [
                    `bbox ${Math.round(insertW)} × ${Math.round(insertH)} mm`,
                    specsTrailer,
                    today,
                ]
                    .filter(Boolean)
                    .join('  ·  '),
            ],
            draw: (dX, dY) => {
                const ipx = (x: number) => dX + (x - minX);
                const ipy = (y: number) => dY + (y - minY);
                doc.setDrawColor(0);
                doc.setLineWidth(productionStroke);
                for (const ap of insertOuters) {
                    const pts = ap.points.map(
                        ([x, y]) =>
                            [ipx(x), ipy(y)] as [number, number],
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
                // Counters — emitted as SEPARATE closed contours
                // (NOT compound holes in the outer). The cutter
                // produces each as its own piece, the operator glues
                // it next to the outer piece on the backing board.
                for (const sp of insertCounters) {
                    const pts = sp.points.map(
                        ([x, y]) =>
                            [ipx(x), ipy(y)] as [number, number],
                    );
                    drawClosedPolyline(doc, pts, 'S');
                }
            },
        });
    }

    // ---- Per-material cut pages ------------------------------------
    type MaterialPieceBundle = {
        title: string;
        subtitle: string;
        pieces: MaterialPiece[];
    };
    const materialBundles: MaterialPieceBundle[] = [
        {
            title: 'ACRYLIC',
            subtitle: 'Acrylic face-stuck — 1:1 cut file for the acrylic sheet',
            pieces: opts.acrylicPieces ?? [],
        },
        {
            title: 'VINYL',
            subtitle: 'Vinyl appliqué — 1:1 cut file for the vinyl plotter',
            pieces: opts.vinylPieces ?? [],
        },
        {
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
                doc.setDrawColor(0);
                doc.setLineWidth(productionStroke);
                for (const piece of bundle.pieces) {
                    if (piece.path.closed && piece.path.points.length >= 3) {
                        const pts = piece.path.points.map(
                            ([x, y]) =>
                                [px(x), py(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, pts, 'S');
                    }
                    for (const hole of piece.holes ?? []) {
                        if (!hole.closed || hole.points.length < 3) continue;
                        const pts = hole.points.map(
                            ([x, y]) =>
                                [px(x), py(y)] as [number, number],
                        );
                        drawClosedPolyline(doc, pts, 'S');
                    }
                }
            },
        });
    }

    // ---- Placement template page (face 1:1) ------------------------
    const allFixings: FlatPath[] = (opts.fixingsBySection ?? []).flatMap(
        (a) => a,
    );
    const allReferences: FlatPath[] = (opts.referenceBySection ?? []).flatMap(
        (a) => a,
    );
    const needsTemplate =
        allFixings.length > 0 ||
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
                allFixings.length > 0
                    ? `${allFixings.length} fixing hole${allFixings.length === 1 ? '' : 's'}`
                    : 'No fixings',
                `face ${Math.round(params.panelWidthMm)} × ${Math.round(params.panelHeightMm)} mm  ·  ${today}`,
                'LEGEND: ⊕ stud hole · — — letter position · · · · aperture cut',
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
            },
        });
    }

    // ---- Phase 2: compute single fixed sheet size ------------------
    // The whole bundle uses one paper size so office printers can't
    // silently mis-scale a page that's smaller than the others.
    const M_TOP = STRAP_H + 5; // strap (9 mm) + breathing room
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
    const totalPages = jobs.length;

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
