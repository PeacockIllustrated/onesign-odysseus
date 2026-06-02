/**
 * Annotated neon-flex run-length PDF.
 *
 * Three A4 landscape pages: (1) run lengths, (2) the same layout with each run
 * drawn in its real SVG colour + per-run colour codes, (3) colour totals +
 * backboard spec. Page 1 is: the artwork drawn 1:1-to-fit with a numbered balloon
 * on every measured element (a leader from the balloon to the element centre,
 * so it's unambiguous which run a length refers to — we can't name letters),
 * plus a length table (mm + m per balloon) and the grand total. This is the
 * sheet that replaces hand-copying each path length out of Illustrator.
 *
 * Browser-only (jsPDF). Callers are client components.
 */

import { jsPDF } from 'jspdf';
import { registerVisualiserFonts } from './pdf-fonts';
import {
    formatMm,
    formatM,
    totalLengthMm,
    colourBreakdown,
    parseCssColor,
    type NeonElement,
} from './neon';

const ACCENT: [number, number, number] = [78, 126, 140]; // #4e7e8c
const INK: [number, number, number] = [26, 31, 35];
const GREY: [number, number, number] = [150, 150, 150];
const PAGE_W = 297;
const PAGE_H = 210;
const margin = 14;

/** Run colour as RGB for jsPDF; grey when the SVG colour can't be resolved. */
function rgbOf(c: string | undefined): [number, number, number] {
    return parseCssColor(c) ?? GREY;
}

export interface NeonPdfOptions {
    name: string;
    elements: NeonElement[];
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
    backboard?: { enabled: boolean; paddingMm: number };
}

function fitScale(w: number, h: number, partW: number, partH: number): number {
    return Math.min(w / Math.max(partW, 1e-6), h / Math.max(partH, 1e-6));
}

/**
 * Run-length sheet: artwork (left) with a numbered balloon per run, and a table
 * (right). `coloured` switches the strokes to each run's real SVG colour and
 * adds a colour-code column, so the same layout doubles as a colour reference.
 */
function drawRunPage(
    doc: jsPDF,
    font: string,
    opts: NeonPdfOptions,
    coloured: boolean,
) {
    const T = (s: string) => s;
    const els = opts.elements;
    const total = totalLengthMm(els);

    // ---- Header bar ---------------------------------------------------
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(0, 0, PAGE_W, 18, 'F');
    doc.setTextColor(255);
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(
        coloured ? T('NEON FLEX · COLOURS') : T('NEON FLEX · RUN LENGTHS'),
        margin,
        11.5,
    );
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(T(opts.name), PAGE_W - margin, 7.5, { align: 'right' });
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

    // ---- Artwork (teal, or each run in its real colour) ----------------
    doc.setLineWidth(0.5);
    for (const el of els) {
        if (coloured) {
            const c = rgbOf(el.stroke);
            doc.setDrawColor(c[0], c[1], c[2]);
        } else {
            doc.setDrawColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        }
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
    const R = 3.2;
    doc.setFontSize(7.5);
    for (const el of els) {
        const cx = px(el.centroid[0]);
        const cy = py(el.centroid[1]);
        const bx = cx - 6;
        const by = cy - 6;
        doc.setDrawColor(INK[0], INK[1], INK[2]);
        doc.setLineWidth(0.2);
        doc.line(cx, cy, bx, by);
        doc.setFillColor(INK[0], INK[1], INK[2]);
        doc.circle(cx, cy, 0.5, 'F');
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.circle(bx, by, R, 'F');
        doc.setTextColor(255);
        doc.setFont(font, 'bold');
        doc.text(String(el.index), bx, by + 1.1, { align: 'center' });
    }
    doc.setTextColor(0);

    // ---- Table divider --------------------------------------------------
    doc.setDrawColor(220);
    doc.setLineWidth(0.2);
    doc.line(tableX - 4, top, tableX - 4, PAGE_H - margin);

    const headerBottom = top + 4;
    const footerBlock = 16;
    const availH = PAGE_H - margin - headerBottom - footerBlock;
    let shown = 0;

    if (!coloured) {
        // RUN | LENGTH | METRES — two sub-columns when the list is long.
        doc.setFont(font, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(T('RUN'), tableX, top + 2);
        doc.text(T('LENGTH'), tableX + 16, top + 2);
        doc.text(T('METRES'), tableX + tableW - 2, top + 2, { align: 'right' });
        doc.setDrawColor(180);
        doc.line(tableX, top + 4, tableX + tableW, top + 4);

        const rowH = 5.2;
        const rowsPerCol = Math.max(1, Math.floor(availH / rowH));
        const cols = els.length > rowsPerCol ? 2 : 1;
        const colW = tableW / cols;
        doc.setFont(font, 'normal');
        doc.setFontSize(8);
        for (let c = 0; c < cols; c++) {
            const cX = tableX + c * colW;
            for (let r = 0; r < rowsPerCol; r++) {
                const idx = c * rowsPerCol + r;
                if (idx >= els.length) break;
                const el = els[idx];
                const y = headerBottom + 4 + r * rowH;
                doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
                doc.setFont(font, 'bold');
                doc.text(`${el.index}`, cX, y);
                doc.setTextColor(0);
                doc.setFont(font, 'normal');
                doc.text(formatMm(el.lengthMm), cX + 8, y);
                doc.text(formatM(el.lengthMm), cX + colW - (cols > 1 ? 4 : 2), y, {
                    align: 'right',
                });
                shown++;
            }
        }
    } else {
        // RUN | COLOUR (swatch + code) | LENGTH — single column.
        doc.setFont(font, 'bold');
        doc.setFontSize(9);
        doc.setTextColor(INK[0], INK[1], INK[2]);
        doc.text(T('RUN'), tableX, top + 2);
        doc.text(T('COLOUR'), tableX + 12, top + 2);
        doc.text(T('LENGTH'), tableX + tableW, top + 2, { align: 'right' });
        doc.setDrawColor(180);
        doc.line(tableX, top + 4, tableX + tableW, top + 4);

        const rowH = 6;
        const rowsPerCol = Math.max(1, Math.floor(availH / rowH));
        for (let r = 0; r < rowsPerCol && r < els.length; r++) {
            const el = els[r];
            const y = headerBottom + 5 + r * rowH;
            doc.setFont(font, 'bold');
            doc.setFontSize(8);
            doc.setTextColor(ACCENT[0], ACCENT[1], ACCENT[2]);
            doc.text(`${el.index}`, tableX, y);
            const c = rgbOf(el.stroke);
            doc.setFillColor(c[0], c[1], c[2]);
            doc.setDrawColor(180);
            doc.setLineWidth(0.2);
            doc.rect(tableX + 10, y - 3.2, 4.5, 4.5, 'FD');
            doc.setFont(font, 'normal');
            doc.setTextColor(0);
            doc.text(el.stroke ? el.stroke.toUpperCase() : '—', tableX + 17, y);
            doc.text(formatMm(el.lengthMm), tableX + tableW, y, {
                align: 'right',
            });
            shown++;
        }
    }

    // ---- Total ----------------------------------------------------------
    const totalY = PAGE_H - margin - 6;
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.4);
    doc.line(tableX, totalY - 5, tableX + tableW, totalY - 5);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(T('TOTAL'), tableX, totalY);
    doc.text(`${formatMm(total)}  ·  ${formatM(total)}`, tableX + tableW, totalY, {
        align: 'right',
    });
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
            coloured
                ? 'Strokes shown in each run’s SVG colour; colour codes listed right — confirm against your neon-flex swatch book before ordering.'
                : 'Lengths measured from the SVG path geometry (closed contours include the closing segment). Allow for joints / offcuts when ordering.',
        ),
        margin,
        PAGE_H - margin + 4,
    );
    doc.setTextColor(0);
}

