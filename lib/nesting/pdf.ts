/**
 * Nesting summary PDF — the workshop printout.
 *
 * One A4 landscape page per sheet showing the layout to scale, with a
 * stats strip (utilisation, gap, off-cut suggestion), then a piece
 * schedule grouped the same way as the on-screen list. This is a
 * reference document — the SVG/DXF exports are the cut files.
 *
 * Text is ASCII-normalised the same way as lib/visualiser/pdf.ts: jsPDF's
 * built-in Helvetica is WinAnsi, and a substitute glyph in a shop document
 * reads as an error.
 *
 * Browser-only (jsPDF). Callers are client components.
 */

import { jsPDF } from 'jspdf';
import { placedPieceRings, ringsBBox, signedArea } from './geom';
import type {
    NestConfig,
    NestPiece,
    NestSolution,
    PieceGroup,
    Ring,
} from './types';

const BRAND: [number, number, number] = [78, 126, 140];
const INK: [number, number, number] = [26, 31, 35];
const PAGE_W = 297;
const PAGE_H = 210;

function txt(s: string): string {
    return s
        .replace(/[—–]/g, '-')
        .replace(/[‘’]/g, "'")
        .replace(/[“”]/g, '"')
        .replace(/…/g, '...')
        .replace(/×/g, 'x')
        .replace(/·/g, '-');
}

function drawRing(
    doc: jsPDF,
    ring: Ring,
    ox: number,
    oy: number,
    scale: number,
    style: 'F' | 'S' | 'FD',
): void {
    if (ring.length < 3) return;
    const segs: Array<[number, number]> = [];
    for (let i = 1; i < ring.length; i++) {
        segs.push([
            (ring[i][0] - ring[i - 1][0]) * scale,
            (ring[i][1] - ring[i - 1][1]) * scale,
        ]);
    }
    doc.lines(segs, ox + ring[0][0] * scale, oy + ring[0][1] * scale, [1, 1], style, true);
}

export interface NestPdfOptions {
    jobName: string;
    pieces: NestPiece[];
    groups: PieceGroup[];
    solution: NestSolution;
    config: NestConfig;
    generatedAt: Date;
}

