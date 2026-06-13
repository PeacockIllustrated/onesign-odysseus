/**
 * LED layout & wiring drawing (A4 landscape, jsPDF).
 *
 * The sheet the workshop wires from:
 *   1. LAYOUT — the letters with every LED module dotted, the runs drawn and
 *      coloured per driver, the driver boxes placed central to their runs, and
 *      the mains feed routed to each driver. Optional 3D capture inset.
 *   2. POWER SCHEDULE — a driver-by-driver table (type, load, % of capacity,
 *      runs, modules) + totals + a parts/BOM line.
 *   3. ELECTRICAL NOTES — voltage, parallel wiring, the run / voltage-drop cap,
 *      dedicated circuit + grounding, driver mounting.
 *
 * Browser-only (jsPDF). Callers are client components.
 */

import { jsPDF } from 'jspdf';
import { registerVisualiserFonts } from './pdf-fonts';
import {
    formatW,
    formatMm,
    driverCost,
    CLASS2_AMPS,
    type LedLayoutAnalysis,
    type LedLayoutConfig,
    type LedDriverSpec,
    type Pt,
} from './led-layout';

const ACCENT: [number, number, number] = [78, 126, 140];
const INK: [number, number, number] = [26, 31, 35];
const FEED: [number, number, number] = [212, 102, 26];
const PAGE_W = 297;
const PAGE_H = 210;
const margin = 14;

/** Distinct colours so each driver's runs + modules read apart at a glance. */
const DRIVER_COLORS: Array<[number, number, number]> = [
    [78, 126, 140],
    [212, 102, 26],
    [34, 139, 87],
    [120, 80, 170],
    [200, 60, 90],
    [40, 110, 180],
    [170, 140, 30],
    [90, 100, 110],
];
const driverColor = (i: number) => DRIVER_COLORS[(i - 1 + DRIVER_COLORS.length) % DRIVER_COLORS.length];

export interface LedLayoutPdfOptions {
    name: string;
    analysis: LedLayoutAnalysis;
    config: LedLayoutConfig;
    driverSpecs?: LedDriverSpec[];
    /** Trimmed PNG of the 3D preview, dropped onto page 1. */
    snapshotDataUrl?: string | null;
}

function header(doc: jsPDF, font: string, title: string, name: string, analysis: LedLayoutAnalysis) {
    doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
    doc.rect(0, 0, PAGE_W, 18, 'F');
    doc.setTextColor(255);
    doc.setFont(font, 'bold');
    doc.setFontSize(12);
    doc.text(title, margin, 11.5);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.text(name, PAGE_W - margin, 6.5, { align: 'right' });
    doc.text(
        `${analysis.totalModules} module${analysis.totalModules === 1 ? '' : 's'}  ·  ${analysis.runs.length} run${analysis.runs.length === 1 ? '' : 's'}  ·  ${analysis.drivers.length} driver${analysis.drivers.length === 1 ? '' : 's'}`,
        PAGE_W - margin,
        11.5,
        { align: 'right' },
    );
    doc.setFontSize(8);
    doc.text(`TOTAL LOAD ${formatW(analysis.totalWatts)}`, PAGE_W - margin, 15.5, { align: 'right' });
    doc.setTextColor(0);
}

function fitScale(w: number, h: number, partW: number, partH: number): number {
    return Math.min(w / Math.max(partW, 1e-6), h / Math.max(partH, 1e-6));
}

