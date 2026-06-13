/**
 * LED layout & wiring take-off for illuminated signage.
 *
 * The digital version of the wiring drawings a sign shop produces for
 * illuminated built-up / channel letters and light-box cabinets: drop LED
 * modules into each letter, chain them into welded-free "runs" (wired in
 * parallel), size the power supplies (drivers), and total the load — so the
 * workshop builds from a drawing instead of guessing module counts and driver
 * sizes.
 *
 *   1. group  — faces (letter bodies) vs counters (the holes of O/A/e…), via a
 *               boundary-vertex even-odd nesting (a ring letter's centroid sits
 *               in its own hole, so a centroid test mislabels it — the vertex
 *               test doesn't).
 *   2. place  — modules along the stroke (channel letters) or grid-filling the
 *               face area (wide letters / cabinets); 'auto' picks per letter
 *               from its effective stroke width.
 *   3. run    — chain a letter's modules, breaking into runs at the max modules
 *               per run and the max run length (the voltage-drop limit).
 *   4. drive  — first-fit-decreasing bin-pack the runs onto drivers from the
 *               rate-card ladder (with a headroom factor), placed central to
 *               their runs to keep whips short.
 *
 * Pure + DOM-free (raw FlatPaths in mm), so it stays Vitest-covered and
 * worker-ready like the neon / returns / trace engines.
 */

import type { FlatPath } from './types';
import type { FaceType } from './led-modules';

export type Pt = [number, number];

export interface Bbox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export type CableSide = 'left' | 'right' | 'top' | 'bottom';
export type LedStrategy = 'auto' | 'stroke' | 'area';
export type LightingMode = 'front' | 'halo' | 'edge';

/** UL Class-2 limit: each driver output may not exceed 5 A. */
export const CLASS2_AMPS = 5;

export interface LedLayoutConfig {
    /** LED voltage — 12 V for letters, 24 V for cabinets/strips. */
    voltageV: 12 | 24;
    /** How modules are placed. 'auto' decides per letter from its stroke width. */
    strategy: LedStrategy;
    /** Front-lit (face), halo (reverse, on the back) or edge-lit (tray). */
    lightingMode: LightingMode;
    /** Halo standoff from the wall (mm) — halo mode only; ~25 mm typical. */
    standoffMm: number;
    /** Spacing between modules along a run (mm) — on-centre. */
    modulePitchMm: number;
    /** Row spacing for area-fill (mm). */
    rowPitchMm: number;
    /** Power per module (W) — drives the load + driver sizing. */
    wattsPerModule: number;
    /**
     * Cascade limit — the most modules daisy-chained in one string before
     * end-of-run voltage drop dims them (published per module; ~2× at 24 V vs
     * 12 V). The PRIMARY run cap. `maxRunLengthMm` is only a backstop.
     */
    cascadeLimit: number;
    /** Max developed run length (mm) — a secondary voltage-drop backstop. */
    maxRunLengthMm: number;
    /** Use only this fraction of a driver's rated capacity (0..1) — the 80% rule. */
    driverHeadroom: number;
    /** Edge the mains feed enters from. */
    cableSide: CableSide;
    /** IP rating recorded on the schedule (exterior needs IP65+). */
    ipRating: string;
    /** Catalogue module id driving the spacing lookup (null = custom/manual). */
    moduleId: string | null;
    /** Can depth (mm) — keys the module's depth→spacing table. */
    canDepthMm: number;
    /** Face translucency — tightens spacing for darker faces. */
    faceType: FaceType;
}

export const DEFAULT_LED_CONFIG: LedLayoutConfig = {
    voltageV: 12,
    strategy: 'auto',
    lightingMode: 'front',
    standoffMm: 25,
    modulePitchMm: 150,
    rowPitchMm: 120,
    wattsPerModule: 0.72,
    cascadeLimit: 40,
    maxRunLengthMm: 5000,
    driverHeadroom: 0.8,
    cableSide: 'left',
    ipRating: 'IP65',
    moduleId: null,
    canDepthMm: 100,
    faceType: 'standard',
};

/** Cascade limit roughly doubles from 12 V to 24 V (the supply tolerates a
 *  longer string). A sensible default for the chosen voltage. */
export function defaultCascadeLimit(voltageV: 12 | 24): number {
    return voltageV === 24 ? 80 : 40;
}

