/**
 * Built-up returns cut sheet (A4 landscape, jsPDF).
 *
 * Page 1 — the fabricator's working sheet: the letter faces drawn to fit with a
 * numbered balloon per contour and a dot at every weld (corner break, stock
 * join, or the closing butt-weld of a smooth loop), the live 3D built-up
 * preview (when one was captured), a per-contour summary table, the spec, and a
 * legend.
 *
 * Page 2 — the STRIP SCHEDULE: every welded strip listed under its contour with
 * its developed (bent) length and the joint that ends it, so the brass can be
 * cut + welded straight off the sheet. This is what replaces measuring each
 * path by hand and guessing strip counts.
 *
 * Browser-only (jsPDF). Callers are client components.
 */

import { jsPDF } from 'jspdf';
import { registerVisualiserFonts } from './pdf-fonts';
import {
    formatMm,
    formatM,
    type ReturnsAnalysis,
    type ReturnsConfig,
    type ReturnContour,
    type StripEndReason,
} from './returns';

const ACCENT: [number, number, number] = [78, 126, 140]; // #4e7e8c
const INK: [number, number, number] = [26, 31, 35];
const WELD: [number, number, number] = [212, 102, 26]; // amber
const PAGE_W = 297;
const PAGE_H = 210;
const margin = 14;

export interface ReturnsPdfOptions {
    name: string;
    analysis: ReturnsAnalysis;
    config: ReturnsConfig;
    /** Trimmed PNG of the live 3D built-up preview. Omitted → no preview box. */
    snapshotDataUrl?: string | null;
}

/** Short joint tag for the strip schedule (what ends each strip). */
function jointLabel(reason: StripEndReason): string {
    if (reason === 'corner') return 'corner';
    if (reason === 'stock') return 'stock';
    return 'seam';
}

function fitScale(w: number, h: number, partW: number, partH: number): number {
    return Math.min(w / Math.max(partW, 1e-6), h / Math.max(partH, 1e-6));
}

function drawContour(
    doc: jsPDF,
    c: ReturnContour,
    px: (x: number) => number,
    py: (y: number) => number,
) {
    const pts = c.points;
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(0.5);
    for (let i = 1; i < pts.length; i++) {
        doc.line(px(pts[i - 1][0]), py(pts[i - 1][1]), px(pts[i][0]), py(pts[i][1]));
    }
    if (c.closed && pts.length > 1) {
        const a = pts[0];
        const b = pts[pts.length - 1];
        doc.line(px(b[0]), py(b[1]), px(a[0]), py(a[1]));
    }
    // Weld dots.
    doc.setFillColor(WELD[0], WELD[1], WELD[2]);
    for (const w of c.weldPoints) {
        doc.circle(px(w[0]), py(w[1]), 0.7, 'F');
    }
}

/** Teal page header band shared by both pages. */
function headerBar(
    doc: jsPDF,
    font: string,
    title: string,
    name: string,
    analysis: ReturnsAnalysis,
) {
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(0, 0, PAGE_W, 18, 'F');
    doc.setTextColor(255);
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(title, margin, 11.5);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(name, PAGE_W - margin, 6.5, { align: 'right' });
    doc.text(
        `${analysis.faceCount} face${analysis.faceCount === 1 ? '' : 's'}  ·  ${analysis.stripCount} strip${analysis.stripCount === 1 ? '' : 's'}  ·  ${analysis.weldCount} weld${analysis.weldCount === 1 ? '' : 's'}`,
        PAGE_W - margin,
        11.5,
        { align: 'right' },
    );
    doc.setFontSize(8);
    doc.text(
        `TOTAL RETURN ${formatMm(analysis.totalReturnLengthMm)} (${formatM(analysis.totalReturnLengthMm)})`,
        PAGE_W - margin,
        15.5,
        { align: 'right' },
    );
    doc.setTextColor(0);
}