export function generateNestingPdfBlob(opts: NestPdfOptions): Blob {
    const { pieces, groups, solution, config } = opts;
    const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const pieceById = new Map(pieces.map((p) => [p.id, p]));
    const sheetCount = solution.sheets.length;
    const dateStr = opts.generatedAt.toLocaleDateString('en-GB');

    const strap = (title: string) => {
        doc.setFillColor(...BRAND);
        doc.rect(0, 0, PAGE_W, 13, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.text(txt(title), 8, 8.6);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.text(txt(`${opts.jobName}  |  ${dateStr}`), PAGE_W - 8, 8.6, {
            align: 'right',
        });
    };

    for (let s = 0; s < sheetCount; s++) {
        if (s > 0) doc.addPage();
        strap(`Acrylic nesting - sheet ${s + 1} of ${sheetCount}`);

        const stats = solution.sheets[s];
        const placements = solution.placements.filter((p) => p.sheetIndex === s);

        // ---- the layout drawing, to scale, centred ----
        const areaX = 10;
        const areaY = 20;
        const areaW = PAGE_W - 20;
        const areaH = 160;
        const scale = Math.min(
            areaW / config.sheetWidthMm,
            areaH / config.sheetHeightMm,
        );
        const ox = areaX + (areaW - config.sheetWidthMm * scale) / 2;
        const oy = areaY + (areaH - config.sheetHeightMm * scale) / 2;

        doc.setFillColor(248, 248, 248);
        doc.setDrawColor(...INK);
        doc.setLineWidth(0.3);
        doc.rect(ox, oy, config.sheetWidthMm * scale, config.sheetHeightMm * scale, 'FD');
        // Margin keep-out, dashed.
        doc.setDrawColor(160, 160, 160);
        doc.setLineWidth(0.15);
        doc.setLineDashPattern([1.5, 1.5], 0);
        doc.rect(
            ox + config.marginMm * scale,
            oy + config.marginMm * scale,
            (config.sheetWidthMm - 2 * config.marginMm) * scale,
            (config.sheetHeightMm - 2 * config.marginMm) * scale,
            'S',
        );
        doc.setLineDashPattern([], 0);

        // Containers before contents so hole-nested pieces stay visible.
        const ordered = placements
            .map((pl) => ({ pl, piece: pieceById.get(pl.pieceId) }))
            .filter((e): e is { pl: (typeof placements)[number]; piece: NestPiece } => !!e.piece)
            .sort(
                (a, b) =>
                    Math.abs(signedArea(b.piece.outer)) -
                    Math.abs(signedArea(a.piece.outer)),
            );
        doc.setLineWidth(0.15);
        for (const { pl, piece } of ordered) {
            const rings = placedPieceRings(piece, pl);
            doc.setDrawColor(...INK);
            doc.setFillColor(...INK);
            drawRing(doc, rings.outer, ox, oy, scale, 'FD');
            doc.setFillColor(255, 255, 255);
            for (const hole of rings.holes) drawRing(doc, hole, ox, oy, scale, 'FD');
            // Number the piece when there's room to read it.
            const bb = ringsBBox([rings.outer]);
            const wMm = (bb.maxX - bb.minX) * scale;
            const hMm = (bb.maxY - bb.minY) * scale;
            if (wMm > 8 && hMm > 6) {
                doc.setTextColor(255, 255, 255);
                doc.setFontSize(6);
                doc.text(
                    piece.label.replace(/^Piece /, ''),
                    ox + ((bb.minX + bb.maxX) / 2) * scale,
                    oy + ((bb.minY + bb.maxY) / 2) * scale + 1,
                    { align: 'center' },
                );
            }
        }

        // ---- stats strip ----
        doc.setTextColor(...INK);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text(
            txt(
                `Sheet ${config.sheetWidthMm} x ${config.sheetHeightMm} mm  -  ${stats.pieceCount} pieces  -  ${(stats.utilisation * 100).toFixed(1)}% material used`,
            ),
            10,
            190,
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        doc.setTextColor(90, 90, 90);
        doc.text(
            txt(
                `Gap ${config.gapMm}mm  -  edge margin ${config.marginMm}mm  -  rotation ${config.rotationStepDeg === 0 ? 'off' : `${config.rotationStepDeg} deg steps`}  -  pieces occupy ${Math.ceil(stats.usedWidthMm)} x ${Math.ceil(stats.usedHeightMm)} mm` +
                    (s === sheetCount - 1 && sheetCount > 0
                        ? `  -  smallest off-cut for this sheet: ${Math.ceil(stats.usedWidthMm + 2 * config.marginMm)} x ${Math.ceil(stats.usedHeightMm + 2 * config.marginMm)} mm`
                        : ''),
            ),
            10,
            196,
        );
    }

    // ---- piece schedule ----
    doc.addPage();
    strap('Acrylic nesting - piece schedule');
    let y = 24;
    const lineH = 5;
    const colW = (PAGE_W - 20) / 3;
    let col = 0;
    const nextLine = () => {
        y += lineH;
        if (y > PAGE_H - 12) {
            col++;
            y = 24;
            if (col > 2) {
                doc.addPage();
                strap('Acrylic nesting - piece schedule (cont.)');
                col = 0;
            }
        }
    };
    const placedSheet = new Map(
        solution.placements.map((p) => [p.pieceId, p.sheetIndex]),
    );
    for (const group of groups) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        doc.text(
            txt(`${group.label} (${group.pieceIds.length})`),
            10 + col * colW,
            y,
        );
        nextLine();
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        for (const id of group.pieceIds) {
            const piece = pieceById.get(id);
            if (!piece) continue;
            const sheet = placedSheet.get(id);
            doc.setTextColor(90, 90, 90);
            doc.text(
                txt(
                    `${piece.label} - ${Math.ceil(piece.widthMm)} x ${Math.ceil(piece.heightMm)} mm - ${sheet !== undefined ? `sheet ${sheet + 1}` : 'NOT PLACED'}`,
                ),
                12 + col * colW,
                y,
            );
            nextLine();
        }
        nextLine();
    }

    if (solution.unplacedPieceIds.length > 0) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(180, 30, 30);
        doc.text(
            txt(
                `${solution.unplacedPieceIds.length} piece(s) did not fit - increase sheets, shrink the artwork, or check piece sizes.`,
            ),
            10 + col * colW,
            y,
        );
    }

    return doc.output('blob');
}