export async function generateLedLayoutPdfBlob(opts: LedLayoutPdfOptions): Promise<Blob> {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const fontRes = await registerVisualiserFonts(doc);
    const font = fontRes.family;
    const { analysis, config } = opts;

    doc.setProperties({
        title: `${opts.name} — LED layout & wiring`,
        subject: 'Illuminated signage LED module layout + driver schedule',
        author: 'Onesign Odysseus',
        keywords: 'LED, illumination, wiring, driver, transformer, signage, onesign',
    });

    // ===================== PAGE 1 — layout =====================
    header(doc, font, 'LED LAYOUT & WIRING', opts.name, analysis);

    const top = 24;
    const hasSnap = !!opts.snapshotDataUrl;
    const snapW = hasSnap ? 70 : 0;
    const drawW = PAGE_W - 2 * margin - (hasSnap ? snapW + 6 : 0);
    const drawH = PAGE_H - top - margin;

    const bb = analysis.bbox;
    const partW = Math.max(1, bb.maxX - bb.minX);
    const partH = Math.max(1, bb.maxY - bb.minY);
    const scale = fitScale(drawW, drawH, partW, partH);
    const dX = margin + (drawW - partW * scale) / 2;
    const dY = top + (drawH - partH * scale) / 2;
    const px = (x: number) => dX + (x - bb.minX) * scale;
    const py = (y: number) => dY + (y - bb.minY) * scale;

    // Letter outlines (faint).
    doc.setDrawColor(180);
    doc.setLineWidth(0.3);
    for (const l of analysis.letters) {
        const p = l.points;
        for (let i = 1; i < p.length; i++) doc.line(px(p[i - 1][0]), py(p[i - 1][1]), px(p[i][0]), py(p[i][1]));
        if (p.length > 1) doc.line(px(p[p.length - 1][0]), py(p[p.length - 1][1]), px(p[0][0]), py(p[0][1]));
    }

    // Feed lines: cable entry → each driver.
    const entry = analysis.cableEntry;
    doc.setDrawColor(FEED[0], FEED[1], FEED[2]);
    doc.setLineWidth(0.5);
    for (const d of analysis.drivers) {
        doc.line(px(entry[0]), py(entry[1]), px(d.position[0]), py(d.position[1]));
    }
    // Cable-in marker.
    doc.setFillColor(FEED[0], FEED[1], FEED[2]);
    doc.circle(px(entry[0]), py(entry[1]), 1.6, 'F');

    // Runs: polyline through each run's modules, coloured by driver.
    for (const run of analysis.runs) {
        const c = driverColor(run.driverIndex);
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.setLineWidth(0.4);
        const m = run.modules;
        for (let i = 1; i < m.length; i++) doc.line(px(m[i - 1][0]), py(m[i - 1][1]), px(m[i][0]), py(m[i][1]));
        // Module dots.
        doc.setFillColor(c[0], c[1], c[2]);
        for (const mod of m) doc.circle(px(mod[0]), py(mod[1]), 0.7, 'F');
    }

    // Driver boxes.
    doc.setFontSize(7);
    for (const d of analysis.drivers) {
        const c = driverColor(d.index);
        const bx = px(d.position[0]);
        const by = py(d.position[1]);
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(c[0], c[1], c[2]);
        doc.setLineWidth(0.5);
        doc.rect(bx - 5, by - 3, 10, 6, 'FD');
        doc.setTextColor(c[0], c[1], c[2]);
        doc.setFont(font, 'bold');
        doc.text(`D${d.index}`, bx, by + 1, { align: 'center' });
    }
    doc.setTextColor(0);

    // Letter balloons.
    doc.setFontSize(7.5);
    for (const l of analysis.letters) {
        const cx = px(l.centroid[0]);
        const cy = py(l.centroid[1]);
        doc.setFillColor(ACCENT[0], ACCENT[1], ACCENT[2]);
        doc.circle(cx, cy, 2.6, 'F');
        doc.setTextColor(255);
        doc.setFont(font, 'bold');
        doc.text(String(l.index), cx, cy + 1, { align: 'center' });
    }
    doc.setTextColor(0);

    if (hasSnap && opts.snapshotDataUrl) {
        try {
            const props = doc.getImageProperties(opts.snapshotDataUrl);
            const x0 = PAGE_W - margin - snapW;
            const ar = props.width / Math.max(1, props.height);
            let iw = snapW;
            let ih = iw / ar;
            if (ih > 52) {
                ih = 52;
                iw = ih * ar;
            }
            doc.addImage(opts.snapshotDataUrl, 'PNG', x0 + (snapW - iw) / 2, top, iw, ih, undefined, 'FAST');
            doc.setDrawColor(210);
            doc.setLineWidth(0.2);
            doc.rect(x0 + (snapW - iw) / 2, top, iw, ih);
        } catch {
            /* bad capture — skip */
        }
    }

    // ===================== PAGE 2 — power schedule =====================
    doc.addPage('a4', 'landscape');
    header(doc, font, 'LED LAYOUT · POWER SCHEDULE', opts.name, analysis);

    const ty = 30;
    const cols = [margin, margin + 18, margin + 46, margin + 72, margin + 94, margin + 116, margin + 144];
    doc.setFont(font, 'bold');
    doc.setFontSize(8);
    doc.setTextColor(INK[0], INK[1], INK[2]);
    doc.text('DRIVER', cols[0], ty);
    doc.text('TYPE', cols[1], ty);
    doc.text('LOAD', cols[2], ty);
    doc.text('% CAP', cols[3], ty);
    doc.text('OUT', cols[4], ty);
    doc.text('MODULES', cols[5], ty);
    doc.text('RUNS', cols[6], ty);
    doc.setDrawColor(180);
    doc.line(margin, ty + 2, PAGE_W - margin, ty + 2);

    doc.setFont(font, 'normal');
    doc.setTextColor(0);
    let ry = ty + 8;
    for (const d of analysis.drivers) {
        const c = driverColor(d.index);
        doc.setFillColor(c[0], c[1], c[2]);
        doc.circle(cols[0] + 1.5, ry - 1.4, 1.6, 'F');
        doc.text(`D${d.index}`, cols[0] + 5, ry);
        doc.text(d.type, cols[1], ry);
        doc.text(formatW(d.loadW), cols[2], ry);
        doc.text(`${Math.round(d.loadPct)}%`, cols[3], ry);
        doc.text(String(d.outputs), cols[4], ry);
        doc.text(String(d.moduleCount), cols[5], ry);
        doc.text(d.runIndices.join(', ') || '—', cols[6], ry);
        ry += 6;
        if (ry > PAGE_H - margin - 30) break;
    }

    // Totals + BOM.
    const cost = opts.driverSpecs ? driverCost(analysis.drivers, opts.driverSpecs) : 0;
    const byType = new Map<string, number>();
    for (const d of analysis.drivers) byType.set(d.type, (byType.get(d.type) ?? 0) + 1);
    const bom = [...byType.entries()].map(([t, n]) => `${n}× ${t}`).join(', ');

    const sy = Math.min(ry + 4, PAGE_H - margin - 26);
    doc.setDrawColor(INK[0], INK[1], INK[2]);
    doc.setLineWidth(0.4);
    doc.line(margin, sy, PAGE_W - margin, sy);
    doc.setFont(font, 'bold');
    doc.setFontSize(9);
    doc.text(
        `TOTAL  ·  ${analysis.totalModules} modules  ·  ${formatW(analysis.totalWatts)}  ·  ${analysis.drivers.length} drivers`,
        margin,
        sy + 7,
    );
    doc.setFont(font, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(90);
    doc.text(`Drivers: ${bom || '—'}`, margin, sy + 13);
    doc.text(
        `${config.voltageV} V · ${config.wattsPerModule} W/module · cascade ${config.cascadeLimit}/run · headroom ${Math.round(config.driverHeadroom * 100)}% · ${config.ipRating}`,
        margin,
        sy + 18,
    );
    if (cost > 0) {
        doc.text(`Est. driver cost £${(cost / 100).toFixed(2)} (rate card)`, margin, sy + 23);
    }
    doc.setTextColor(0);

    // ===================== PAGE 3 — electrical notes =====================
    doc.addPage('a4', 'landscape');
    header(doc, font, 'LED LAYOUT · ELECTRICAL NOTES', opts.name, analysis);
    doc.setFont(font, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(60);
    const modeNote =
        config.lightingMode === 'halo'
            ? `Halo / reverse-lit: modules mount on the back facing the wall, ~${config.standoffMm} mm standoff.`
            : config.lightingMode === 'edge'
              ? 'Edge-lit: modules face a reflective tray; light is routed out indirectly.'
              : 'Front-lit: modules face the translucent acrylic face.';
    const notes: string[] = [
        `Supply: ${config.voltageV} V DC (${config.voltageV === 12 ? 'letters' : 'cabinets / strips'}). Modules wired in PARALLEL — keep voltage uniform across each run.`,
        `Runs split at the cascade limit (${config.cascadeLimit} modules/run) — the published max string before end-of-run voltage drop dims it — with a ${formatMm(config.maxRunLengthMm)} length backstop.`,
        `Each driver output is limited to 5 A (UL Class 2): at ${config.voltageV} V that's ${CLASS2_AMPS * config.voltageV} W per output. Runs pack onto outputs; drivers load to ≤ ${Math.round(config.driverHeadroom * 100)}% of rating (the 80% rule).`,
        modeNote,
        `Mount each driver central to the runs it feeds (boxes D1…), open side up, short whips; keep it within ~5 m of the sign. Amber line shows the feed path.`,
        `Run the mains feed to a dedicated circuit and ground the supply. ${config.ipRating} components for exterior; the 230 V driver + assembled sign carry the CE/UKCA mark (self-declared: LVD + EMC + RoHS). Record the driver's certification on the order.`,
        `Always test a sample letter for brightness + uniformity before the full build. Spacing assumes a standard translucent face — go denser behind dark or perforated vinyl. Quantities are a take-off; allow for spares.`,
    ];
    let ny = 32;
    for (const n of notes) {
        const lines = doc.splitTextToSize(`•  ${n}`, PAGE_W - 2 * margin);
        doc.text(lines, margin, ny);
        ny += lines.length * 5 + 2;
    }
    doc.setTextColor(0);

    return doc.output('blob');
}

/** Build a flat list of module points for any quick external use. */
export function allModulePoints(analysis: LedLayoutAnalysis): Pt[] {
    return analysis.modules;
}
