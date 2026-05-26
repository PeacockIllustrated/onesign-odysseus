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
import {
    type PanelParams,
    type FlatPath,
    type SectionedExport,
    type MaterialPiece,
    type StandoffPiece,
} from './types';
import { outlinePerimeter } from './geometry';

/** PDF media box limit is ~14400 user units; stay well under it. */
const MAX_PAGE_MM = 14000;
/** Reference PDF cap — beyond this it scales down to A4 for readability. */
const REFERENCE_PAGE_CAP_MM = 4800;

function ascii(s: string): string {
    return s
        .replace(/[×✕✖]/g, 'x')
        .replace(/÷/g, '/')
        .replace(/[—–]/g, '-')
        .replace(/°/g, ' deg')
        .replace(/[·•]/g, '|')
        .replace(/…/g, '...')
        .replace(/[^\x20-\x7E]/g, '')
        .trim();
}

interface PdfOptions {
    sectionExport: SectionedExport;
    params: PanelParams;
    /** Per-section path arrays, already in export-sheet coords. */
    apertureBySection?: FlatPath[][];
    keylineBySection?: FlatPath[][];
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
};

function drawHeaderBar(ctx: PageContext, title: string): void {
    const { doc, pageW, margin, params, pageNumber, totalPages } = ctx;
    const T = (s: string) => ascii(s);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(T(`ONESIGN  —  ${params.name}`), margin, margin);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(T(title), margin, margin + 5);
    const right = T(
        `${new Date().toLocaleDateString('en-GB')}    Page ${pageNumber} / ${totalPages}    Reference — NOT a cut file`,
    );
    doc.text(right, pageW - margin, margin + 5, { align: 'right' });
    doc.setTextColor(0);
    // Divider
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
    doc.line(margin, margin + 8, pageW - margin, margin + 8);
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
                ascii(
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
            ascii(`${Math.round(partH)} mm`),
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
    kind: 'cut' | 'vinyl' | 'acrylic' | 'solid' | 'standoff';
    label: string;
    color: [number, number, number];
    /** Brief specs for the right-side info strip. */
    specs: Array<[string, string]>;
    /** Per-section paths that belong to this material. */
    paths: FlatPath[];
    /** When true, this is a per-piece material — drawn as filled shapes. */
    pieces?: Array<MaterialPiece | StandoffPiece>;
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
    const T = (s: string) => ascii(s);
    drawHeaderBar(ctx, 'Overview — sign specification');

    const top = margin + 14;
    const colW = (pageW - margin * 2 - 8) / 2;

    // Left column: spec block
    const mode = params.apertureMode ?? 'aperture';
    const matLabel = params.materialLabel
        ? params.materialLabel.length > 30
            ? params.materialLabel.slice(0, 29) + '...'
            : params.materialLabel
        : '-';
    const apCount = (opts.apertureBySection ?? []).reduce(
        (a, arr) => a + arr.length,
        0,
    );
    const groupCount = (params.materialGroups ?? []).length;
    const spec: Array<[string, string]> = [
        ['Sign face', `${params.panelWidthMm} x ${params.panelHeightMm} mm`],
        ['Returns', returnsLabelCompact(params)],
        ['Return depth', `${params.returnDepthMm} mm`],
        [
            'Shadow gap',
            params.shadowGapMm > 0 ? `${params.shadowGapMm} mm` : '-',
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
            'Sheet layout',
            `${Math.round(opts.sectionExport.totalLayoutWMm)} x ${Math.round(opts.sectionExport.totalLayoutHMm)} mm`,
        ],
        [
            'Default for ungrouped',
            mode === 'standoff' ? 'Stood off' : 'Cut',
        ],
        [
            'Materials in use',
            `${apCount > 0 ? '1 cut' : 'No cuts'}, ${groupCount} group${
                groupCount === 1 ? '' : 's'
            }`,
        ],
    ];

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(T('SIGN SPECIFICATION'), margin, top);
    doc.setFont('helvetica', 'normal');
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
        doc.setFont('helvetica', 'bold');
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
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(T('MATERIALS IN THIS SIGN'), margin, matY);
    doc.setFont('helvetica', 'normal');
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
            if (y > pageH - margin - 6) return; // truncate if too many
            doc.text(T(r[0]), margin, y);
            doc.text(T(r[1]), margin + 50, y);
            doc.text(T(r[2]), margin + 130, y);
        });
    }
}

