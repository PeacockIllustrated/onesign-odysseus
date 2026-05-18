/**
 * Clean R12 ASCII DXF writer.
 *
 * Deliberately minimal and flat — the #1 requirement is that the production
 * team can open these without digging through blocks, groups or clipping
 * masks. So: a named LAYER table, and every shape emitted as discrete LINE
 * entities (rectangles = 4 LINEs, never an LWPOLYLINE/BLOCK). mm units.
 *
 * Flat-development space is y-down (screen-like). DXF is y-up, so we flip Y
 * about the blank height: the part opens the right way up with origin at the
 * bottom-left, which is what CAD/laser software expects.
 */

import {
    DXF_LAYERS,
    DXF_LAYER_COLORS,
    BEND_RULE_TEXT,
    type DxfLayer,
    type PanelParams,
    type PanelDevelopment,
    type PanelSplit,
    type FlatPath,
} from './types';

function header(): string {
    return '0\nSECTION\n2\nHEADER\n9\n$INSUNITS\n70\n4\n0\nENDSEC\n';
}

function tables(): string {
    let s = '0\nSECTION\n2\nTABLES\n0\nTABLE\n2\nLAYER\n';
    for (const name of Object.values(DXF_LAYERS)) {
        s += `0\nLAYER\n2\n${name}\n70\n0\n62\n${DXF_LAYER_COLORS[name as DxfLayer]}\n6\nCONTINUOUS\n`;
    }
    s += '0\nENDTAB\n0\nENDSEC\n';
    return s;
}

function line(
    layer: DxfLayer,
    x1: number,
    y1: number,
    x2: number,
    y2: number,
): string {
    return `0\nLINE\n8\n${layer}\n10\n${r(x1)}\n20\n${r(y1)}\n30\n0\n11\n${r(x2)}\n21\n${r(y2)}\n31\n0\n`;
}

function text(
    layer: DxfLayer,
    x: number,
    y: number,
    h: number,
    value: string,
): string {
    // Strip newlines/control chars — one TEXT entity per call.
    const safe = value.replace(/[\r\n]+/g, ' ');
    return `0\nTEXT\n8\n${layer}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(h)}\n1\n${safe}\n`;
}

function r(n: number): number {
    return Math.round(n * 1000) / 1000;
}

interface DxfOptions {
    development: PanelDevelopment;
    split: PanelSplit;
    params: PanelParams;
    /** Aperture paths already placed into flat-development space. */
    aperture?: FlatPath[];
    /** Keyline paths already placed into flat-development space. */
    keyline?: FlatPath[];
}

export function generateDxf(opts: DxfOptions): string {
    const { development: dev, split, params } = opts;
    const H = dev.totalFlatHMm;
    const fy = (y: number) => H - y; // flip Y (down → up)

    let e = '0\nSECTION\n2\nENTITIES\n';

    // Panel outline + fold lines.
    for (const seg of dev.segments) {
        const { xMm: x, yMm: y, wMm: w, hMm: h } = seg;
        e += line(DXF_LAYERS.PANEL_OUTLINE, x, fy(y), x + w, fy(y));
        e += line(DXF_LAYERS.PANEL_OUTLINE, x + w, fy(y), x + w, fy(y + h));
        e += line(DXF_LAYERS.PANEL_OUTLINE, x + w, fy(y + h), x, fy(y + h));
        e += line(DXF_LAYERS.PANEL_OUTLINE, x, fy(y + h), x, fy(y));
        e += text(
            DXF_LAYERS.DIMENSIONS,
            x + w / 2,
            fy(y + h / 2),
            Math.max(6, Math.min(w, h) / 12),
            `${seg.label}`,
        );
    }
    for (const f of dev.foldLines) {
        e += line(DXF_LAYERS.FOLD_LINES, f.x1, fy(f.y1), f.x2, fy(f.y2));
    }

    // Seam lines: vertical splits across the face, in flat-development X.
    if (split.wasSplit) {
        const face = dev.segments.find((s) => s.role === 'face');
        if (face) {
            // Face X spans faceFlatW for the (deduction-adjusted) face. Seam
            // positions are given in nominal face mm; scale to flat face mm.
            const k = face.wMm / dev.faceNominalWMm;
            for (const sx of split.seamXsMm) {
                const fx = face.xMm + sx * k;
                e += line(DXF_LAYERS.SEAM, fx, fy(face.yMm), fx, fy(face.yMm + face.hMm));
            }
        }
    }

    // Aperture + keyline: each polyline as discrete LINE segments.
    for (const p of opts.aperture ?? []) emitPath(p, DXF_LAYERS.APERTURE);
    for (const p of opts.keyline ?? []) emitPath(p, DXF_LAYERS.KEYLINE);

    function emitPath(p: FlatPath, layer: DxfLayer) {
        for (let i = 0; i + 1 < p.points.length; i++) {
            const a = p.points[i];
            const b = p.points[i + 1];
            e += line(layer, a[0], fy(a[1]), b[0], fy(b[1]));
        }
    }

    // Notes block, below the part.
    const notes = [
        `Onesign panel — ${params.name}`,
        params.materialLabel ? `Material: ${params.materialLabel}` : null,
        `Thickness: ${params.materialThicknessMm}mm`,
        BEND_RULE_TEXT,
        split.wasSplit
            ? `Split into ${split.sections.length} panels (centre full): ${split.sections.join(' / ')}mm`
            : 'Single panel (no split)',
    ].filter(Boolean) as string[];
    notes.forEach((nLine, i) => {
        e += text(DXF_LAYERS.NOTES, 0, -20 - i * 12, 7, nLine);
    });

    e += '0\nENDSEC\n';
    return header() + tables() + e + '0\nEOF\n';
}

export function dxfFilename(params: PanelParams): string {
    const safe = params.name.replace(/[^a-z0-9-_]+/gi, '-').replace(/^-+|-+$/g, '');
    return `${safe || 'panel'}-${Math.round(params.panelWidthMm)}x${Math.round(params.panelHeightMm)}-flat.dxf`;
}
