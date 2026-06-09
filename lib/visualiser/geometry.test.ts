import { describe, it, expect } from 'vitest';
import {
    buildDevelopment,
    outlinePerimeter,
    clipApertureToFace,
} from './geometry';
import type { FlatPath, PanelParams } from './types';

function polyArea(pts: Array<[number, number]>): number {
    let s = 0;
    for (let i = 0; i < pts.length - 1; i++) {
        s += pts[i][0] * pts[i + 1][1] - pts[i + 1][0] * pts[i][1];
    }
    return Math.abs(s) / 2;
}

function base(overrides: Partial<PanelParams> = {}): PanelParams {
    return {
        name: 'test',
        panelWidthMm: 1000,
        panelHeightMm: 350,
        returnDepthMm: 80,
        returns: { top: false, bottom: false, left: false, right: false },
        shadowGapMm: 0,
        keylineMm: 0,
        materialThicknessMm: 5,
        ...overrides,
    };
}

describe('buildDevelopment — user-specified bend rule', () => {
    // User: "material 5mm, take 2.5mm off above and below the line. face panel
    // 350 tall, returns 80 -> 347.5 tall and 77.5 returns; with a top return
    // too, a further 2.5 off -> face 345, each return 77.5".
    it('one return (bottom): face loses T/2 once, return loses T/2 at root', () => {
        const dev = buildDevelopment(
            base({ returns: { top: false, bottom: true, left: false, right: false } }),
        );
        expect(dev.faceFlatHMm).toBe(347.5); // 350 − 2.5
        expect(dev.returnFlatDepthMm).toBe(77.5); // 80 − 2.5
    });

    it('two opposite returns (top+bottom): face loses T/2 twice', () => {
        const dev = buildDevelopment(
            base({ returns: { top: true, bottom: true, left: false, right: false } }),
        );
        expect(dev.faceFlatHMm).toBe(345); // 350 − 2.5 − 2.5
        expect(dev.returnFlatDepthMm).toBe(77.5); // each return still 80 − 2.5
    });

    it('width axis is independent of height axis', () => {
        const dev = buildDevelopment(
            base({
                panelWidthMm: 1000,
                returns: { top: true, bottom: true, left: true, right: false },
            }),
        );
        // height: top+bottom returns -> 350 − 5
        expect(dev.faceFlatHMm).toBe(345);
        // width: only left return -> 1000 − 2.5
        expect(dev.faceFlatWMm).toBe(997.5);
    });

    it('no returns: face flat size equals nominal size', () => {
        const dev = buildDevelopment(base());
        expect(dev.faceFlatWMm).toBe(1000);
        expect(dev.faceFlatHMm).toBe(350);
        expect(dev.segments).toHaveLength(1);
        expect(dev.foldLines).toHaveLength(0);
    });

    it('shadow-gap lip is an up-fold — no stretch deduction on its bend', () => {
        const dev = buildDevelopment(
            base({
                shadowGapMm: 20,
                returns: { top: false, bottom: true, left: false, right: false },
            }),
        );
        // Up-fold at return tip doesn't stretch the material — return
        // keeps the full D minus only the root back-fold deduction.
        // 80 − 2.5 (root) = 77.5
        expect(dev.returnFlatDepthMm).toBe(77.5);
        // Lip is the full shadow gap, no root deduction.
        expect(dev.lipFlatDepthMm).toBe(20);
        // one return fold + one lip fold
        expect(dev.foldLines.filter((f) => f.kind === 'return')).toHaveLength(1);
        expect(dev.foldLines.filter((f) => f.kind === 'lip')).toHaveLength(1);
        expect(dev.segments.some((s) => s.role === 'lip')).toBe(true);
    });

    it('total flat bounding box accounts for all bands', () => {
        const dev = buildDevelopment(
            base({
                panelWidthMm: 1000,
                panelHeightMm: 350,
                returnDepthMm: 80,
                returns: { top: true, bottom: true, left: true, right: true },
            }),
        );
        // face flat: 1000−5 wide, 350−5 tall ; each return band 77.5
        expect(dev.faceFlatWMm).toBe(995);
        expect(dev.faceFlatHMm).toBe(345);
        expect(dev.totalFlatWMm).toBe(77.5 + 995 + 77.5);
        expect(dev.totalFlatHMm).toBe(77.5 + 345 + 77.5);
        expect(dev.foldLines).toHaveLength(4);
        expect(dev.segments).toHaveLength(5); // face + 4 returns
    });

    it('thickness drives the deduction (10mm -> 5mm per side)', () => {
        const dev = buildDevelopment(
            base({
                materialThicknessMm: 10,
                returns: { top: false, bottom: true, left: false, right: false },
            }),
        );
        expect(dev.faceFlatHMm).toBe(345); // 350 − 5
        expect(dev.returnFlatDepthMm).toBe(75); // 80 − 5
    });
});

