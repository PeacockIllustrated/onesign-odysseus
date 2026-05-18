/**
 * Dimensioned PDF shop drawing.
 *
 * Not a cut file — a human-readable reference for the shop floor: the flat
 * development drawn to scale, fold/seam lines, a spec block, the per-panel
 * size breakdown and (optionally) the 3D thumbnail. Drawn with real jsPDF
 * vector primitives in mm, so it stays crisp and light.
 *
 * Browser-only (jsPDF). Callers are client components.
 */

import { jsPDF } from 'jspdf';
import {
    BEND_RULE_TEXT,
    type PanelParams,
    type PanelDevelopment,
    type PanelSplit,
    type FlatPath,
} from './types';

interface PdfOptions {
    development: PanelDevelopment;
    split: PanelSplit;
    params: PanelParams;
    aperture?: FlatPath[];
    keyline?: FlatPath[];
    /** PNG/JPEG data URL of the 3D preview, optional. */
    thumbnailDataUrl?: string;
}

export function generatePdfBlob(opts: PdfOptions): Blob {
    const { development: dev, split, params } = opts;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const PAGE_W = 297;
    const PAGE_H = 210;
    const M = 12;

    // Header.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text(`Onesign Panel — ${params.name}`, M, M);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(110);
    doc.text(
        `Production shop drawing · not to be used as a cut file · ${new Date().toLocaleDateString('en-GB')}`,
        M,
        M + 5,
    );
    doc.setTextColor(0);

    // Spec block (left column).
    const specY = M + 14;
    const spec: Array<[string, string]> = [
        ['Face size', `${dev.faceNominalWMm} × ${dev.faceNominalHMm} mm`],
        ['Returns', returnsLabel(params)],
        ['Return depth', `${params.returnDepthMm} mm`],
        ['Shadow gap', params.shadowGapMm > 0 ? `${params.shadowGapMm} mm` : '—'],
        ['Keyline', params.keylineMm > 0 ? `${params.keylineMm} mm` : '—'],
        ['Material', params.materialLabel || '—'],
        ['Thickness', `${params.materialThicknessMm} mm`],
        [
            'Panels',
            split.wasSplit
                ? `${split.sections.length} (centre full): ${split.sections.join(' / ')} mm`
                : 'Single panel',
        ],
        ['Flat blank', `${dev.totalFlatWMm} × ${dev.totalFlatHMm} mm`],
    ];
    doc.setFontSize(8);
    spec.forEach(([k, v], i) => {
        const y = specY + i * 5.4;
        doc.setFont('helvetica', 'bold');
        doc.text(k, M, y);
        doc.setFont('helvetica', 'normal');
        doc.text(v, M + 28, y);
    });
    doc.setFontSize(7);
    doc.setTextColor(110);
    doc.text(BEND_RULE_TEXT, M, specY + spec.length * 5.4 + 4, { maxWidth: 70 });
    doc.setTextColor(0);

    // 3D thumbnail (top-right) if provided.
    if (opts.thumbnailDataUrl) {
        const tw = 70;
        const th = 50;
        try {
            doc.addImage(
                opts.thumbnailDataUrl,
                'PNG',
                PAGE_W - M - tw,
                M,
                tw,
                th,
                undefined,
                'FAST',
            );
            doc.setDrawColor(200);
            doc.rect(PAGE_W - M - tw, M, tw, th);
        } catch {
            /* thumbnail is best-effort */
        }
    }

    // Flat development drawing area (right of the spec column).
    const drawX = M + 90;
    const drawY = M + 18;
    const drawW = PAGE_W - drawX - M;
    const drawH = PAGE_H - drawY - M;
    const scale = Math.min(
        drawW / (dev.totalFlatWMm || 1),
        drawH / (dev.totalFlatHMm || 1),
    );
    const offX = drawX + (drawW - dev.totalFlatWMm * scale) / 2;
    const offY = drawY + (drawH - dev.totalFlatHMm * scale) / 2;
    const px = (x: number) => offX + x * scale;
    const py = (y: number) => offY + y * scale;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.text(`Flat development (1:${(1 / scale).toFixed(1)})`, drawX, drawY - 4);
    doc.setFont('helvetica', 'normal');

    // Panel outline.
    doc.setDrawColor(20);
    doc.setLineWidth(0.3);
    for (const seg of dev.segments) {
        doc.rect(px(seg.xMm), py(seg.yMm), seg.wMm * scale, seg.hMm * scale);
    }

    // Fold lines — red dashed.
    doc.setDrawColor(200, 0, 0);
    doc.setLineWidth(0.2);
    doc.setLineDashPattern([1.2, 1.2], 0);
    for (const f of dev.foldLines) {
        doc.line(px(f.x1), py(f.y1), px(f.x2), py(f.y2));
    }

    // Seam lines — green dashed.
    if (split.wasSplit) {
        const face = dev.segments.find((s) => s.role === 'face');
        if (face) {
            const k = face.wMm / dev.faceNominalWMm;
            doc.setDrawColor(0, 150, 60);
            for (const sx of split.seamXsMm) {
                const fx = face.xMm + sx * k;
                doc.line(px(fx), py(face.yMm), px(fx), py(face.yMm + face.hMm));
            }
        }
    }
    doc.setLineDashPattern([], 0);

    // Aperture (blue) + keyline (cyan) as thin polylines.
    drawPaths(doc, opts.aperture ?? [], px, py, [30, 90, 200]);
    drawPaths(doc, opts.keyline ?? [], px, py, [0, 170, 190]);

    // Overall dimensions.
    doc.setDrawColor(120);
    doc.setTextColor(80);
    doc.setFontSize(7);
    const bx = px(0);
    const byTop = py(0);
    const byBot = py(dev.totalFlatHMm);
    doc.text(`${dev.totalFlatWMm} mm`, (px(0) + px(dev.totalFlatWMm)) / 2, byBot + 6, {
        align: 'center',
    });
    doc.text(`${dev.totalFlatHMm} mm`, bx - 4, (byTop + byBot) / 2, {
        align: 'center',
        angle: 90,
    });
    doc.setTextColor(0);

    return doc.output('blob');
}

function drawPaths(
    doc: jsPDF,
    paths: FlatPath[],
    px: (n: number) => number,
    py: (n: number) => number,
    rgb: [number, number, number],
) {
    if (!paths.length) return;
    doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
    doc.setLineWidth(0.15);
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
    const safe = params.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
    return `${safe || 'panel'}-${Math.round(params.panelWidthMm)}x${Math.round(params.panelHeightMm)}-shop.pdf`;
}
