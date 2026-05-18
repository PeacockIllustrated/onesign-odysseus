import { describe, it, expect } from 'vitest';
import { buildDevelopment } from './geometry';
import type { PanelParams } from './types';

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

    it('shadow-gap lip adds a second fold and a further T/2 off the return', () => {
        const dev = buildDevelopment(
            base({
                shadowGapMm: 20,
                returns: { top: false, bottom: true, left: false, right: false },
            }),
        );
        // return: 80 − 2.5 (root) − 2.5 (tip lip fold) = 75
        expect(dev.returnFlatDepthMm).toBe(75);
        // lip: 20 − 2.5 = 17.5
        expect(dev.lipFlatDepthMm).toBe(17.5);
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
