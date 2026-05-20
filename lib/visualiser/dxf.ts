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
 *
 * All text is ASCII-only and properly justified — R12 readers and older CAM
 * post-processors mangle non-ASCII glyphs and ignore un-justified TEXT
 * placement, both of which made earlier files hard to read on the shop floor.
 */

import {
    DXF_LAYERS,
    DXF_LAYER_COLORS,
    type DxfLayer,
    type PanelParams,
    type PanelDevelopment,
    type PanelSplit,
    type FlatPath,
} from './types';
import { outlinePerimeter } from './geometry';

/** Fold/cut-safe ASCII. R12 + many laser post-processors choke on Unicode. */
function ascii(s: string): string {
    return s
        .replace(/[×✕✖]/g, 'x')
        .replace(/÷/g, '/')
        .replace(/[—–]/g, '-')
        .replace(/°/g, ' deg')
        .replace(/[·•]/g, '-')
        .replace(/≤/g, '<=')
        .replace(/≥/g, '>=')
        .replace(/…/g, '...')
        .replace(/[\r\n]+/g, ' ')
        .replace(/[^\x20-\x7E]/g, '')
        .trim();
}

function header(): string {
    // $INSUNITS=4 (mm), $MEASUREMENT=1 (metric) so importers scale correctly.
    return (
        '0\nSECTION\n2\nHEADER\n' +
        '9\n$INSUNITS\n70\n4\n' +
        '9\n$MEASUREMENT\n70\n1\n' +
        '0\nENDSEC\n'
    );
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

/** Left-baseline TEXT (notes / annotations placed clear of geometry). */
function text(
    layer: DxfLayer,
    x: number,
    y: number,
    h: number,
    value: string,
): string {
    return `0\nTEXT\n8\n${layer}\n10\n${r(x)}\n20\n${r(y)}\n30\n0\n40\n${r(h)}\n1\n${ascii(value)}\n`;
}

/** Centre/middle-justified TEXT — group codes 72=1, 73=2 with the aligned
 *  point (11/21). Without these an R12 reader left-aligns at the baseline,
 *  so on-part labels drift off their boxes. */
function textCentered(
    layer: DxfLayer,
    x: number,
    y: number,
    h: number,
    value: string,
): string {
    return (
        `0\nTEXT\n8\n${layer}\n` +
        `10\n${r(x)}\n20\n${r(y)}\n30\n0\n` +
        `40\n${r(h)}\n1\n${ascii(value)}\n` +
        `72\n1\n` +
        `11\n${r(x)}\n21\n${r(y)}\n31\n0\n` +
        `73\n2\n`
    );
}

function r(n: number): number {
    return Math.round(n * 1000) / 1000;
}

function clamp(v: number, lo: number, hi: number): number {
    return Math.max(lo, Math.min(hi, v));
}

interface DxfOptions {
    development: PanelDevelopment;
    split: PanelSplit;
    params: PanelParams;
    /** Aperture paths already placed into flat-development space. */
    aperture?: FlatPath[];
    /** Keyline paths already placed into flat-development space. */
    keyline?: FlatPath[];
    /** Stand-off fixing holes (already placed). Cut on FIXINGS layer. */
    fixings?: FlatPath[];
}

export function generateDxf(opts: DxfOptions): string {
    const { development: dev, split, params } = opts;
    const H = dev.totalFlatHMm;
    const fy = (y: number) => H - y; // flip Y (down → up)

    let e = '0\nSECTION\n2\nENTITIES\n';

    // ONE merged outer cut perimeter — never the internal face/return
    // edges, which are folds, not cuts. Discrete LINEs (no polyline/block)
    // that share endpoints, so CAM chains them into one closed contour.
    const perimeter = outlinePerimeter(dev);
    if (perimeter) {
        const pts = perimeter.points;
        for (let i = 0; i + 1 < pts.length; i++) {
            e += line(
                DXF_LAYERS.PANEL_OUTLINE,
                pts[i][0],
                fy(pts[i][1]),
                pts[i + 1][0],
                fy(pts[i + 1][1]),
            );
        }
    } else {
        // Degenerate geometry — fall back to per-segment rectangles.
        for (const seg of dev.segments) {
            const { xMm: x, yMm: y, wMm: w, hMm: h } = seg;
            e += line(DXF_LAYERS.PANEL_OUTLINE, x, fy(y), x + w, fy(y));
            e += line(DXF_LAYERS.PANEL_OUTLINE, x + w, fy(y), x + w, fy(y + h));
            e += line(DXF_LAYERS.PANEL_OUTLINE, x + w, fy(y + h), x, fy(y + h));
            e += line(DXF_LAYERS.PANEL_OUTLINE, x, fy(y + h), x, fy(y));
        }
    }

    // Centred role label per segment (DIMENSIONS layer — never on the cut
    // layer, so a cutter selecting PANEL_OUTLINE never picks up text).
    for (const seg of dev.segments) {
        const small = Math.min(seg.wMm, seg.hMm);
        if (small >= 25) {
            e += textCentered(
                DXF_LAYERS.DIMENSIONS,
                seg.xMm + seg.wMm / 2,
                fy(seg.yMm + seg.hMm / 2),
                clamp(small / 9, 4, 22),
                seg.label,
            );
        }
    }

    // Fold lines + an explicit "FOLD - DO NOT CUT" tag at each midpoint so a
    // laser operator can never mistake a bend for a cut.
    for (const f of dev.foldLines) {
        e += line(DXF_LAYERS.FOLD_LINES, f.x1, fy(f.y1), f.x2, fy(f.y2));
        const mx = (f.x1 + f.x2) / 2;
        const my = (f.y1 + f.y2) / 2;
        const horizontal = Math.abs(f.x2 - f.x1) >= Math.abs(f.y2 - f.y1);
        const tagH = clamp(
            (horizontal ? Math.abs(f.x2 - f.x1) : Math.abs(f.y2 - f.y1)) / 14,
            3,
            14,
        );
        e += textCentered(
            DXF_LAYERS.FOLD_LINES,
            mx,
            fy(my),
            tagH,
            `FOLD ${f.note.includes('in') ? 'IN' : 'BACK'} - DO NOT CUT`,
        );
    }

    // Seam lines: vertical splits across the face + a "PANEL JOIN" tag.
    if (split.wasSplit) {
        const face = dev.segments.find((s) => s.role === 'face');
        if (face) {
            const k = face.wMm / dev.faceNominalWMm;
            const tagH = clamp(face.hMm / 16, 3, 14);
            for (const sx of split.seamXsMm) {
                const fx = face.xMm + sx * k;
                e += line(
                    DXF_LAYERS.SEAM,
                    fx,
                    fy(face.yMm),
                    fx,
                    fy(face.yMm + face.hMm),
                );
                e += textCentered(
                    DXF_LAYERS.SEAM,
                    fx,
                    fy(face.yMm + face.hMm / 2),
                    tagH,
                    'PANEL JOIN',
                );
            }
        }
    }

    // Aperture + keyline + fixings: each polyline as discrete LINE segments.
    for (const p of opts.aperture ?? []) emitPath(p, DXF_LAYERS.APERTURE);
    for (const p of opts.keyline ?? []) emitPath(p, DXF_LAYERS.KEYLINE);
    for (const p of opts.fixings ?? []) emitPath(p, DXF_LAYERS.FIXINGS);

    function emitPath(p: FlatPath, layer: DxfLayer) {
        for (let i = 0; i + 1 < p.points.length; i++) {
            const a = p.points[i];
            const b = p.points[i + 1];
            e += line(layer, a[0], fy(a[1]), b[0], fy(b[1]));
        }
    }

    // Notes block, below the part, left-aligned and legible. Includes a
    // layer legend so whoever opens the file knows what cuts and what bends.
    const sectionLabel = split.wasSplit
        ? `Split ${split.sections.length} panels (centre full): ${split.sections.join(' / ')} mm`
        : 'Single panel (no split)';
    const notes = [
        `ONESIGN PANEL  -  ${params.name}`,
        `Overall flat blank: ${dev.totalFlatWMm} x ${dev.totalFlatHMm} mm`,
        `Sign face: ${dev.faceNominalWMm} x ${dev.faceNominalHMm} mm   Return: ${params.returnDepthMm} mm` +
            (params.shadowGapMm > 0
                ? `   Shadow gap: ${params.shadowGapMm} mm`
                : '') +
            (params.keylineMm > 0 ? `   Keyline: ${params.keylineMm} mm` : ''),
        params.materialLabel
            ? `Material: ${params.materialLabel}   Thickness: ${params.materialThicknessMm} mm`
            : `Thickness: ${params.materialThicknessMm} mm`,
        'Bend allowance: half material thickness deducted each side of every fold line',
        sectionLabel,
        'LAYERS:  PANEL_OUTLINE = cut   APERTURE = cut   FIXINGS = stand-off fixing holes (cut)   KEYLINE = register (cut if specified)   FOLD_LINES = bend, DO NOT CUT   SEAM = panel join, DO NOT CUT',
    ];
    const noteH = 7;
    notes.forEach((nLine, i) => {
        e += text(DXF_LAYERS.NOTES, 0, -24 - i * (noteH * 1.8), noteH, nLine);
    });

    e += '0\nENDSEC\n';
    return header() + tables() + e + '0\nEOF\n';
}

export function dxfFilename(params: PanelParams): string {
    const safe = params.name
        .replace(/[^a-z0-9-_]+/gi, '-')
        .replace(/^-+|-+$/g, '');
    return `${safe || 'panel'}-${Math.round(params.panelWidthMm)}x${Math.round(
        params.panelHeightMm,
    )}-flat.dxf`;
}
