/**
 * Production-file generator — "Back to the Future" neon sign, 1:1 scale.
 *
 * Builds the shop's own typographic neon artwork (the words set as outline-neon
 * lettering in the brand font — not a copy of the film's stylised logo), then
 * drives the REAL Neon-length engine (`lib/visualiser/*`) — the same code path
 * the /admin/visualiser/neon tool uses when a designer uploads an SVG — to emit:
 *
 *   1. back-to-the-future-neon.svg          — 1:1 master artwork (real mm)
 *   2. back-to-the-future-neon-lengths.pdf   — annotated run-length take-off
 *   3. back-to-the-future-neon-template-1to1.pdf — true 1:1 tiled bending template
 *
 * Run:  node_modules/.bin/tsx scripts/neon-bttf/generate.ts
 */

import fs from 'node:fs';
import path from 'node:path';
import * as opentypeNS from 'opentype.js';
import { Window } from 'happy-dom';
import { jsPDF } from 'jspdf';

const opentype: typeof import('opentype.js') =
    (opentypeNS as any).default ?? opentypeNS;

/** Load a TTF synchronously as an opentype Font (loadSync is deprecated). */
function loadFont(p: string) {
    const b = fs.readFileSync(p);
    return opentype.parse(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength),
    );
}

// ---------------------------------------------------------------------------
// Browser-shims so the (browser-only) engine runs headless, unchanged.
// ---------------------------------------------------------------------------
const win = new Window();
(globalThis as any).DOMParser = win.DOMParser;

// Serve /fonts/*.ttf from public/fonts so the PDF embeds the brand font Gilroy
// (pdf-fonts.ts fetches them; falls back to Helvetica if this shim is absent).
const realFetch = (globalThis as any).fetch;
(globalThis as any).fetch = async (url: string, init?: any) => {
    if (typeof url === 'string' && url.startsWith('/fonts/')) {
        const buf = fs.readFileSync(path.join('public', url));
        return {
            ok: true,
            status: 200,
            arrayBuffer: async () =>
                buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
        } as any;
    }
    if (realFetch) return realFetch(url, init);
    throw new Error(`no fetch for ${url}`);
};

// Engine (relative imports; internals resolve via tsx).
import { importSvg } from '../../lib/visualiser/svg-import';
import {
    measureNeon,
    totalLengthMm,
    colourBreakdown,
    transformerCount,
    formatMm,
    formatM,
    type NeonElement,
} from '../../lib/visualiser/neon';
import { buildShapedBackboard } from '../../lib/visualiser/neon-backboard';
import { generateNeonPdfBlob } from '../../lib/visualiser/neon-pdf';

// ---------------------------------------------------------------------------
// Design parameters
// ---------------------------------------------------------------------------
const OUT_DIR = 'docs/production/back-to-the-future-neon';
const NAME = 'Back to the Future — neon';
const TARGET_WIDTH_MM = 1000; // finished overall artwork width
const LEAN_DEG = 10; // forward italic lean of the whole lockup
const EM_FUTURE = 200; // relative em of the big line
const EM_SUB = 76; // relative em of the small top line
const COLOUR_FUTURE = '#ff2e1c'; // neon red
const COLOUR_SUB = '#ffd21e'; // neon amber
const BACKBOARD_PADDING_MM = 60;
const CABLE_SIDE = 'bottom' as const;
const METRES_PER_TRANSFORMER = 10;

const FONT = loadFont('public/fonts/Gilroy-Bold.ttf');
const K = Math.tan((LEAN_DEG * Math.PI) / 180);

type Cmd = opentype.PathCommand;
type XF = (x: number, y: number) => [number, number];

/** Serialize opentype path commands to an SVG `d`, mapping every coord via `tf`. */
function cmdsToD(cmds: Cmd[], tf: XF): string {
    const r = (n: number) => Math.round(n * 1000) / 1000;
    const p = (x: number, y: number) => {
        const [X, Y] = tf(x, y);
        return `${r(X)} ${r(Y)}`;
    };
    let d = '';
    for (const c of cmds as any[]) {
        if (c.type === 'M') d += `M${p(c.x, c.y)}`;
        else if (c.type === 'L') d += `L${p(c.x, c.y)}`;
        else if (c.type === 'C')
            d += `C${p(c.x1, c.y1)} ${p(c.x2, c.y2)} ${p(c.x, c.y)}`;
        else if (c.type === 'Q') d += `Q${p(c.x1, c.y1)} ${p(c.x, c.y)}`;
        else if (c.type === 'Z') d += 'Z';
    }
    return d;
}

// Big line: FUTURE, baseline at y=0, x from 0.
const pFuture = FONT.getPath('FUTURE', 0, 0, EM_FUTURE);
const bbF = pFuture.getBoundingBox();
const wF = bbF.x2 - bbF.x1;