export async function generateReturnsPdfBlob(
    opts: ReturnsPdfOptions,
): Promise<Blob> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const fontRes = await registerVisualiserFonts(doc);
    const font = fontRes.family;
    const { analysis, config } = opts;

    doc.setProperties({
        title: `${opts.name} — built-up returns`,
        subject: 'Built-up letter return take-off',
        author: 'Onesign Odysseus',
        keywords: 'built-up, returns, brass, letters, signage, onesign',
    });

    // =====================================================================
    // PAGE 1 — working sheet
    // =====================================================================
    headerBar(doc, font, 'BUILT-UP RETURNS · CUT SHEET', opts.name, analysis);

    // ---- Layout regions ----------------------------------------------
    const tableW = 104;
    const tableX = PAGE_W - margin - tableW;
    const top = 24;
    const drawW = tableX - 8 - margin;
    const drawH = PAGE_H - top - margin;

    // ---- 3D preview (top of the right column, when captured) ----------
    let tableTop = top;
    if (opts.snapshotDataUrl) {
        try {
            const props = doc.getImageProperties(opts.snapshotDataUrl);
            const boxW = tableW;
            const boxMaxH = 50;
            const ar = props.width / Math.max(1, props.height);
            let imgW = boxW;
            let imgH = imgW / ar;
            if (imgH > boxMaxH) {
                imgH = boxMaxH;
                imgW = imgH * ar;
            }
            doc.setFont(font, 'bold');
            doc.setFontSize(7.5);
            doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
            doc.text('BUILT-UP PREVIEW', tableX, top + 2);
            doc.setTextColor(0);
            const imgX = tableX + (boxW - imgW) / 2;
            const imgY = top + 4;
            doc.addImage(
                opts.snapshotDataUrl,
                'PNG',
                imgX,
                imgY,
                imgW,
                imgH,
                undefined,
                'FAST',
            );
            doc.setDrawColor(210);
            doc.setLineWidth(0.2);
            doc.rect(imgX, imgY, imgW, imgH);
            doc.setFont(font, 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(120);
            doc.text(
                `${Math.round(config.returnDepthMm)} mm returns`,
                tableX + boxW,
                imgY + imgH + 3,
                { align: 'right' },
            );
            doc.setTextColor(0);
            tableTop = imgY + imgH + 6;
        } catch {
            // Bad/again unreadable capture — silently fall back to no preview.
            tableTop = top;
        }
    }

    const bb = analysis.bbox;
    const partW = Math.max(1, bb.maxX - bb.minX);
    const partH = Math.max(1, bb.maxY - bb.minY);
    const scale = fitScale(drawW, drawH, partW, partH);
    const dX = margin + (drawW - partW * scale) / 2;
    const dY = top + (drawH - partH * scale) / 2;
    const px = (x: number) => dX + (x - bb.minX) * scale;
    const py = (y: number) => dY + (y - bb.minY) * scale;

    // ---- Drawing (faces + weld dots + balloons) -----------------------
    for (const c of analysis.contours) drawContour(doc, c, px, py);

    const R = 3;
    doc.setFontSize(7.5);
    for (const c of analysis.contours) {
        const cx = px(c.centroid[0]);
        const cy = py(c.centroid[1]);
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.circle(cx, cy, R, 'F');
        doc.setTextColor(255);
        doc.setFont(font, 'bold');
        doc.text(String(c.index), cx, cy + 1.1, { align: 'center' });
    }
    doc.setTextColor(0);

    // ---- Table divider ------------------------------------------------
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(tableX - 4, top, tableX - 4, PAGE_H - margin);

    // Column anchors.
    const cIdx = tableX;
    const cType = tableX + 8;
    const cLen = tableX + tableW - 30;
    const cStrips = tableX + tableW - 14;
    const cWelds = tableX + tableW;

    doc.setFont(font, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('#', cIdx, tableTop + 2);
    doc.text('TYPE', cType, tableTop + 2);
    doc.text('LENGTH', cLen, tableTop + 2, { align: 'right' });
    doc.text('STR', cStrips, tableTop + 2, { align: 'right' });
    doc.text('WLD', cWelds, tableTop + 2, { align: 'right' });
    doc.setDrawColor(180);
    doc.line(tableX, tableTop + 4, tableX + tableW, tableTop + 4);

    const headerBottom = tableTop + 4;
    const footerBlock = 22;
    const availH = PAGE_H - margin - headerBottom - footerBlock;
    const rowH = 5;
    const rowsMax = Math.max(1, Math.floor(availH / rowH));
    let shown = 0;
    doc.setFontSize(7.5);
    for (let i = 0; i < analysis.contours.length && i < rowsMax; i++) {
        const c = analysis.contours[i];
        const yy = headerBottom + 4 + i * rowH;
        doc.setFont(font, 'bold');
        doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.text(String(c.index), cIdx, yy);
        doc.setFont(font, 'normal');
        doc.setTextColor(0);
        doc.text(c.kind === 'counter' ? 'counter' : 'face', cType, yy);
        doc.text(formatMm(c.perimeterMm), cLen, yy, { align: 'right' });
        doc.text(String(c.strips.length), cStrips, yy, { align: 'right' });
        doc.text(String(c.weldCount), cWelds, yy, { align: 'right' });
        shown++;
    }

    // ---- Totals -------------------------------------------------------
    const totalY =
        headerBottom + 4 + Math.min(analysis.contours.length, rowsMax) * rowH + 3;
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.4);
    doc.line(tableX, totalY - 3, tableX + tableW, totalY - 3);
    doc.setFont(font, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('TOTAL', cIdx, totalY);
    doc.text(formatMm(analysis.totalReturnLengthMm), cLen, totalY, {
        align: 'right',
    });
    doc.text(String(analysis.stripCount), cStrips, totalY, { align: 'right' });
    doc.text(String(analysis.weldCount), cWelds, totalY, { align: 'right' });
    doc.setTextColor(0);

    if (shown < analysis.contours.length) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(180, 60, 60);
        doc.text(
            `+${analysis.contours.length - shown} more — full list on the strip schedule`,
            cIdx,
            totalY + 4,
        );
        doc.setTextColor(0);
    }

    // ---- Spec strip ---------------------------------------------------
    const specY = PAGE_H - margin - 8;
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.line(tableX, specY - 4, tableX + tableW, specY - 4);
    doc.setFont(font, 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(90);
    doc.text(
        `Depth ${Math.round(config.returnDepthMm)} mm · ${config.materialThicknessMm} mm gauge`,
        tableX,
        specY,
    );
    doc.text(
        `Break ≥${Math.round(config.breakAngleDeg)}° · stock ${formatMm(config.stockLengthMm)}`,
        tableX,
        specY + 4,
    );
    doc.setTextColor(0);

    // ---- Legend + footer (bottom of the drawing area) -----------------
    const legendY = PAGE_H - margin + 1.5;
    doc.setFillColor(WELD[0], WELD[1], WELD[2]);
    doc.circle(margin + 1, legendY - 1, 1, 'F');
    doc.setFont(font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
        'weld — sharp corner, stock join, or the closing butt-weld of a smooth loop.',
        margin + 4,
        legendY,
    );
    doc.text(
        `Returns wrap the outer edge and every counter (${Math.round(config.returnDepthMm)} mm deep). Allow for offcuts when ordering strip.`,
        margin + 4,
        legendY + 3.5,
    );
    doc.setTextColor(0);

    // =====================================================================
    // PAGE 2 — strip schedule (every welded strip, grouped by contour)
    // =====================================================================
    if (analysis.stripCount > 0) {
        doc.addPage('a4', 'landscape');
        headerBar(
            doc,
            font,
            'BUILT-UP RETURNS · STRIP SCHEDULE',
            opts.name,
            analysis,
        );

        const top2 = 24;
        const bottom2 = PAGE_H - margin;
        const colCount = 3;
        const colGap = 8;
        const colW = (PAGE_W - 2 * margin - (colCount - 1) * colGap) / colCount;
        const colX = (col: number) => margin + col * (colW + colGap);
        const headH = 6.4;
        const lineH = 4.3;

        // Flatten contours into a row stream: a header per contour, then one
        // row per strip. Flow top→bottom, wrap to the next column, then page.
        type Row =
            | { kind: 'head'; c: ReturnContour }
            | {
                  kind: 'strip';
                  cIndex: number;
                  n: number;
                  lengthMm: number;
                  reason: StripEndReason;
              };
        const rows: Row[] = [];
        for (const c of analysis.contours) {
            rows.push({ kind: 'head', c });
            c.strips.forEach((s) =>
                rows.push({
                    kind: 'strip',
                    cIndex: c.index,
                    n: s.index,
                    lengthMm: s.lengthMm,
                    reason: s.endReason,
                }),
            );
        }

        let col = 0;
        let y = top2 + 2;
        for (const row of rows) {
            const need = row.kind === 'head' ? headH : lineH;
            if (y + need > bottom2) {
                col++;
                y = top2 + 2;
                if (col >= colCount) {
                    doc.addPage('a4', 'landscape');
                    headerBar(
                        doc,
                        font,
                        'BUILT-UP RETURNS · STRIP SCHEDULE',
                        opts.name,
                        analysis,
                    );
                    col = 0;
                    y = top2 + 2;
                }
            }
            const x = colX(col);
            if (row.kind === 'head') {
                const c = row.c;
                doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
                doc.circle(x + 2, y + 1, 2, 'F');
                doc.setTextColor(255);
                doc.setFont(font, 'bold');
                doc.setFontSize(6.5);
                doc.text(String(c.index), x + 2, y + 1.9, { align: 'center' });
                doc.setTextColor(INK[0], INK[1], INK[2]);
                doc.setFontSize(8);
                doc.text(
                    `${c.kind === 'counter' ? 'Counter' : 'Face'} ${c.index}`,
                    x + 6,
                    y + 2,
                );
                doc.setFont(font, 'normal');
                doc.setTextColor(110);
                doc.setFontSize(7);
                doc.text(formatMm(c.perimeterMm), x + colW, y + 2, {
                    align: 'right',
                });
                doc.setTextColor(0);
                doc.setDrawColor(210);
                doc.setLineWidth(0.2);
                doc.line(x, y + 3.6, x + colW, y + 3.6);
                y += headH;
            } else {
                doc.setFont(font, 'normal');
                doc.setFontSize(7.5);
                doc.setTextColor(150);
                doc.text(`s${row.n}`, x + 1, y);
                doc.setTextColor(40);
                doc.text(formatMm(row.lengthMm), x + colW - 20, y, {
                    align: 'right',
                });
                doc.setTextColor(
                    WELD[0],
                    WELD[1],
                    WELD[2],
                );
                doc.text(jointLabel(row.reason), x + colW, y, {
                    align: 'right',
                });
                doc.setTextColor(0);
                y += lineH;
            }
        }
    }

    return doc.output('blob');
}