/** A power supply spec — from the `transformers` rate card, or a default ladder. */
export interface LedDriverSpec {
    type: string;
    capacityW: number;
    unitCostPence: number;
}

/** Sensible fallback ladder when the rate card has no drivers loaded. */
export const DEFAULT_DRIVER_LADDER: LedDriverSpec[] = [
    { type: '30W', capacityW: 30, unitCostPence: 0 },
    { type: '60W', capacityW: 60, unitCostPence: 0 },
    { type: '100W', capacityW: 100, unitCostPence: 0 },
    { type: '150W', capacityW: 150, unitCostPence: 0 },
];

export interface LedLetter {
    /** 1-based label across the layout (reading order). */
    index: number;
    points: Pt[];
    centroid: Pt;
    bbox: Bbox;
    perimeterMm: number;
    /** Placement actually used for this letter. */
    strategy: 'stroke' | 'area';
    moduleCount: number;
}

export interface LedRun {
    /** 1-based label across the whole layout. */
    index: number;
    letterIndex: number;
    modules: Pt[];
    moduleCount: number;
    /** Developed (chained) length of the run, mm. */
    lengthMm: number;
    /** Index (1-based) of the driver feeding this run. */
    driverIndex: number;
    /** Index (1-based) of the output ON that driver feeding this run. */
    outputIndex: number;
}

export interface LedDriver {
    index: number;
    type: string;
    capacityW: number;
    /** Connected load (W). */
    loadW: number;
    /** % of rated capacity used. */
    loadPct: number;
    /** Class-2 outputs used on this driver (each ≤ 5 A). */
    outputs: number;
    runIndices: number[];
    moduleCount: number;
    /** Placement (centre of its runs) — keeps whips short. */
    position: Pt;
}

export interface LedLayoutAnalysis {
    letters: LedLetter[];
    modules: Pt[];
    totalModules: number;
    totalWatts: number;
    runs: LedRun[];
    drivers: LedDriver[];
    bbox: Bbox;
    /** Where the mains feed enters (midpoint of the chosen side). */
    cableEntry: Pt;
}

// ---------------------------------------------------------------------------
// Geometry helpers (pure + local)
// ---------------------------------------------------------------------------

function dedupe(points: Pt[], eps = 1e-4): Pt[] {
    const out: Pt[] = [];
    for (const p of points) {
        const q = out[out.length - 1];
        if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > eps) out.push([p[0], p[1]]);
    }
    while (
        out.length > 1 &&
        Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) <= eps
    ) {
        out.pop();
    }
    return out;
}

function polylineLength(pts: Pt[]): number {
    let len = 0;
    for (let i = 1; i < pts.length; i++) {
        len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    return len;
}

function pointAtArcLength(run: Pt[], target: number): Pt {
    let acc = 0;
    for (let i = 1; i < run.length; i++) {
        const seg = Math.hypot(run[i][0] - run[i - 1][0], run[i][1] - run[i - 1][1]);
        if (acc + seg >= target) {
            const t = seg > 1e-9 ? (target - acc) / seg : 0;
            return [
                run[i - 1][0] + (run[i][0] - run[i - 1][0]) * t,
                run[i - 1][1] + (run[i][1] - run[i - 1][1]) * t,
            ];
        }
        acc += seg;
    }
    return run[run.length - 1];
}

function centroidOf(pts: Pt[]): Pt {
    let n = pts.length;
    if (n > 1 && Math.hypot(pts[0][0] - pts[n - 1][0], pts[0][1] - pts[n - 1][1]) < 1e-6) n--;
    let x = 0;
    let y = 0;
    for (let i = 0; i < n; i++) {
        x += pts[i][0];
        y += pts[i][1];
    }
    return [x / n, y / n];
}

function bboxOf(pts: Pt[]): Bbox {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [px, py] of pts) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
    }
    if (!Number.isFinite(minX)) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    return { minX, minY, maxX, maxY };
}

function absArea(pts: Pt[]): number {
    let a = 0;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        a += pts[j][0] * pts[i][1] - pts[i][0] * pts[j][1];
    }
    return Math.abs(a) / 2;
}

function pointInPolygon(pt: Pt, ring: Pt[]): boolean {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (
            yi > pt[1] !== yj > pt[1] &&
            pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi || 1e-12) + xi
        ) {
            inside = !inside;
        }
    }
    return inside;
}

