/**
 * Annotated neon-flex run-length PDF.
 *
 * One A4 landscape sheet: the artwork drawn 1:1-to-fit with a numbered balloon
 * on every measured element (a leader from the balloon to the element centre,
 * so it's unambiguous which run a length refers to — we can't name letters),
 * plus a length table (mm + m per balloon) and the grand total. This is the
 * sheet that replaces hand-copying each path length out of Illustrator.
 *
 * Browser-only (jsPDF). Callers are client components.
 */

import { jsPDF } from 'jspdf';
import { registerVisualiserFonts } from './pdf-fonts';
import { formatMm, formatM, totalLengthMm, type NeonElement } from './neon';

const ACCENT: [number, number, number] = [78, 126, 140]; // #4e7e8c
const INK: [number, number, number] = [26, 31, 35];

export interface NeonPdfOptions {
    name: string;
    elements: NeonElement[];
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
}

function fitScale(w: number, h: number, partW: number, partH: number): number {
    return Math.min(w / Math.max(partW, 1e-6), h / Math.max(partH, 1e-6));
}

export async function generateNeonPdfBlob(opts: NeonPdfOptions): Promise<Blob> {
    const PAGE_W = 297;
    const PAGE_H = 210;
    const margin = 14;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const fontRes = await registerVisualiserFonts(doc);
    const font = fontRes.family;
    const T = (s: string) => s;

    doc.setProperties({
        title: `${opts.name} — neon run lengths`,
        subject: 'Neon flex run-length take-off',
        author: 'Onesign Odysseus',
        keywords: 'neon, flex, length, signage, onesign',
    });

    const els = opts.elements;
    const total = totalLengthMm(els);

    // ---- Header bar ---------------------------------------------------
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(0, 0, PAGE_W, 18, 'F');
    doc.setTextColor(255);
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(T('NEON FLEX · RUN LENGTHS'), margin, 11.5);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(
        T(opts.name),
        PAGE_W - margin,
        7.5,
        { align: 'right' },
    );
    doc.text(
        T(
            `${els.length} run${els.length === 1 ? '' : 's'}  ·  TOTAL ${formatMm(total)} (${formatM(total)})`,
        ),
        PAGE_W - margin,
        13.5,
        { align: 'right' },
    );
    doc.setTextColor(0);

    // ---- Layout regions ----------------------------------------------
    // Drawing on the left, length table on the right.
    const tableW = 96;
    const tableX = PAGE_W - margin - tableW;
    const top = 24;
    const drawX0 = margin;
    const drawW = tableX - 8 - margin;
    const drawH = PAGE_H - top - margin;

    const partW = Math.max(1, opts.bbox.maxX - opts.bbox.minX);
    const partH = Math.max(1, opts.bbox.maxY - opts.bbox.minY);
    const scale = fitScale(drawW, drawH, partW, partH);
    const dX = drawX0 + (drawW - partW * scale) / 2;
    const dY = top + (drawH - partH * scale) / 2;
    const px = (x: number) => dX + (x - opts.bbox.minX) * scale;
    const py = (y: number) => dY + (y - opts.bbox.minY) * scale;

    // ---- Artwork --------------------------------------------------------
    doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.setLineWidth(0.5);
    for (const el of els) {
        const pts = el.points;
        for (let i = 1; i < pts.length; i++) {
            doc.line(px(pts[i - 1][0]), py(pts[i - 1][1]), px(pts[i][0]), py(pts[i][1]));
        }
        if (el.closed) {
            const a = pts[0];
            const b = pts[pts.length - 1];
            doc.line(px(b[0]), py(b[1]), px(a[0]), py(a[1]));
        }
    }

    // ---- Balloons + leaders --------------------------------------------
    // A numbered balloon offset up-left of each element's centre with a thin
    // leader back to a dot at the centre, so the number reads clear of the
    // stroke yet still points at its run.
    const R = 3.2; // balloon radius (mm)
    doc.setFontSize(7.5);
    for (const el of els) {
        const cx = px(el.centroid[0]);
        const cy = py(el.centroid[1]);
        const bx = cx - 6;
        const by = cy - 6;
        // leader
        doc.setDrawColor(INK[0], INK[1], INK[2]);
        doc.setLineWidth(0.2);
        doc.line(cx, cy, bx, by);
        // centre dot
        doc.setFillColor(INK[0], INK[1], INK[2]);
        doc.circle(cx, cy, 0.5, 'F');
        // balloon
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.circle(bx, by, R, 'F');
        doc.setTextColor(255);
        doc.setFont(font, 'bold');
        doc.text(String(el.index), bx, by + 1.1, { align: 'center' });
    }
    doc.setTextColor(0);

    // ---- Length table ---------------------------------------------------
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(tableX - 4, top, tableX - 4, PAGE_H - margin); // divider

    doc.setFont(font, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(T('RUN'), tableX, top + 2);
    doc.text(T('LENGTH'), tableX + 16, top + 2);
    doc.text(T('METRES'), tableX + tableW - 2, top + 2, { align: 'right' });
    doc.setDrawColor(180);
    doc.line(tableX, top + 4, tableX + tableW, top + 4);

    const rowH = 5.2;
    const headerBottom = top + 4;
    const footerBlock = 16; // reserve for total
    const availH = PAGE_H - margin - headerBottom - footerBlock;
    const rowsPerCol = Math.max(1, Math.floor(availH / rowH));
    // Two sub-columns inside the table strip if the list is long.
    const cols = els.length > rowsPerCol ? 2 : 1;
    const colW = tableW / cols;

    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    let shown = 0;
    for (let c = 0; c < cols; c++) {
        const colX = tableX + c * colW;
        for (let r = 0; r < rowsPerCol; r++) {
            const idx = c * rowsPerCol + r;
            if (idx >= els.length) break;
            const el = els[idx];
            const y = headerBottom + 4 + r * rowH;
            doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
            doc.setFont(font, 'bold');
            doc.text(`${el.index}`, colX, y);
            doc.setTextColor(0);
            doc.setFont(font, 'normal');
            doc.text(formatMm(el.lengthMm), colX + 8, y);
            doc.text(formatM(el.lengthMm), colX + colW - (cols > 1 ? 4 : 2), y, {
                align: 'right',
            });
            shown++;
        }
    }

    // Total
    const totalY = PAGE_H - margin - 6;
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.4);
    doc.line(tableX, totalY - 5, tableX + tableW, totalY - 5);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(T('TOTAL'), tableX, totalY);
    doc.text(
        `${formatMm(total)}  ·  ${formatM(total)}`,
        tableX + tableW,
        totalY,
        { align: 'right' },
    );
    doc.setTextColor(0);

    if (shown < els.length) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(180, 60, 60);
        doc.text(
            T(`+${els.length - shown} more not shown — total above is complete`),
            tableX,
            totalY + 4,
        );
        doc.setTextColor(0);
    }

    // ---- Footer ---------------------------------------------------------
    doc.setFont(font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
        T(
            'Lengths measured from the SVG path geometry (closed contours include the closing segment). Allow for joints / offcuts when ordering.',
        ),
        margin,
        PAGE_H - margin + 4,
    );
    doc.setTextColor(0);

    return doc.output('blob');
}
