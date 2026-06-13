import { describe, it, expect } from 'vitest';
import {
    layoutLeds,
    DEFAULT_LED_CONFIG,
    DEFAULT_DRIVER_LADDER,
    type LedLayoutConfig,
    type Pt,
} from './led-layout';
import type { FlatPath } from './types';

const cfg = (over: Partial<LedLayoutConfig> = {}): LedLayoutConfig => ({
    ...DEFAULT_LED_CONFIG,
    maxModulesPerRun: 999,
    maxRunLengthMm: 1e9,
    ...over,
});

function rect(w: number, h: number, x = 0, y = 0): Pt[] {
    return [
        [x, y],
        [x + w, y],
        [x + w, y + h],
        [x, y + h],
    ];
}
const square = (s: number, x = 0, y = 0) => rect(s, s, x, y);
function circle(r: number, cx = 0, cy = 0, segs = 64): Pt[] {
    const pts: Pt[] = [];
    for (let a = 0; a < segs; a++) {
        const t = (a / segs) * Math.PI * 2;
        pts.push([cx + Math.cos(t) * r, cy + Math.sin(t) * r]);
    }
    return pts;
}
const closed = (points: Pt[]): FlatPath => ({ points, closed: true });

describe('layoutLeds — placement', () => {
    it('places modules along the stroke at ~pitch', () => {
        // 1000×100 → perimeter 2200; at 150mm pitch ≈ 15 modules.
        const a = layoutLeds([closed(rect(1000, 100))], cfg({ strategy: 'stroke', modulePitchMm: 150 }));
        expect(a.totalModules).toBe(15);
        expect(a.letters).toHaveLength(1);
        expect(a.letters[0].strategy).toBe('stroke');
    });

    it('grid-fills an area and excludes counters', () => {
        const plain = layoutLeds([closed(square(300))], cfg({ strategy: 'area', modulePitchMm: 100, rowPitchMm: 100 }));
        expect(plain.totalModules).toBe(9); // 3×3 grid

        const withHole = layoutLeds(
            [closed(square(300)), closed(square(100, 100, 100))],
            cfg({ strategy: 'area', modulePitchMm: 100, rowPitchMm: 100 }),
        );
        expect(withHole.letters).toHaveLength(1); // one face, the hole is a counter
        expect(withHole.totalModules).toBe(8); // centre cell falls in the hole
    });

    it('keeps a ring letter (concentric "O") as one lit face', () => {
        const a = layoutLeds([closed(circle(50)), closed(circle(25))], cfg({ strategy: 'stroke' }));
        expect(a.letters).toHaveLength(1);
        expect(a.totalModules).toBeGreaterThan(0);
    });
});

describe('layoutLeds — runs', () => {
    it('breaks runs at the module cap', () => {
        const a = layoutLeds(
            [closed(rect(1000, 100))],
            cfg({ strategy: 'stroke', modulePitchMm: 150, maxModulesPerRun: 5 }),
        );
        expect(a.runs).toHaveLength(3); // 15 modules / 5
        expect(a.runs.every((r) => r.moduleCount <= 5)).toBe(true);
    });

    it('breaks runs at the length cap (voltage-drop limit)', () => {
        const a = layoutLeds(
            [closed(rect(1000, 100))],
            cfg({ strategy: 'stroke', modulePitchMm: 150, maxRunLengthMm: 500 }),
        );
        expect(a.runs.length).toBeGreaterThan(1);
        expect(a.runs.every((r) => r.lengthMm <= 500 + 1e-6)).toBe(true);
    });
});

describe('layoutLeds — drivers', () => {
    it('bin-packs runs onto drivers within capacity × headroom', () => {
        // 15 modules → 3 runs of 5 at 10 W each = 50 W/run; 150 W usable cap is
        // 120 W (0.8), so two drivers (100 W + 50 W loads).
        const a = layoutLeds(
            [closed(rect(1000, 100))],
            cfg({
                strategy: 'stroke',
                modulePitchMm: 150,
                maxModulesPerRun: 5,
                wattsPerModule: 10,
                driverHeadroom: 0.8,
            }),
        );
        expect(a.drivers.length).toBe(2);
        expect(a.drivers.every((d) => d.loadW <= d.capacityW * 0.8 + 1e-6)).toBe(true);
        // Every run is assigned to a driver.
        expect(a.runs.every((r) => r.driverIndex >= 1)).toBe(true);
        // Driver type comes from the ladder.
        const types = new Set(DEFAULT_DRIVER_LADDER.map((d) => d.type));
        expect(a.drivers.every((d) => types.has(d.type))).toBe(true);
    });

    it('totals load from modules × watts', () => {
        const a = layoutLeds([closed(rect(1000, 100))], cfg({ strategy: 'stroke', modulePitchMm: 150, wattsPerModule: 2 }));
        expect(a.totalWatts).toBeCloseTo(a.totalModules * 2, 6);
    });
});

describe('layoutLeds — cable entry', () => {
    it('places the feed on the chosen side', () => {
        const a = layoutLeds([closed(rect(1000, 100))], cfg({ strategy: 'stroke', cableSide: 'left' }));
        expect(a.cableEntry[0]).toBeCloseTo(a.bbox.minX, 6);
    });

    it('returns nothing for empty input', () => {
        const a = layoutLeds([], cfg());
        expect(a.totalModules).toBe(0);
        expect(a.drivers).toHaveLength(0);
    });
});
