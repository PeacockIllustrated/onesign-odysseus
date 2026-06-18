/**
 * Cut geometry → 1:1 mm PDF for the production-files export. One page sized to
 * the part, black cut paths + blue reference/fold lines, true scale so the page
 * measures the real part. Falls back to a fitted scale only if the part exceeds
 * the PDF page-size limit (rare; multi-metre blanks). Browser-only (jsPDF).
 */

import { jsPDF } from 'jspdf';
import { cutBbox, type CutGeometry, type Ring } from './cut-export';

/** PDF hard limit is 200in ≈ 5080mm per side; stay safely under. */
const MAX_PAGE_MM = 4800;

export function cutToPdf(geo: CutGeometry): Uint8Array {
    const bb = cutBbox(geo);
    const margin = 8;
    const wMm = Math.max(1, bb.maxX - bb.minX + margin * 2);
    const hMm = Math.max(1, bb.maxY - bb.minY + margin * 2);
    const scale = Math.min(1, MAX_PAGE_MM / Math.max(wMm, hMm));
    const pw = wMm * scale;
    const ph = hMm * scale;

    const doc = new jsPDF({
        unit: 'mm',
        format: [pw, ph],
        orientation: pw >= ph ? 'landscape' : 'portrait',
        compress: true,
    });

    const X = (x: number) => (x - bb.minX + margin) * scale;
    const Y = (y: number) => (y - bb.minY + margin) * scale;

    doc.setLineWidth(0.1);

    const strokeRing = (ring: Ring) => {
        if (ring.length < 2) return;
        for (let i = 0; i + 1 < ring.length; i++) {
            doc.line(X(ring[i][0]), Y(ring[i][1]), X(ring[i + 1][0]), Y(ring[i + 1][1]));
        }
        // Close it.
        const a = ring[0];
        const b = ring[ring.length - 1];
        if (a[0] !== b[0] || a[1] !== b[1]) {
            doc.line(X(b[0]), Y(b[1]), X(a[0]), Y(a[1]));
        }
    };

    // Reference (blue): sheet boundary + fold lines.
    doc.setDrawColor(0, 0, 255);
    for (const r of geo.ref ?? []) strokeRing(r);
    for (const [a, b] of geo.folds ?? []) doc.line(X(a[0]), Y(a[1]), X(b[0]), Y(b[1]));

    // Cut (black).
    doc.setDrawColor(0, 0, 0);
    for (const r of geo.cut) strokeRing(r);

    return new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
}
