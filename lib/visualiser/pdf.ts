/**
 * Dimensioned PDF shop drawing — TRUE 1:1.
 *
 * The page is sized to the actual flat blank so 1 mm on paper = 1 mm of
 * metal: the shop can measure straight off it or use it as a full-size
 * template. The part is drawn at scale 1; an info column carries the spec,
 * a colour legend (so nobody mistakes a fold for a cut) and the 3D
 * thumbnail. If a part is so large it would exceed the PDF page limit we
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
} from './types';
import { outlinePerimeter } from './geometry';

/** PDF media box limit is ~5080 mm; stay safely under it. */
const MAX_PAGE_MM = 4800;

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
    /** PNG/JPEG data URL of the 3D preview, optional. */
    thumbnailDataUrl?: string;
}

export function generatePdfBlob(opts: PdfOptions): Blob {
    const { sectionExport, params } = opts;
    const T = (s: string) => ascii(s);

    const M = 18; // page margin
    const COL_W = 86; // left info column
    const partW = Math.max(1, sectionExport.totalLayoutWMm);
    const partH = Math.max(1, sectionExport.totalLayoutHMm);
    const isSplit = sectionExport.sections.length > 1;

    // Drawing origin leaves room for the left column + the vertical dim.
    const drawX = M + COL_W + 16;
    const drawY = M + 18;

    // How tall the info column needs to be (fixed line steps + thumbnail).
    const specRows = 10; // matches the `spec` array length below
    let infoBottom = M + 13 + specRows * 5.2;
    if (isSplit) infoBottom += 6;
    infoBottom += 14; // bend note
    infoBottom += 6 + 5 * 5; // legend header + 5 rows
    const hasThumb = !!opts.thumbnailDataUrl;
    if (hasThumb) infoBottom += 52;
    const infoColH = infoBottom + M;

    // Prefer true 1:1; fall back to a reduced A4 only if the part is huge.
    const oneToOneW = drawX + partW + M + 18;
    const oneToOneH = Math.max(infoColH, drawY + partH + 26) + M;
    const oneToOne =
        oneToOneW <= MAX_PAGE_MM && oneToOneH <= MAX_PAGE_MM;

    let PAGE_W: number;
    let PAGE_H: number;
    let scale: number;
    let dX = drawX;
    let dY = drawY;
    let doc: jsPDF;

    if (oneToOne) {
        PAGE_W = oneToOneW;
        PAGE_H = oneToOneH;
        scale = 1;
        doc = new jsPDF({
            unit: 'mm',
            format: [PAGE_W, PAGE_H],
            orientation: PAGE_W >= PAGE_H ? 'landscape' : 'portrait',
        });
    } else {
        PAGE_W = 297;
        PAGE_H = 210;
        doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
        dX = M + COL_W + 6;
        dY = M + 22;
        const drawW = PAGE_W - dX - M - 14;
        const drawH = PAGE_H - dY - M - 12;
        scale = Math.min(drawW / partW, drawH / partH);
    }

    const px = (x: number) => dX + x * scale;
    const py = (y: number) => dY + y * scale;

    // Annotation scaling — at 1:1 a fixed 7pt label on a 10 m part is
    // unreadable, so dimensions/ticks/line-weights scale with part size.
    const maxPart = Math.max(partW, partH) * scale;
    const ann = Math.min(28, Math.max(1, maxPart / 380));
    const dimFont = Math.min(96, Math.max(8, maxPart * 0.022));
    const tick = 1.4 * ann;
    const dimOff = 9 * ann;
    const cutLW = 0.4 * Math.min(8, Math.max(1, ann));
    const refLW = 0.3 * Math.min(8, Math.max(1, ann));
    const dash = 1.6 * Math.min(6, Math.max(1, ann));

    // ---- Header --------------------------------------------------------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(T(`Onesign Panel - ${params.name}`), M, M);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(
        T(
            `Production shop drawing | NOT a cut file | ${new Date().toLocaleDateString('en-GB')}`,
        ),
        M,
        M + 5,
    );
    doc.setTextColor(0);

    // ---- Spec block ----------------------------------------------------
    const matLabel = params.materialLabel
        ? params.materialLabel.length > 30
            ? params.materialLabel.slice(0, 29) + '...'
            : params.materialLabel
        : '-';
    const specY = M + 13;
    const mode = params.apertureMode ?? 'aperture';
    const fixingD =
        params.fixingDiameterMm ??
        (params.fixingRadiusMm ? params.fixingRadiusMm * 2 : 10);
    const nFixings = (opts.fixingsBySection ?? []).reduce(
        (a, arr) => a + arr.length,
        0,
    );
    const artworkRow: [string, string] =
        mode === 'standoff'
            ? [
                  'Artwork',
                  `Stand-off  |  ${nFixings} x ${fixingD.toFixed(1)} mm fixings`,
              ]
            : ['Artwork', 'Aperture cut'];

    const spec: Array<[string, string]> = [
        ['Sign face', `${params.panelWidthMm} x ${params.panelHeightMm} mm`],
        ['Returns', returnsLabel(params)],
        ['Return depth', `${params.returnDepthMm} mm`],
        ['Shadow gap', params.shadowGapMm > 0 ? `${params.shadowGapMm} mm` : '-'],
        artworkRow,
        ['Keyline', mode === 'standoff' || params.keylineMm <= 0 ? '-' : `${params.keylineMm} mm`],
        ['Material', matLabel],
        ['Thickness', `${params.materialThicknessMm} mm`],
        [
            'Sections',
            isSplit
                ? `${sectionExport.sections.length} (centre full)`
                : 'Single panel',
        ],
        [
            'Sheet layout',
            `${Math.round(sectionExport.totalLayoutWMm)} x ${Math.round(sectionExport.totalLayoutHMm)} mm`,
        ],
    ];
    doc.setFontSize(8);
    spec.forEach(([k, v], i) => {
        const y = specY + i * 5.2;
        doc.setFont('helvetica', 'bold');
        doc.text(T(k), M, y);
        doc.setFont('helvetica', 'normal');
        doc.text(T(v), M + 26, y);
    });
    let cursorY = specY + spec.length * 5.2 + 2;

    if (isSplit) {
        doc.setFontSize(7);
        doc.setTextColor(90);
        const widths = sectionExport.sections
            .map((s) => Math.round(s.sectionWidthMm))
            .join(' / ');
        doc.text(T(`Section widths: ${widths} mm`), M, cursorY, {
            maxWidth: COL_W,
        });
        doc.setTextColor(0);
        cursorY += 6;
    }

    doc.setFontSize(7);
    doc.setTextColor(90);
    doc.text(
        T(
            'Bend allowance: half the material thickness is deducted from each side of every fold line.',
        ),
        M,
        cursorY,
        { maxWidth: COL_W },
    );
    doc.setTextColor(0);
    cursorY += 12;

    // ---- Legend --------------------------------------------------------
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('LEGEND', M, cursorY);
    doc.setFont('helvetica', 'normal');
    cursorY += 4;
    const apCount = (opts.apertureBySection ?? []).reduce(
        (a, arr) => a + arr.length,
        0,
    );
    const klCount = (opts.keylineBySection ?? []).reduce(
        (a, arr) => a + arr.length,
        0,
    );
    const refCount = (opts.referenceBySection ?? []).reduce(
        (a, arr) => a + arr.length,
        0,
    );
    const legend: Array<{
        rgb: [number, number, number];
        dash: number[];
        label: string;
        w: number;
    }> = [
        { rgb: [20, 20, 20], dash: [], label: 'Cut outline', w: 0.5 },
        {
            rgb: [200, 0, 0],
            dash: [1.2, 1.2],
            label: 'Fold line - DO NOT CUT',
            w: 0.4,
        },
    ];
    if (apCount > 0) {
        legend.push({
            rgb: [30, 90, 200],
            dash: [],
            label: 'Aperture cut',
            w: 0.35,
        });
    }
    if (nFixings > 0) {
        legend.push({
            rgb: [30, 90, 200],
            dash: [],
            label: 'Stand-off fixing hole (cut)',
            w: 0.5,
        });
    }
    if (refCount > 0) {
        legend.push({
            rgb: [156, 163, 175],
            dash: [0.8, 0.8],
            label: 'Lettering position (NOT cut)',
            w: 0.35,
        });
    }
    if (klCount > 0) {
        legend.push({
            rgb: [0, 170, 190],
            dash: [0.8, 0.8],
            label: 'Keyline (register)',
            w: 0.35,
        });
    }
    // Pad so the layout reserves a consistent block; keeps info column tidy
    while (legend.length < 5) {
        legend.push({
            rgb: [255, 255, 255],
            dash: [],
            label: '',
            w: 0,
        });
    }
    doc.setFontSize(7);
    legend.forEach((l, i) => {
        const y = cursorY + i * 5;
        doc.setDrawColor(l.rgb[0], l.rgb[1], l.rgb[2]);
        doc.setLineWidth(l.w);
        doc.setLineDashPattern(l.dash, 0);
        doc.line(M, y - 1, M + 10, y - 1);
        doc.setLineDashPattern([], 0);
        doc.setTextColor(40);
        doc.text(T(l.label), M + 13, y);
    });
    doc.setTextColor(0);
    cursorY += 5 * 5 + 4;

    // ---- 3D thumbnail (in the info column) ----------------------------
    if (hasThumb && opts.thumbnailDataUrl) {
        const tw = 64;
        const th = 44;
        try {
            doc.addImage(
                opts.thumbnailDataUrl,
                'PNG',
                M,
                cursorY,
                tw,
                th,
                undefined,
                'FAST',
            );
            doc.setDrawColor(210);
            doc.setLineWidth(0.2);
            doc.rect(M, cursorY, tw, th);
        } catch {
            /* thumbnail is best-effort */
        }
    }

    // ---- Flat development drawing -------------------------------------
    const scaleText = oneToOne
        ? '1:1 (true size)'
        : `1:${Math.round(1 / scale)} (reduced to fit A4)`;
    const layoutCaption = isSplit
        ? `Cut sheet  |  scale ${scaleText}  |  ${sectionExport.sections.length} sections side-by-side, total ${Math.round(sectionExport.totalLayoutWMm)} x ${Math.round(sectionExport.totalLayoutHMm)} mm`
        : `Flat development  |  scale ${scaleText}  |  blank ${Math.round(sectionExport.totalLayoutWMm)} x ${Math.round(sectionExport.totalLayoutHMm)} mm`;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(T(layoutCaption), dX, dY - 6);
    doc.setFont('helvetica', 'normal');

    // Each section gets its own perimeter + folds, drawn at its layout
    // origin. The per-section aperture / fixings / keyline / reference
    // arrays are already translated into export-sheet coords.
    sectionExport.sections.forEach((section, i) => {
        const ox = section.layoutOriginXMm;
        const sectionAp = opts.apertureBySection?.[i] ?? [];
        const sectionFx = opts.fixingsBySection?.[i] ?? [];
        const sectionKl = opts.keylineBySection?.[i] ?? [];
        const sectionRef = opts.referenceBySection?.[i] ?? [];

        // Cut outline (solid).
        doc.setDrawColor(20);
        doc.setLineWidth(cutLW);
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

        // Fold lines — red dashed (reference, NOT a cut).
        doc.setDrawColor(200, 0, 0);
        doc.setLineWidth(refLW);
        doc.setLineDashPattern([dash, dash], 0);
        for (const f of section.development.foldLines) {
            doc.line(
                px(f.x1 + ox),
                py(f.y1),
                px(f.x2 + ox),
                py(f.y2),
            );
        }
        doc.setLineDashPattern([], 0);

        // Reference lettering outline (standoff, non-cut, light dashed).
        if (sectionRef.length) {
            doc.setLineDashPattern([dash * 0.8, dash * 0.8], 0);
            drawPaths(doc, sectionRef, px, py, [156, 163, 175], refLW * 0.7);
            doc.setLineDashPattern([], 0);
        }

        // Aperture (blue) + keyline (cyan).
        drawPaths(doc, sectionAp, px, py, [30, 90, 200], cutLW * 0.8);
        drawPaths(doc, sectionKl, px, py, [0, 170, 190], refLW * 0.8);

        // Stand-off fixings (filled blue dots).
        if (sectionFx.length) {
            doc.setFillColor(30, 90, 200);
            doc.setDrawColor(30, 90, 200);
            doc.setLineWidth(cutLW * 0.6);
            for (const p of sectionFx) {
                const cx =
                    p.points.reduce((a, q) => a + q[0], 0) / p.points.length;
                const cy =
                    p.points.reduce((a, q) => a + q[1], 0) / p.points.length;
                const rMm =
                    p.points.reduce(
                        (a, q) => a + Math.hypot(q[0] - cx, q[1] - cy),
                        0,
                    ) / p.points.length;
                doc.circle(px(cx), py(cy), rMm * scale, 'FD');
            }
        }

        // Section label (only when split) + per-section width dim line.
        const sFace = section.development.segments.find(
            (s) => s.role === 'face',
        );
        if (sFace) {
            doc.setTextColor(70);
            if (isSplit) {
                doc.setFontSize(Math.max(9, dimFont * 0.85));
                doc.setFont('helvetica', 'bold');
                doc.text(
                    T(
                        `SECTION ${section.index + 1} / ${section.count}  -  ${Math.round(section.sectionWidthMm)} x ${Math.round(section.development.faceNominalHMm)} mm`,
                    ),
                    px(sFace.xMm + sFace.wMm / 2 + ox),
                    py(sFace.yMm + sFace.hMm / 2),
                    { align: 'center' },
                );
                doc.setFont('helvetica', 'normal');
            }
            dimH(
                doc,
                px(ox),
                px(ox + section.development.totalFlatWMm),
                py(section.development.totalFlatHMm) + dimOff,
                T(`${Math.round(section.development.totalFlatWMm)} mm`),
                dimFont,
                tick,
            );
            doc.setTextColor(0);
        }
    });

    // Single overall-height dim line on the left of the layout.
    doc.setTextColor(70);
    dimV(
        doc,
        py(0),
        py(partH),
        px(0) - dimOff,
        T(`${Math.round(partH)} mm`),
        dimFont,
        tick,
    );
    doc.setTextColor(0);

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

export function pdfFilename(params: PanelParams): string {
    const safe = params.name
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '');
    return `${safe || 'panel'}-${Math.round(params.panelWidthMm)}x${Math.round(
        params.panelHeightMm,
    )}-shop.pdf`;
}