// Small line: BACK TO THE, centred over FUTURE, sitting above it.
const pSub = FONT.getPath('BACK TO THE', 0, 0, EM_SUB);
const bbS = pSub.getBoundingBox();
const wS = bbS.x2 - bbS.x1;
const gap = EM_FUTURE * 0.14;
const dxSub = bbF.x1 + (wF - wS) / 2 - bbS.x1; // centre subtitle over FUTURE ink
const dySub = bbF.y1 - gap - bbS.y2; // lift so its lowest point clears FUTURE top

// Per-line base transform: (optional line translate) then shear about y=0.
const shear = (x: number, y: number): [number, number] => [x + K * (0 - y), y];
const baseFuture: XF = (x, y) => shear(x, y);
const baseSub: XF = (x, y) => shear(x + dxSub, y + dySub);

// ---- Pass 1: sheared, un-scaled — measure the true flattened bbox via the
// real importer so the calibration is exact.
const shearedSvg = wrapSvg(
    [
        `<path d="${cmdsToD(pFuture.commands as Cmd[], baseFuture)}"/>`,
        `<path d="${cmdsToD(pSub.commands as Cmd[], baseSub)}"/>`,
    ].join(''),
    // generous nominal box; importer only needs geometry for the bbox here
    { widthMm: 4000, heightMm: 2000, viewW: 4000, viewH: 2000 },
);
const bb0 = importSvg(shearedSvg).bbox; // {x,y,w,h} in sheared units
const s = TARGET_WIDTH_MM / bb0.w;
const heightMm = bb0.h * s;

// ---- Pass 2: final 1:1 artwork — scale to target, translate to origin.
const finalXF =
    (base: XF): XF =>
    (x, y) => {
        const [sx, sy] = base(x, y);
        return [(sx - bb0.x) * s, (sy - bb0.y) * s];
    };
const dFuture = cmdsToD(pFuture.commands as Cmd[], finalXF(baseFuture));
const dSub = cmdsToD(pSub.commands as Cmd[], finalXF(baseSub));

const masterSvg = wrapSvg(
    `  <g fill="none" stroke-width="10" stroke-linejoin="round" stroke-linecap="round">\n` +
        `    <path d="${dSub}" stroke="${COLOUR_SUB}"/>\n` +
        `    <path d="${dFuture}" stroke="${COLOUR_FUTURE}"/>\n` +
        `  </g>`,
    {
        widthMm: round1(TARGET_WIDTH_MM),
        heightMm: round1(heightMm),
        viewW: round1(TARGET_WIDTH_MM),
        viewH: round1(heightMm),
        pretty: true,
        title: NAME,
    },
);

function round1(n: number) {
    return Math.round(n * 10) / 10;
}

function wrapSvg(
    inner: string,
    o: {
        widthMm: number;
        heightMm: number;
        viewW: number;
        viewH: number;
        pretty?: boolean;
        title?: string;
    },
): string {
    const nl = o.pretty ? '\n' : '';
    return (
        `<svg xmlns="http://www.w3.org/2000/svg" width="${o.widthMm}mm" height="${o.heightMm}mm" viewBox="0 0 ${o.viewW} ${o.viewH}">${nl}` +
        (o.title ? `  <title>${o.title}</title>${nl}` : '') +
        inner +
        nl +
        `</svg>${nl}`
    );
}

// ---------------------------------------------------------------------------
// Drive the real engine on the finished 1:1 artwork.
// ---------------------------------------------------------------------------
const imported = importSvg(masterSvg);
const elements = measureNeon(imported.paths);
const bbox = {
    minX: imported.bbox.x,
    minY: imported.bbox.y,
    maxX: imported.bbox.x + imported.bbox.w,
    maxY: imported.bbox.y + imported.bbox.h,
};
const total = totalLengthMm(elements);
const breakdown = colourBreakdown(elements);
const transformers = transformerCount(total, METRES_PER_TRANSFORMER);
const shaped = buildShapedBackboard(elements, BACKBOARD_PADDING_MM);

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'back-to-the-future-neon.svg'), masterSvg);

const pdfBlob = await generateNeonPdfBlob({
    name: NAME,
    elements,
    bbox,
    backboard: {
        enabled: true,
        shape: 'rectangle',
        paddingMm: BACKBOARD_PADDING_MM,
    },
    transformers,
    cableSide: CABLE_SIDE,
});
fs.writeFileSync(
    path.join(OUT_DIR, 'back-to-the-future-neon-lengths.pdf'),
    Buffer.from(await (pdfBlob as Blob).arrayBuffer()),
);

