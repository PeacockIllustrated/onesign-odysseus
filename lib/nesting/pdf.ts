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
const BRAND_DARK: [number, number, number] = [58, 95, 106];
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

    // ---- grouped visual reference ----
    // Each SVG group (a named layer, or the subpaths of one compound path —
    // e.g. an outlined word) becomes a block: a per-sheet locator with THIS
    // group's pieces filled in brand teal and everything else faint, so the
    // shop can see at a glance where a group's pieces ended up. A compact
    // piece list (label, size, sheet) sits underneath.
    const sheetOf = new Map(
        solution.placements.map((p) => [p.pieceId, p.sheetIndex]),
    );
    const placementsBySheet = new Map<number, typeof solution.placements>();
    for (const pl of solution.placements) {
        const arr = placementsBySheet.get(pl.sheetIndex);
        if (arr) arr.push(pl);
        else placementsBySheet.set(pl.sheetIndex, [pl]);
    }

    /** Draw sheet `s` into a box; group pieces accent, the rest faint. Returns drawn height. */
    const drawLocator = (
        s: number,
        x0: number,
        y0: number,
        boxW: number,
        boxH: number,
        groupSet: Set<string>,
    ): number => {
        const scale = Math.min(
            boxW / config.sheetWidthMm,
            boxH / config.sheetHeightMm,
        );
        const w = config.sheetWidthMm * scale;
        const h = config.sheetHeightMm * scale;
        doc.setDrawColor(190, 190, 190);
        doc.setLineWidth(0.2);
        doc.rect(x0, y0, w, h, 'S');
        const pls = placementsBySheet.get(s) ?? [];
        const paint = (inGroup: boolean) => {
            for (const pl of pls) {
                if (groupSet.has(pl.pieceId) !== inGroup) continue;
                const piece = pieceById.get(pl.pieceId);
                if (!piece) continue;
                const rings = placedPieceRings(piece, pl);
                if (inGroup) {
                    doc.setFillColor(...BRAND);
                    doc.setDrawColor(...BRAND_DARK);
                } else {
                    doc.setFillColor(224, 224, 224);
                    doc.setDrawColor(200, 200, 200);
                }
                doc.setLineWidth(0.1);
                drawRing(doc, rings.outer, x0, y0, scale, 'FD');
                doc.setFillColor(255, 255, 255);
                for (const hole of rings.holes) {
                    drawRing(doc, hole, x0, y0, scale, 'F');
                }
            }
        };
        paint(false); // faint context first…
        paint(true); // …group pieces on top
        return h;
    };

    doc.addPage();
    strap("Grouped reference - where each group's pieces are");
    const LX = 10;
    const SIL_W = 56; // group silhouette box (the section's own shape)
    const LOC_W = 44; // per-sheet locator box (where its pieces are)
    const BAND = 36; // height of the silhouette/locator band
    const GAP = 5;
    let gy = 22;

    /**
     * Draw a group's pieces in their ORIGINAL artwork positions, fit to a box
     * and accent-filled — so the section reads as the word/shape it is and the
     * shop can recognise it at a glance.
     */
    const drawGroupSilhouette = (
        group: PieceGroup,
        x0: number,
        y0: number,
        boxW: number,
        boxH: number,
    ): void => {
        const gps = group.pieceIds
            .map((id) => pieceById.get(id))
            .filter((p): p is NestPiece => !!p);
        if (gps.length === 0) return;
        const bb = ringsBBox(gps.flatMap((p) => [p.outer, ...p.holes]));
        const bw = bb.maxX - bb.minX || 1;
        const bh = bb.maxY - bb.minY || 1;
        const scale = Math.min(boxW / bw, boxH / bh);
        const ox = x0 + (boxW - bw * scale) / 2 - bb.minX * scale;
        const oy = y0 + (boxH - bh * scale) / 2 - bb.minY * scale;
        for (const p of gps) {
            doc.setFillColor(...BRAND);
            doc.setDrawColor(...BRAND_DARK);
            doc.setLineWidth(0.1);
            drawRing(doc, p.outer, ox, oy, scale, 'FD');
            doc.setFillColor(255, 255, 255);
            for (const hole of p.holes) drawRing(doc, hole, ox, oy, scale, 'F');
        }
    };

    for (const group of groups) {
        const groupSet = new Set(group.pieceIds);
        const spanned = Array.from(
            new Set(
                group.pieceIds
                    .map((id) => sheetOf.get(id))
                    .filter((v): v is number => v !== undefined),
            ),
        ).sort((a, b) => a - b);
        const gps = group.pieceIds
            .map((id) => pieceById.get(id))
            .filter((p): p is NestPiece => !!p);
        const dims = gps.map((p) => Math.max(p.widthMm, p.heightMm));
        const minD = dims.length ? Math.floor(Math.min(...dims)) : 0;
        const maxD = dims.length ? Math.ceil(Math.max(...dims)) : 0;

        const headerH = 6;
        const blockH = headerH + BAND + 9;
        if (gy + blockH > PAGE_H - 8) {
            doc.addPage();
            strap('Grouped reference (cont.)');
            gy = 22;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(...INK);
        const sheetsLabel = spanned.length
            ? `sheet${spanned.length > 1 ? 's' : ''} ${spanned.map((s) => s + 1).join(', ')}`
            : 'not placed';
        doc.text(
            txt(
                `${group.label}    ${group.pieceIds.length} piece${group.pieceIds.length === 1 ? '' : 's'}  -  ${sheetsLabel}${maxD ? `  -  ${minD}-${maxD}mm` : ''}`,
            ),
            LX,
            gy,
        );
        gy += headerH;

        // The section's own shape, so it's recognisable…
        doc.setDrawColor(232, 232, 232);
        doc.setLineWidth(0.2);
        doc.rect(LX, gy, SIL_W, BAND, 'S');
        drawGroupSilhouette(group, LX + 1, gy + 1, SIL_W - 2, BAND - 2);

        // …then a locator per sheet showing WHERE its pieces landed.
        let lx = LX + SIL_W + 8;
        for (const s of spanned) {
            if (lx + LOC_W > PAGE_W - 10) break;
            drawLocator(s, lx, gy, LOC_W, BAND, groupSet);
            const cnt = group.pieceIds.filter(
                (id) => sheetOf.get(id) === s,
            ).length;
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(6.5);
            doc.setTextColor(90, 90, 90);
            doc.text(txt(`Sheet ${s + 1} (${cnt})`), lx, gy + BAND + 3);
            lx += LOC_W + GAP;
        }
        gy += BAND + 9;

        doc.setDrawColor(232, 232, 232);
        doc.setLineWidth(0.2);
        doc.line(LX, gy - 4, PAGE_W - 10, gy - 4);
    }

    if (solution.unplacedPieceIds.length > 0) {
        if (gy > PAGE_H - 18) {
            doc.addPage();
            strap('Grouped reference (cont.)');
            gy = 22;
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        doc.setTextColor(180, 30, 30);
        doc.text(
            txt(
                `${solution.unplacedPieceIds.length} piece(s) did not fit - increase sheets, shrink the artwork, or check piece sizes.`,
            ),
            LX,
            gy + 2,
        );
    }

    return doc.output('blob');
}
