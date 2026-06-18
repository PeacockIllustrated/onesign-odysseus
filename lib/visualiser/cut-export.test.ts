import { describe, it, expect } from 'vitest';
import { cutToSvg, cutToDxf, cutBbox, type CutGeometry } from './cut-export';

const geo: CutGeometry = {
    cut: [
        [
            [0, 0],
            [100, 0],
            [100, 50],
            [0, 50],
        ],
    ],
    ref: [
        [
            [-5, -5],
            [110, -5],
            [110, 60],
            [-5, 60],
        ],
    ],
    folds: [[[0, 25], [100, 25]]],
};

describe('cutBbox', () => {
    it('spans cut + ref + folds', () => {
        const bb = cutBbox(geo);
        expect(bb.minX).toBe(-5);
        expect(bb.maxX).toBe(110);
        expect(bb.minY).toBe(-5);
        expect(bb.maxY).toBe(60);
    });
});

describe('cutToSvg', () => {
    it('emits black cut paths, blue reference + fold, true mm', () => {
        const svg = cutToSvg(geo, 'tray');
        expect(svg).toContain('stroke="#000000"'); // cut
        expect(svg).toContain('stroke="#0000ff"'); // reference + fold
        expect(svg).toContain('<line'); // fold segment
        expect(svg).toContain('fill="none"');
        expect(svg).toMatch(/width="[\d.]+mm"/);
    });
});

describe('cutToDxf', () => {
    it('is a readable R12 DXF with mm units, layers + entities', () => {
        const dxf = cutToDxf(geo);
        expect(dxf).toContain('AC1009'); // R12
        expect(dxf).toContain('$INSUNITS'); // units header
        expect(dxf).toContain('POLYLINE'); // closed contours
        expect(dxf).toContain('CUT'); // cut layer
        expect(dxf).toContain('FOLD'); // fold layer
        expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    });

    it('flips Y to CAD y-up against the geometry extent', () => {
        // Top of the part (y=-5) maps to the largest DXF y; bottom (y=60) the
        // smallest — i.e. y -> (minY+maxY) - y = 55 - y.
        const dxf = cutToDxf(geo);
        // The cut rect's y=0 vertex becomes 55, and y=50 becomes 5.
        expect(dxf).toContain('\n55\r\n'.trim()); // 55 appears as a coordinate
        expect(dxf).toMatch(/\b55\b/);
        expect(dxf).toMatch(/\b5\b/);
    });
});