describe('outlinePerimeter — single merged cut contour', () => {
    it('no returns: perimeter is just the face rectangle', () => {
        const dev = buildDevelopment(
            base({ returns: { top: false, bottom: false, left: false, right: false } }),
        );
        const p = outlinePerimeter(dev)!;
        expect(p).not.toBeNull();
        expect(p.closed).toBe(true);
        expect(p.points).toHaveLength(5); // 4 corners + closing dup
        expect(polyArea(p.points)).toBeCloseTo(1000 * 350, 3);
    });

    it('all four returns: a 12-corner cross, internal fold edges cancelled', () => {
        const dev = buildDevelopment(
            base({ returns: { top: true, bottom: true, left: true, right: true } }),
        );
        const p = outlinePerimeter(dev)!;
        // A plus/cross has exactly 12 vertices (+1 closing). If internal
        // face/return edges were NOT cancelled this would be far larger.
        expect(p.points).toHaveLength(13);
        // Area equals the union of all segments (they tile without overlap),
        // proving the merge dropped the shared interior edges.
        const segArea = dev.segments.reduce((a, s) => a + s.wMm * s.hMm, 0);
        expect(polyArea(p.points)).toBeCloseTo(segArea, 2);
    });

    it('clipApertureToFace: inside stays unchanged, outside dropped, crossing clipped', () => {
        // No returns -> face is the full development at (0,0)-(1000,350).
        const dev = buildDevelopment(
            base({
                returns: { top: false, bottom: false, left: false, right: false },
            }),
        );

        const inside: FlatPath = {
            closed: true,
            points: [
                [100, 100],
                [200, 100],
                [200, 200],
                [100, 200],
                [100, 100],
            ],
        };
        const r1 = clipApertureToFace(dev, [inside]);
        expect(r1.anyOutside).toBe(false);
        expect(r1.wasClipped).toBe(false);
        expect(r1.paths[0].points).toEqual(inside.points);

        const outside: FlatPath = {
            closed: true,
            points: [
                [2000, 2000],
                [2100, 2000],
                [2100, 2100],
                [2000, 2100],
                [2000, 2000],
            ],
        };
        const r2 = clipApertureToFace(dev, [outside]);
        expect(r2.anyOutside).toBe(true);
        expect(r2.paths.length).toBe(0); // dropped entirely

        const crossing: FlatPath = {
            closed: true,
            points: [
                [900, 100],
                [1100, 100],
                [1100, 200],
                [900, 200],
                [900, 100],
            ],
        };
        const r3 = clipApertureToFace(dev, [crossing]);
        expect(r3.anyOutside).toBe(true);
        expect(r3.wasClipped).toBe(true);
        // Every surviving point must be inside the face.
        for (const [x, y] of r3.paths[0].points) {
            expect(x).toBeGreaterThanOrEqual(-1e-6);
            expect(x).toBeLessThanOrEqual(1000 + 1e-6);
            expect(y).toBeGreaterThanOrEqual(-1e-6);
            expect(y).toBeLessThanOrEqual(350 + 1e-6);
        }
    });

    it('vertex count is independent of segment count (truly merged)', () => {
        const dev = buildDevelopment(
            base({
                returns: { top: true, bottom: true, left: true, right: true },
                shadowGapMm: 15, // top + bottom each get a lip (left/right never do)
            }),
        );
        const p = outlinePerimeter(dev)!;
        expect(dev.segments.length).toBe(7); // face + 4 returns + 2 lips (top/bottom only)
        // Still one clean rectilinear loop, not stacked rectangles.
        const segArea = dev.segments.reduce((a, s) => a + s.wMm * s.hMm, 0);
        expect(polyArea(p.points)).toBeCloseTo(segArea, 2);
        expect(p.points.length).toBeLessThanOrEqual(21);
    });
});