// ---------------------------------------------------------------------------
// Face grouping (letters + their counters) — robust to ring letters
// ---------------------------------------------------------------------------

interface FaceGroup {
    outer: Pt[];
    holes: Pt[][];
}

/**
 * Group closed contours into faces (letter bodies) and the counters that punch
 * through them, using a boundary-VERTEX even-odd nesting: even depth = a filled
 * face, odd = a hole of the smallest face containing it. A vertex sits on the
 * contour, so a ring letter (whose centroid is inside its own hole) is read
 * correctly. Open paths are treated as faces (a single stroke line).
 */
function groupFaces(paths: Pt[][]): FaceGroup[] {
    const rings = paths.map(dedupe).filter((r) => r.length >= 2);
    const sample = rings.map((r) => r[0]);
    const areas = rings.map(absArea);
    const depth = rings.map((_, i) => {
        let d = 0;
        for (let j = 0; j < rings.length; j++) {
            if (j !== i && rings[j].length >= 3 && pointInPolygon(sample[i], rings[j])) d++;
        }
        return d;
    });
    const isFace = depth.map((d) => d % 2 === 0);

    const groups: FaceGroup[] = [];
    const groupOf = new Map<number, number>();
    rings.forEach((r, i) => {
        if (isFace[i]) {
            groupOf.set(i, groups.length);
            groups.push({ outer: r, holes: [] });
        }
    });
    rings.forEach((r, i) => {
        if (isFace[i]) return;
        let best = -1;
        let bestArea = Infinity;
        for (let j = 0; j < rings.length; j++) {
            if (j === i || !isFace[j]) continue;
            if (!pointInPolygon(sample[i], rings[j])) continue;
            if (areas[j] < bestArea) {
                bestArea = areas[j];
                best = j;
            }
        }
        if (best >= 0) groups[groupOf.get(best)!].holes.push(r);
    });
    return groups;
}

// ---------------------------------------------------------------------------
// Module placement
// ---------------------------------------------------------------------------

/** Modules evenly spaced along a contour at ~pitch, centred so none sits on the
 *  seam. Returns at least one module for any real contour. */
function placeAlongPath(points: Pt[], pitch: number): Pt[] {
    const ring = dedupe(points);
    if (ring.length < 2 || pitch <= 0) return ring.length ? [ring[0]] : [];
    const loop = [...ring, ring[0]];
    const total = polylineLength(loop);
    if (total < 1e-6) return [ring[0]];
    const n = Math.max(1, Math.round(total / pitch));
    const spacing = total / n;
    const out: Pt[] = [];
    for (let k = 0; k < n; k++) out.push(pointAtArcLength(loop, (k + 0.5) * spacing));
    return out;
}

/** Grid-fill the face area (outer minus holes) at row × column pitch. */
function placeInArea(outer: Pt[], holes: Pt[][], colPitch: number, rowPitch: number): Pt[] {
    const bb = bboxOf(outer);
    const out: Pt[] = [];
    let row = 0;
    for (let y = bb.minY + rowPitch / 2; y <= bb.maxY; y += rowPitch, row++) {
        const cols: Pt[] = [];
        for (let x = bb.minX + colPitch / 2; x <= bb.maxX; x += colPitch) {
            const p: Pt = [x, y];
            if (!pointInPolygon(p, outer)) continue;
            if (holes.some((h) => h.length >= 3 && pointInPolygon(p, h))) continue;
            cols.push(p);
        }
        // Boustrophedon: alternate row direction so the chain doesn't jump back.
        if (row % 2 === 1) cols.reverse();
        out.push(...cols);
    }
    return out;
}