function drawFlatLayoutPage(ctx: PageContext): void {
    const { doc, pageW, pageH, margin, params, opts } = ctx;
    const T = (s: string) => ascii(s);
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
        doc.setFont('helvetica', 'bold');
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(
        T(
            `Scale 1:${scale < 1 ? Math.round(1 / scale) : '1'}  |  Blank ${Math.round(partW)} x ${Math.round(partH)} mm  |  Bend allowance: ${params.materialThicknessMm / 2} mm per side of every fold`,
        ),
        margin,
        pageH - margin + 4,
    );
    doc.setTextColor(0);
}

function drawMaterialPage(ctx: PageContext, spec: MaterialPageSpec): void {
    const { doc, pageW, pageH, margin, opts } = ctx;
    const T = (s: string) => ascii(s);
    drawHeaderBar(ctx, `${spec.label}`);

    // Specs strip on the right
    const specW = 76;
    const specX = pageW - margin - specW;
    const specY = margin + 14;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(T('MATERIAL'), specX, specY);
    doc.setFont('helvetica', 'normal');
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
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(110);
    doc.text(
        T(
            `Other materials shown faded for reference.  |  Scale 1:${scale < 1 ? Math.round(1 / scale) : '1'}`,
        ),
        margin,
        pageH - margin + 4,
    );
    doc.setTextColor(0);
}