export async function generateNeonPdfBlob(opts: NeonPdfOptions): Promise<Blob> {
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

    // Page 1: run lengths (teal). Page 2: same layout, coloured strokes
    // + per-run colour codes. Page 3 (below): colour totals + backboard.
    drawRunPage(doc, font, opts, false);
    doc.addPage('a4', 'landscape');
    drawRunPage(doc, font, opts, true);

    // ====================================================================
    // PAGE 3 — colour breakdown (totals per colour) + backboard spec
    // ====================================================================
    doc.addPage('a4', 'landscape');

    {
    // Header bar
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(0, 0, PAGE_W, 18, 'F');
    doc.setTextColor(255);
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(T('BACKBOARD & COLOURS'), margin, 11.5);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(T(opts.name), PAGE_W - margin, 11.5, { align: 'right' });
    doc.setTextColor(0);

    const p2Top = 30;

    // ---- Backboard (left column) ---------------------------------------
    const artW = Math.max(0, opts.bbox.maxX - opts.bbox.minX);
    const artH = Math.max(0, opts.bbox.maxY - opts.bbox.minY);
    const board = opts.backboard;
    const pad = board?.enabled ? Math.max(0, board.paddingMm) : 0;
    const boardW = artW + pad * 2;
    const boardH = artH + pad * 2;

    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(T('BACKBOARD'), margin, p2Top);
    doc.setTextColor(0);

    if (board?.enabled) {
        // Diagram: board rectangle with the artwork extent dashed inside.
        const boxMaxW = 120;
        const boxMaxH = 78;
        const dgScale = fitScale(boxMaxW, boxMaxH, boardW, boardH);
        const bw = boardW * dgScale;
        const bh = boardH * dgScale;
        const bx = margin + (boxMaxW - bw) / 2;
        const by = p2Top + 8;
        // board
        doc.setFillColor(225, 240, 246);
        doc.setDrawColor(120, 160, 175);
        doc.setLineWidth(0.4);
        doc.rect(bx, by, bw, bh, 'FD');
        // artwork extent (dashed inset by padding)
        const inset = pad * dgScale;
        doc.setDrawColor(150);
        doc.setLineWidth(0.25);
        doc.setLineDashPattern([1.4, 1], 0);
        doc.rect(bx + inset, by + inset, bw - inset * 2, bh - inset * 2, 'S');
        doc.setLineDashPattern([], 0);
        // dims
        doc.setFont(font, 'normal');
        doc.setFontSize(8);
        doc.setTextColor(90);
        doc.text(`${Math.round(boardW)} mm`, bx + bw / 2, by + bh + 4, {
            align: 'center',
        });
        doc.text(`${Math.round(boardH)} mm`, bx - 2, by + bh / 2, {
            align: 'right',
            angle: 90,
        });
        doc.setTextColor(0);

        // spec lines
        let sy = by + bh + 12;
        const specRow = (k: string, v: string, bold = false) => {
            doc.setFont(font, 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(120);
            doc.text(T(k), margin, sy);
            doc.setTextColor(0);
            doc.setFont(font, bold ? 'bold' : 'normal');
            doc.setFontSize(bold ? 10 : 8.5);
            doc.text(T(v), margin + 34, sy);
            sy += bold ? 6.5 : 5.2;
        };
        specRow('Material', 'Clear acrylic');
        specRow('Artwork', `${Math.round(artW)} × ${Math.round(artH)} mm`);
        specRow('Padding', `${Math.round(pad)} mm all round`);
        specRow(
            'Board size',
            `${Math.round(boardW)} × ${Math.round(boardH)} mm`,
            true,
        );
        specRow(
            'Sheet area',
            `${((boardW * boardH) / 1_000_000).toFixed(2)} m²`,
        );
    } else {
        doc.setFont(font, 'normal');
        doc.setFontSize(9);
        doc.setTextColor(90);
        doc.text(
            T('No backboard — runs mounted directly.'),
            margin,
            p2Top + 8,
        );
        doc.setTextColor(0);
    }

    // ---- Colours (right column) ----------------------------------------
    const colX = margin + 150;
    const colW = PAGE_W - margin - colX;
    const breakdown = colourBreakdown(opts.elements);

    doc.setFont(font, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(T('NEON FLEX BY COLOUR'), colX, p2Top);
    doc.setTextColor(0);

    // column headers
    let cy = p2Top + 8;
    doc.setFont(font, 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(120);
    doc.text(T('COLOUR'), colX + 8, cy);
    doc.text(T('RUNS'), colX + colW - 44, cy, { align: 'right' });
    doc.text(T('LENGTH'), colX + colW, cy, { align: 'right' });
    doc.setDrawColor(180);
    doc.setLineWidth(0.2);
    doc.line(colX, cy + 2, colX + colW, cy + 2);
    doc.setTextColor(0);
    cy += 8;

    // Clamp rows to the space above a fixed TOTAL anchor so a rainbow design
    // can't run the rows (or the TOTAL) off the page.
    const rowH = 9;
    const totalAnchor = PAGE_H - margin - 12;
    const maxRows = Math.max(1, Math.floor((totalAnchor - 5 - cy) / rowH));
    const shownColours = Math.min(breakdown.length, maxRows);
    for (let i = 0; i < shownColours; i++) {
        const row = breakdown[i];
        const rgb = rgbOf(row.color);
        // swatch
        doc.setFillColor(rgb[0], rgb[1], rgb[2]);
        doc.setDrawColor(180);
        doc.setLineWidth(0.2);
        doc.rect(colX, cy - 3.4, 5, 5, 'FD');
        // label
        doc.setFont(font, 'normal');
        doc.setFontSize(9);
        doc.text(T(row.color ? row.color.toUpperCase() : 'Not set'), colX + 8, cy);
        // runs
        doc.text(`${row.runs}`, colX + colW - 44, cy, { align: 'right' });
        // length (m, with mm under)
        doc.text(formatM(row.lengthMm), colX + colW, cy, { align: 'right' });
        doc.setFontSize(7);
        doc.setTextColor(140);
        doc.text(formatMm(row.lengthMm), colX + colW, cy + 3.4, {
            align: 'right',
        });
        doc.setTextColor(0);
        cy += rowH;
    }
    if (shownColours < breakdown.length) {
        doc.setFont(font, 'normal');
        doc.setFontSize(7);
        doc.setTextColor(180, 60, 60);
        doc.text(
            T(`+${breakdown.length - shownColours} more colours — TOTAL below is complete`),
            colX,
            cy,
        );
        doc.setTextColor(0);
    }

    // total — fixed anchor so it's always on-page below the (clamped) rows
    const total = totalLengthMm(opts.elements);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.4);
    doc.line(colX, totalAnchor - 5, colX + colW, totalAnchor - 5);
    doc.setFont(font, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text(T('TOTAL'), colX, totalAnchor);
    doc.text(
        `${formatM(total)}  ·  ${formatMm(total)}`,
        colX + colW,
        totalAnchor,
        { align: 'right' },
    );
    doc.setTextColor(0);

    // footer
    doc.setFont(font, 'normal');
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text(
        T(
            'Colours read from each path’s SVG stroke (fill if no stroke). Order neon flex per colour from the lengths above.',
        ),
        margin,
        PAGE_H - margin + 4,
    );
    doc.setTextColor(0);
    }

    return doc.output('blob');
}