/** Effective stroke width of a ribbon ≈ 2·area / perimeter. Thin → stroke. */
function strokeWidth(outer: Pt[]): number {
    const perim = polylineLength([...outer, outer[0]]);
    return perim > 1e-6 ? (2 * absArea(outer)) / perim : 0;
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Order faces in reading order (top→bottom rows, left→right within a row). */
function readingOrder(groups: FaceGroup[]): FaceGroup[] {
    const withMeta = groups.map((g) => ({ g, c: centroidOf(g.outer), bb: bboxOf(g.outer) }));
    const heights = withMeta.map((m) => m.bb.maxY - m.bb.minY).sort((a, b) => a - b);
    const medianH = heights.length ? heights[Math.floor(heights.length / 2)] : 0;
    const band = Math.max(1, medianH * 0.5);
    withMeta.sort((a, b) => {
        const dy = a.c[1] - b.c[1];
        if (Math.abs(dy) > band) return dy;
        return a.c[0] - b.c[0];
    });
    return withMeta.map((m) => m.g);
}

/**
 * Lay LED modules into the artwork and size the wiring. `driverSpecs` is passed
 * in (the client loads them from the `transformers` rate card) so the engine
 * stays pure; falls back to a default ladder when empty.
 */
export function layoutLeds(
    paths: FlatPath[],
    config: LedLayoutConfig,
    driverSpecs: LedDriverSpec[] = DEFAULT_DRIVER_LADDER,
): LedLayoutAnalysis {
    const closed = paths.filter((p) => p.closed && p.points.length >= 3).map((p) => p.points as Pt[]);
    const groups = readingOrder(groupFaces(closed));

    const letters: LedLetter[] = [];
    const allModules: Pt[] = [];
    const runs: LedRun[] = [];

    const ladder = driverSpecs.length ? [...driverSpecs] : DEFAULT_DRIVER_LADDER;
    // Class-2 per-output watt cap (5 A) — a run must fit one output.
    const outputCap = CLASS2_AMPS * config.voltageV;

    groups.forEach((g, gi) => {
        const sw = strokeWidth(g.outer);
        // Single-row stroke covers up to on-centre × 1.25; wider → multi-row fill.
        const strat: 'stroke' | 'area' =
            config.strategy === 'stroke'
                ? 'stroke'
                : config.strategy === 'area'
                  ? 'area'
                  : sw <= config.modulePitchMm * 1.25
                    ? 'stroke'
                    : 'area';

        let mods: Pt[] = [];
        if (strat === 'stroke') {
            mods = placeAlongPath(g.outer, config.modulePitchMm);
            for (const h of g.holes) mods.push(...placeAlongPath(h, config.modulePitchMm));
        } else {
            mods = placeInArea(g.outer, g.holes, config.modulePitchMm, config.rowPitchMm);
            if (mods.length === 0) mods = placeAlongPath(g.outer, config.modulePitchMm);
        }

        const letterIndex = gi + 1;
        letters.push({
            index: letterIndex,
            points: g.outer,
            centroid: centroidOf(g.outer),
            bbox: bboxOf(g.outer),
            perimeterMm: polylineLength([...g.outer, g.outer[0]]),
            strategy: strat,
            moduleCount: mods.length,
        });
        allModules.push(...mods);

        // Break the letter's modules into runs at the module + length caps.
        let chain: Pt[] = [];
        let chainLen = 0;
        const flush = () => {
            if (chain.length === 0) return;
            runs.push({
                index: runs.length + 1,
                letterIndex,
                modules: chain,
                moduleCount: chain.length,
                lengthMm: polylineLength(chain),
                driverIndex: 0,
                outputIndex: 0,
            });
            chain = [];
            chainLen = 0;
        };
        for (const m of mods) {
            if (chain.length === 0) {
                chain = [m];
                continue;
            }
            const d = Math.hypot(m[0] - chain[chain.length - 1][0], m[1] - chain[chain.length - 1][1]);
            // Break at the cascade limit (primary), the length backstop, or when
            // one more module would push the run past a single output's 5 A cap.
            if (
                chain.length >= config.cascadeLimit ||
                chainLen + d > config.maxRunLengthMm ||
                (chain.length + 1) * config.wattsPerModule > outputCap
            ) {
                flush();
                chain = [m];
            } else {
                chainLen += d;
                chain.push(m);
            }
        }
        flush();
    });

    const drivers = packDrivers(runs, config, ladder);

    const bbox = bboxOf(allModules.length ? allModules : closed.flat());
    const midX = (bbox.minX + bbox.maxX) / 2;
    const midY = (bbox.minY + bbox.maxY) / 2;
    const cableEntry: Pt = {
        left: [bbox.minX, midY] as Pt,
        right: [bbox.maxX, midY] as Pt,
        top: [midX, bbox.minY] as Pt,
        bottom: [midX, bbox.maxY] as Pt,
    }[config.cableSide];

    const totalModules = allModules.length;
    return {
        letters,
        modules: allModules,
        totalModules,
        totalWatts: totalModules * config.wattsPerModule,
        runs,
        drivers,
        bbox,
        cableEntry,
    };
}

/**
 * Output-aware driver sizing. Runs first bin-pack onto OUTPUTS (each capped at
 * a Class-2 5 A → `5 × voltage` watts), then outputs bin-pack onto DRIVERS
 * (limited by both the driver's output count and 80% of its rated watts). Each
 * bin takes the smallest driver type that covers its outputs + load. Mutates
 * each run's `driverIndex` + `outputIndex`. (Grimco/HanleyLED Class-2 rule.)
 */
function packDrivers(
    runs: LedRun[],
    config: LedLayoutConfig,
    ladder: LedDriverSpec[],
): LedDriver[] {
    if (runs.length === 0) return [];
    const headroom = Math.max(0.1, Math.min(1, config.driverHeadroom));
    const outputCap = CLASS2_AMPS * config.voltageV; // watts per Class-2 output
    const byCap = [...ladder].sort((a, b) => a.capacityW - b.capacityW);
    const outputsOf = (s: LedDriverSpec) => Math.max(1, Math.ceil(s.capacityW / outputCap));
    const maxOutputs = Math.max(...byCap.map(outputsOf));
    const maxUsable = byCap[byCap.length - 1].capacityW * headroom;
    const wattOf = (r: LedRun) => r.moduleCount * config.wattsPerModule;

    // 1. Runs → outputs (each output ≤ 5 A).
    interface Out {
        load: number;
        runs: LedRun[];
    }
    const outs: Out[] = [];
    for (const r of [...runs].sort((a, b) => wattOf(b) - wattOf(a))) {
        const w = wattOf(r);
        let o = outs.find((x) => x.load + w <= outputCap + 1e-9);
        if (!o) {
            o = { load: 0, runs: [] };
            outs.push(o);
        }
        o.load += w;
        o.runs.push(r);
    }

    // 2. Outputs → drivers (≤ output count AND ≤ capacity × headroom).
    interface Bin {
        load: number;
        outs: Out[];
    }
    const bins: Bin[] = [];
    for (const o of [...outs].sort((a, b) => b.load - a.load)) {
        let bin = bins.find((b) => b.outs.length < maxOutputs && b.load + o.load <= maxUsable + 1e-9);
        if (!bin) {
            bin = { load: 0, outs: [] };
            bins.push(bin);
        }
        bin.load += o.load;
        bin.outs.push(o);
    }

    // 3. Build drivers: smallest type covering this bin's outputs + load.
    return bins.map((bin, i) => {
        const spec =
            byCap.find((s) => outputsOf(s) >= bin.outs.length && s.capacityW * headroom >= bin.load - 1e-9) ??
            byCap[byCap.length - 1];
        const driverIndex = i + 1;
        const binRuns: LedRun[] = [];
        bin.outs.forEach((o, oi) => {
            o.runs.forEach((r) => {
                r.driverIndex = driverIndex;
                r.outputIndex = oi + 1;
                binRuns.push(r);
            });
        });
        const mods: Pt[] = binRuns.flatMap((r) => r.modules);
        const pos: Pt = mods.length ? centroidOf(mods) : [0, 0];
        return {
            index: driverIndex,
            type: spec.type,
            capacityW: spec.capacityW,
            loadW: bin.load,
            loadPct: spec.capacityW > 0 ? (bin.load / spec.capacityW) * 100 : 0,
            outputs: bin.outs.length,
            runIndices: binRuns.map((r) => r.index).sort((a, b) => a - b),
            moduleCount: binRuns.reduce((s, r) => s + r.moduleCount, 0),
            position: pos,
        };
    });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

export function formatW(watts: number): string {
    return `${Math.round(watts * 10) / 10} W`;
}

export function formatMm(mm: number): string {
    return `${Math.round(mm).toLocaleString('en-GB')} mm`;
}

export function driverCost(drivers: LedDriver[], specs: LedDriverSpec[]): number {
    const cost = new Map(specs.map((s) => [s.type, s.unitCostPence]));
    return drivers.reduce((sum, d) => sum + (cost.get(d.type) ?? 0), 0);
}