export function generateReferencePdfBlob(opts: PdfOptions): Blob {
    const PAGE_W = 297;
    const PAGE_H = 210;
    const margin = 14;
    const doc = new jsPDF({
        unit: 'mm',
        format: 'a4',
        orientation: 'landscape',
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
export function generateProductionPdfBlob(opts: PdfOptions): Blob {
    const { sectionExport, params } = opts;
    const T = (s: string) => ascii(s);

    const M = 18; // page margin — also reserves space for the info strip
    const INFO_GAP = 6; // gap from the cut area to the info strip
    const partW = Math.max(1, sectionExport.totalLayoutWMm);
    const partH = Math.max(1, sectionExport.totalLayoutHMm);

    // Production is ALWAYS 1:1. CAM software reads the coordinates straight
    // off the PDF, so 1 mm on paper must equal 1 mm of metal — no reduced
    // fallback. If the panel is so large that the page would exceed PDF's
    // user-space limit, we throw rather than silently scaling.
    const PAGE_W = partW + 2 * M;
    const PAGE_H = partH + 2 * M;
    if (PAGE_W > MAX_PAGE_MM || PAGE_H > MAX_PAGE_MM) {
        throw new Error(
            `Production PDF would need a page ${Math.round(PAGE_W)}x${Math.round(PAGE_H)} mm, larger than the PDF user-space limit. Split the sign into smaller sections first.`,
        );
    }
    const scale = 1;
    const dX = M;
    const dY = M;
    const doc = new jsPDF({
        unit: 'mm',
        format: [PAGE_W, PAGE_H],
        orientation: PAGE_W >= PAGE_H ? 'landscape' : 'portrait',
    });

    const px = (x: number) => dX + x * scale;
    const py = (y: number) => dY + y * scale;

    // Hairline stroke that scales mildly with part size, capped well
    // below any sensible kerf so no CAM interpretation widens the cut.
    //   200 mm part → 0.05 mm   1 m → 0.20 mm   4 m → 0.20 mm (capped)
    const maxPart = Math.max(partW, partH);
    const productionStroke = Math.max(0.05, Math.min(0.2, maxPart / 5000));

    // Project every section's geometry in export-sheet coords.
    //
    // When the design uses a KEYLINE (push-through letters), the
    // panel is cut along the KEYLINE — slightly larger than the
    // letter — so a separate push-through insert can sit in the
    // hole with a clean shoulder. The original aperture letter
    // shapes get cut from a different material (acrylic etc.) and
    // pushed through from behind. Those push-through cuts go on
    // their own page below the panel layout.
    //
    // When there is NO keyline, the panel is cut along the
    // aperture itself and there are no push-through inserts.
    sectionExport.sections.forEach((section, i) => {
        const ox = section.layoutOriginXMm;
        const sectionAp = opts.apertureBySection?.[i] ?? [];
        const sectionKl = opts.keylineBySection?.[i] ?? [];
        const panelCuts = sectionKl.length > 0 ? sectionKl : sectionAp;
        const sectionFx = opts.fixingsBySection?.[i] ?? [];

        // Outer perimeter — one continuous welded closed contour.
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
            // Degenerate fallback — per-segment rectangles. Validation
            // upstream warns the user before they reach this state.
            for (const seg of section.development.segments) {
                doc.rect(
                    px(seg.xMm + ox),
                    py(seg.yMm),
                    seg.wMm * scale,
                    seg.hMm * scale,
                );
            }
        }

        // Panel cut(s) — the actual line the cutter follows on the
        // panel. Keyline when present (push-through), else aperture.
        for (const ap of panelCuts) {
            const pts = ap.points.map(
                ([x, y]) => [px(x), py(y)] as [number, number],
            );
            if (ap.closed) drawClosedPolyline(doc, pts, 'S');
            else {
                // Open paths (rare): emit as a single open polyline.
                if (pts.length < 2) continue;
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

        // Stand-off fixings — single circle per hole, naturally welded.
        for (const f of sectionFx) {
            const cx =
                f.points.reduce((a, q) => a + q[0], 0) / f.points.length;
            const cy =
                f.points.reduce((a, q) => a + q[1], 0) / f.points.length;
            const rMm =
                f.points.reduce(
                    (a, q) => a + Math.hypot(q[0] - cx, q[1] - cy),
                    0,
                ) / f.points.length;
            doc.circle(px(cx), py(cy), rMm * scale, 'S');
        }
    });

    // Tiny info strip in the bottom margin — out of the way of the cuts.
    const widthsLabel = sectionExport.sections
        .map((s) => Math.round(s.sectionWidthMm))
        .join(' / ');
    const info = [
        `ONESIGN`,
        params.name,
        params.materialLabel || 'material -',
        `${params.materialThicknessMm} mm`,
        `face ${params.panelWidthMm}x${params.panelHeightMm} mm`,
        sectionExport.sections.length > 1
            ? `sections ${widthsLabel} mm`
            : `1 panel`,
        new Date().toLocaleDateString('en-GB'),
        '1:1',
    ]
        .filter(Boolean)
        .join('  |  ');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(
        T(info),
        dX,
        Math.min(PAGE_H - 4, dY + partH * scale + INFO_GAP),
    );
    doc.setTextColor(0);

    // ---- Page 2: push-through insert cuts ----------------------------
    // When the design uses a keyline, the actual letter shapes (the
    // SVG aperture paths) are cut from the push-through material —
    // typically a coloured / illuminated acrylic — and pushed through
    // the larger keyline holes in the panel from behind. Emit them as
    // their own welded contours on a separate page so the CAM operator
    // gets a clean cut file for the insert material.
    const hasKeyline =
        (opts.keylineBySection ?? []).some((arr) => arr.length > 0);
    const allApertures: FlatPath[] = (opts.apertureBySection ?? []).flatMap(
        (arr) => arr,
    );
    if (hasKeyline && allApertures.length > 0) {
        // Bounding box of the insert layout so we can size the page.
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of allApertures) {
            for (const [x, y] of p.points) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        const insertW = Math.max(1, maxX - minX);
        const insertH = Math.max(1, maxY - minY);
        // 1:1 page, same margin as the panel cut page.
        const insertPageW = insertW + 2 * M;
        const insertPageH = insertH + 2 * M;
        if (
            insertPageW <= MAX_PAGE_MM &&
            insertPageH <= MAX_PAGE_MM
        ) {
            doc.addPage(
                [insertPageW, insertPageH],
                insertPageW >= insertPageH ? 'landscape' : 'portrait',
            );
            const ipx = (x: number) => M + (x - minX);
            const ipy = (y: number) => M + (y - minY);
            doc.setDrawColor(0);
            doc.setLineWidth(productionStroke);
            for (const ap of allApertures) {
                const pts = ap.points.map(
                    ([x, y]) => [ipx(x), ipy(y)] as [number, number],
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
            // Info strip
            const insertInfo = [
                'ONESIGN',
                params.name,
                'PUSH-THROUGH INSERTS',
                `${allApertures.length} piece${allApertures.length === 1 ? '' : 's'}`,
                `bounding box ${Math.round(insertW)} x ${Math.round(insertH)} mm`,
                new Date().toLocaleDateString('en-GB'),
                '1:1',
            ].join('  |  ');
            doc.setFontSize(8);
            doc.setTextColor(110);
            doc.text(T(insertInfo), M, M + insertH + INFO_GAP);
            doc.setTextColor(0);
        }
    }

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
