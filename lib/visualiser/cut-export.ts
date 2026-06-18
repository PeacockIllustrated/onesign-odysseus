/**
 * Generic cut-geometry → SVG / DXF for the production-files export.
 *
 * One geometry (cut rings + reference rings + fold segments, in mm) renders to
 * every format so the .svg / .dxf / .pdf in the zip always agree. True mm; black
 * = cut, blue = reference (sheet boundary / fold lines, machine-ignored). The
 * DXF is the same universally-readable AutoCAD R12 dialect the nester emits
 * (POLYLINE/VERTEX/SEQEND, y flipped to CAD's y-up). Pure + DOM-free.
 */

export type Pt = [number, number];
export type Ring = Pt[];

export interface CutGeometry {
    /** Black cut contours (closed). */
    cut: Ring[];
    /** Reference contours — sheet boundary etc. (blue, not cut). */
    ref?: Ring[];
    /** Reference line segments — fold/bend lines (blue, not cut). */
    folds?: Array<[Pt, Pt]>;
}

function nf(n: number): string {
    const s = n.toFixed(3);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function esc(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

export function cutBbox(geo: CutGeometry) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const grow = (x: number, y: number) => {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
    };
    for (const r of geo.cut) for (const [x, y] of r) grow(x, y);
    for (const r of geo.ref ?? []) for (const [x, y] of r) grow(x, y);
    for (const [a, b] of geo.folds ?? []) {
        grow(a[0], a[1]);
        grow(b[0], b[1]);
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
    return { minX, minY, maxX, maxY };
}

function ringPath(ring: Ring): string {
    if (ring.length < 2) return '';
    const [first, ...rest] = ring;
    return (
        `M ${nf(first[0])} ${nf(first[1])} ` +
        rest.map(([x, y]) => `L ${nf(x)} ${nf(y)}`).join(' ') +
        ' Z'
    );
}

/** True-mm SVG cut file: black cut paths, blue reference + folds. */
export function cutToSvg(geo: CutGeometry, title = ''): string {
    const bb = cutBbox(geo);
    const pad = 10;
    const x = bb.minX - pad;
    const y = bb.minY - pad;
    const w = Math.max(1, bb.maxX - bb.minX + pad * 2);
    const h = Math.max(1, bb.maxY - bb.minY + pad * 2);

    const els: string[] = [];
    for (const r of geo.ref ?? []) {
        const d = ringPath(r);
        if (d) els.push(`  <path d="${d}" fill="none" stroke="#0000ff" stroke-width="0.1"/>`);
    }
    for (const [a, b] of geo.folds ?? []) {
        els.push(
            `  <line x1="${nf(a[0])}" y1="${nf(a[1])}" x2="${nf(b[0])}" y2="${nf(b[1])}" stroke="#0000ff" stroke-width="0.1"/>`,
        );
    }
    for (const r of geo.cut) {
        const d = ringPath(r);
        if (d) els.push(`  <path d="${d}" fill="none" stroke="#000000" stroke-width="0.1"/>`);
    }

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        title ? `<!-- ${esc(title)} — Onesign Odysseus cut file. 1 unit = 1 mm. Black = cut, blue = reference. -->` : '',
        `<svg xmlns="http://www.w3.org/2000/svg" width="${nf(w)}mm" height="${nf(h)}mm" viewBox="${nf(x)} ${nf(y)} ${nf(w)} ${nf(h)}">`,
        ...els,
        '</svg>',
        '',
    ]
        .filter(Boolean)
        .join('\n');
}

function dn(n: number): string {
    const s = n.toFixed(4);
    return s.includes('.') ? s.replace(/\.?0+$/, '') : s;
}

function dxfPolyline(ring: Ring, layer: string, flip: number, out: string[]): void {
    if (ring.length < 3) return;
    out.push('0', 'POLYLINE', '8', layer, '66', '1', '70', '1');
    for (const [x, y] of ring) {
        out.push('0', 'VERTEX', '8', layer, '10', dn(x), '20', dn(flip - y));
    }
    out.push('0', 'SEQEND');
}

/**
 * AutoCAD R12 DXF (mm). y is flipped against the geometry's vertical extent so
 * it reads right in CAD's y-up space (same trick the nester's DXF uses).
 * Layers: CUT (white), SHEET (blue ref), FOLD (green ref).
 */
export function cutToDxf(geo: CutGeometry): string {
    const bb = cutBbox(geo);
    const flip = bb.minY + bb.maxY; // y -> (minY+maxY) - y

    const lines: string[] = [
        '0', 'SECTION', '2', 'HEADER',
        '9', '$ACADVER', '1', 'AC1009',
        '9', '$INSUNITS', '70', '4',
        '0', 'ENDSEC',
        '0', 'SECTION', '2', 'TABLES',
        '0', 'TABLE', '2', 'LAYER', '70', '3',
        '0', 'LAYER', '2', 'CUT', '70', '0', '62', '7', '6', 'CONTINUOUS',
        '0', 'LAYER', '2', 'SHEET', '70', '0', '62', '5', '6', 'CONTINUOUS',
        '0', 'LAYER', '2', 'FOLD', '70', '0', '62', '3', '6', 'CONTINUOUS',
        '0', 'ENDTAB',
        '0', 'ENDSEC',
        '0', 'SECTION', '2', 'ENTITIES',
    ];

    for (const r of geo.ref ?? []) dxfPolyline(r, 'SHEET', flip, lines);
    for (const [a, b] of geo.folds ?? []) {
        lines.push(
            '0', 'LINE', '8', 'FOLD',
            '10', dn(a[0]), '20', dn(flip - a[1]),
            '11', dn(b[0]), '21', dn(flip - b[1]),
        );
    }
    for (const r of geo.cut) dxfPolyline(r, 'CUT', flip, lines);

    lines.push('0', 'ENDSEC', '0', 'EOF');
    return lines.join('\r\n') + '\r\n';
}