// ---------------------------------------------------------------------------
// True 1:1 tiled bending template (A3 landscape, 1mm = 1mm).
// ---------------------------------------------------------------------------
buildTemplate(
    path.join(OUT_DIR, 'back-to-the-future-neon-template-1to1.pdf'),
    elements,
    bbox,
);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
const artW = bbox.maxX - bbox.minX;
const artH = bbox.maxY - bbox.minY;
const boardW = artW + BACKBOARD_PADDING_MM * 2;
const boardH = artH + BACKBOARD_PADDING_MM * 2;
console.log('=== Back to the Future neon — production summary ===');
console.log(`Artwork (1:1)   : ${Math.round(artW)} × ${Math.round(artH)} mm`);
console.log(`Runs            : ${elements.length}`);
console.log(`Total neon flex : ${formatMm(total)} (${formatM(total)})`);
console.log(`Transformers    : ${transformers} @ ${METRES_PER_TRANSFORMER} m each`);
console.log(`Cable entry     : ${CABLE_SIDE}`);
console.log(
    `Backboard       : rectangle ${Math.round(boardW)} × ${Math.round(boardH)} mm ` +
        `(clear acrylic, ${BACKBOARD_PADDING_MM} mm border) — ${(
            (boardW * boardH) /
            1_000_000
        ).toFixed(2)} m²`,
);
console.log('Neon flex by colour:');
for (const b of breakdown) {
    console.log(
        `  ${(b.color ?? 'not set').toUpperCase().padEnd(9)} ` +
            `${String(b.runs).padStart(2)} runs   ${formatM(b.lengthMm)}`,
    );
}
console.log(`Files written to ${OUT_DIR}/`);

// Emit the spec JSON so the README stays in sync with the numbers.
fs.writeFileSync(
    path.join(OUT_DIR, 'spec.json'),
    JSON.stringify(
        {
            name: NAME,
            targetWidthMm: TARGET_WIDTH_MM,
            artworkMm: { w: Math.round(artW), h: Math.round(artH) },
            runs: elements.length,
            totalMm: Math.round(total),
            totalM: +(total / 1000).toFixed(2),
            transformers,
            metresPerTransformer: METRES_PER_TRANSFORMER,
            cableSide: CABLE_SIDE,
            backboard: {
                shape: 'rectangle',
                paddingMm: BACKBOARD_PADDING_MM,
                wMm: Math.round(boardW),
                hMm: Math.round(boardH),
                areaM2: +((boardW * boardH) / 1_000_000).toFixed(2),
            },
            colours: breakdown.map((b) => ({
                colour: b.color ?? null,
                runs: b.runs,
                m: +(b.lengthMm / 1000).toFixed(2),
            })),
            shapedBackboardAreaM2: +(shaped.areaMm2 / 1_000_000).toFixed(2),
        },
        null,
        2,
    ),
);

