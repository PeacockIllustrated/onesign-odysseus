/**
 * Built-up returns cut sheet (A4 landscape, jsPDF).
 *
 * One page the fabricator works from: the letter faces drawn to fit with a
 * numbered balloon per contour and a dot at every weld (corner break, stock
 * join, or the closing butt-weld of a smooth loop), plus a table of each
 * contour's return length / strip count / weld count and the job totals. This
 * is what replaces measuring each path by hand and guessing strip counts.
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

    // ---- Header bar ---------------------------------------------------
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(0, 0, PAGE_W, 18, 'F');
    doc.setTextColor(255);
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text('BUILT-UP RETURNS · CUT SHEET', margin, 11.5);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(opts.name, PAGE_W - margin, 6.5, { align: 'right' });
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

    // ---- Layout regions ----------------------------------------------
    const tableW = 104;
    const tableX = PAGE_W - margin - tableW;
    const top = 24;
    const drawW = tableX - 8 - margin;
    const drawH = PAGE_H - top - margin;

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
    doc.text('#', cIdx, top + 2);
    doc.text('TYPE', cType, top + 2);
    doc.text('LENGTH', cLen, top + 2, { align: 'right' });
    doc.text('STR', cStrips, top + 2, { align: 'right' });
    doc.text('WLD', cWelds, top + 2, { align: 'right' });
    doc.setDrawColor(180);
    doc.line(tableX, top + 4, tableX + tableW, top + 4);

    const headerBottom = top + 4;
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
    const totalY = headerBottom + 4 + Math.min(analysis.contours.length, rowsMax) * rowH + 3;
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
            `+${analysis.contours.length - shown} more — TOTAL above is complete`,
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

    // ---- Footer -------------------------------------------------------
    doc.setFont(font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
        'Amber dots mark welds (sharp corner, stock join, or the closing butt-weld of a smooth loop). Returns wrap the outer edge and every counter. Allow for offcuts when ordering strip.',
        margin,
        PAGE_H - margin + 4,
    );
    doc.setTextColor(0);

    return doc.output('blob');
}