// ===========================================================================
// Template builder
// ===========================================================================
function buildTemplate(
    file: string,
    els: NeonElement[],
    bb: { minX: number; minY: number; maxX: number; maxY: number },
) {
    const PAGE_W = 420;
    const PAGE_H = 297; // A3 landscape
    const MARGIN = 12;
    const OVERLAP = 15;
    const printW = PAGE_W - MARGIN * 2;
    const printH = PAGE_H - MARGIN * 2;
    const stepX = printW - OVERLAP;
    const stepY = printH - OVERLAP;
    const artW = bb.maxX - bb.minX;
    const artH = bb.maxY - bb.minY;
    const cols = Math.max(1, Math.ceil((artW - OVERLAP) / stepX));
    const rows = Math.max(1, Math.ceil((artH - OVERLAP) / stepY));

    const doc = new jsPDF({ unit: 'mm', format: 'a3', orientation: 'landscape' });
    const ACCENT: [number, number, number] = [78, 126, 140];
    const rgb = (hex: string): [number, number, number] => {
        const h = hex.replace('#', '');
        return [
            parseInt(h.slice(0, 2), 16),
            parseInt(h.slice(2, 4), 16),
            parseInt(h.slice(4, 6), 16),
        ];
    };

    // ---- Map / cover page: whole artwork to fit + tile grid --------------
    doc.setFillColor(...ACCENT);
    doc.rect(0, 0, PAGE_W, 20, 'F');
    doc.setTextColor(255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(14);
    doc.text('NEON BENDING TEMPLATE · 1:1', MARGIN, 13);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(NAME, PAGE_W - MARGIN, 8, { align: 'right' });
    doc.text(
        `${Math.round(artW)} × ${Math.round(artH)} mm  ·  ${rows} × ${cols} A3 tiles  ·  print at 100% (no scaling)`,
        PAGE_W - MARGIN,
        14,
        { align: 'right' },
    );
    doc.setTextColor(0);

    const mapTop = 30;
    const mapMaxW = PAGE_W - MARGIN * 2;
    const mapMaxH = PAGE_H - mapTop - 24;
    const ms = Math.min(mapMaxW / artW, mapMaxH / artH);
    const mW = artW * ms;
    const mH = artH * ms;
    const mX = (PAGE_W - mW) / 2;
    const mY = mapTop;
    const tx = (x: number) => mX + (x - bb.minX) * ms;
    const ty = (y: number) => mY + (y - bb.minY) * ms;

    // artwork runs
    doc.setLineWidth(0.4);
    for (const el of els) {
        doc.setDrawColor(...rgb(el.stroke ?? '#4e7e8c'));
        const pts = el.points;
        for (let i = 1; i < pts.length; i++)
            doc.line(tx(pts[i - 1][0]), ty(pts[i - 1][1]), tx(pts[i][0]), ty(pts[i][1]));
        if (el.closed)
            doc.line(
                tx(pts[pts.length - 1][0]),
                ty(pts[pts.length - 1][1]),
                tx(pts[0][0]),
                ty(pts[0][1]),
            );
    }
    // tile grid overlay
    doc.setDrawColor(200);
    doc.setLineWidth(0.2);
    doc.setFontSize(8);
    doc.setTextColor(120);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const gx = mX + c * stepX * ms;
            const gy = mY + r * stepY * ms;
            const gw = Math.min(printW, artW - c * stepX) * ms;
            const gh = Math.min(printH, artH - r * stepY) * ms;
            doc.rect(gx, gy, gw, gh, 'S');
            doc.text(`R${r + 1}C${c + 1}`, gx + 1.5, gy + 4);
        }
    }
    doc.setTextColor(0);
    doc.setFontSize(8);
    doc.text(
        'Assemble tiles in the R×C grid above, trimming each page to the crop marks and overlapping to the registration crosses. ' +
            'Verify the 100 mm check-bar on every sheet before bending.',
        MARGIN,
        PAGE_H - 12,
        { maxWidth: PAGE_W - MARGIN * 2 },
    );

    // ---- One page per tile, drawn 1:1 -----------------------------------
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            doc.addPage('a3', 'landscape');
            const originX = bb.minX + c * stepX; // artwork mm at page inner-left
            const originY = bb.minY + r * stepY;
            const px = (x: number) => MARGIN + (x - originX);
            const py = (y: number) => MARGIN + (y - originY);

            // runs (viewer clips to the page media box)
            doc.setLineWidth(0.6);
            for (const el of els) {
                doc.setDrawColor(...rgb(el.stroke ?? '#4e7e8c'));
                const pts = el.points;
                for (let i = 1; i < pts.length; i++)
                    doc.line(px(pts[i - 1][0]), py(pts[i - 1][1]), px(pts[i][0]), py(pts[i][1]));
                if (el.closed)
                    doc.line(
                        px(pts[pts.length - 1][0]),
                        py(pts[pts.length - 1][1]),
                        px(pts[0][0]),
                        py(pts[0][1]),
                    );
            }

            // crop marks at the printable rectangle corners
            doc.setDrawColor(0);
            doc.setLineWidth(0.2);
            const cm = 6;
            const corners: [number, number][] = [
                [MARGIN, MARGIN],
                [PAGE_W - MARGIN, MARGIN],
                [MARGIN, PAGE_H - MARGIN],
                [PAGE_W - MARGIN, PAGE_H - MARGIN],
            ];
            for (const [x, y] of corners) {
                doc.line(x - cm, y, x + cm, y);
                doc.line(x, y - cm, x, y + cm);
            }

            // tile label + 100 mm scale-check bar (bottom-left, inside margin)
            doc.setFontSize(9);
            doc.setFont('helvetica', 'bold');
            doc.setTextColor(...ACCENT);
            doc.text(`TILE R${r + 1}C${c + 1}  (of ${rows}×${cols})`, MARGIN + 2, MARGIN + 6);
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(0);
            const barY = PAGE_H - MARGIN - 4;
            doc.setLineWidth(0.5);
            doc.setDrawColor(0);
            doc.line(MARGIN + 2, barY, MARGIN + 102, barY);
            doc.line(MARGIN + 2, barY - 2, MARGIN + 2, barY + 2);
            doc.line(MARGIN + 102, barY - 2, MARGIN + 102, barY + 2);
            doc.setFontSize(7);
            doc.text('100 mm — verify printed at 100%', MARGIN + 2, barY - 3);
        }
    }

    fs.writeFileSync(file, Buffer.from(doc.output('arraybuffer')));
    console.log(`Template tiles  : ${rows} × ${cols} A3 (1:1)`);
}
