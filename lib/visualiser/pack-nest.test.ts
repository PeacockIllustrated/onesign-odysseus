import { describe, it, expect } from 'vitest';
import { buildNestedSheets } from './pack-nest';
import type { FlatPath } from './types';

function rect(w: number, h: number): FlatPath {
    return {
        closed: true,
        points: [
            [0, 0],
            [w, 0],
            [w, h],
            [0, h],
            [0, 0],
        ],
    };
}

describe('buildNestedSheets', () => {
    it('packs pieces onto a panel and returns FILLED cut-layout SVG(s)', () => {
        const pieces = [
            { path: rect(200, 100) },
            { path: rect(200, 100) },
            { path: rect(150, 150) },
        ];
        const out = buildNestedSheets(pieces, {
            label: 'acrylic',
            title: 'Test',
            fill: '#ff8800',
        });
        expect(out.sheets.length).toBeGreaterThanOrEqual(1);
        // filled in the material colour, true mm
        expect(out.sheets[0].svg).toContain('fill="#ff8800"');
        expect(out.sheets[0].svg).toMatch(/width="[\d.]+mm"/);
        expect(out.sheets[0].widthMm).toBeGreaterThan(0);
        expect(out.unplaced).toBe(0);
    });

    it('crops to the smallest panel — content + a 5mm border each side', () => {
        // A single 200×100 piece → panel ≈ 210×110 (content + 5mm both sides).
        const out = buildNestedSheets([{ path: rect(200, 100) }], {
            label: 'one',
            title: 'Crop',
            fill: '#123456',
        });
        // Generous tolerance: rotation may swap w/h, but the panel hugs the
        // piece (far smaller than the 2440×1220 working sheet).
        const s = out.sheets[0];
        expect(Math.max(s.widthMm, s.heightMm)).toBeLessThan(230);
        expect(Math.min(s.widthMm, s.heightMm)).toBeLessThan(130);
    });

    it('returns nothing to nest for an empty input', () => {
        const out = buildNestedSheets([], { label: 'x', title: 'Empty', fill: '#000' });
        expect(out.sheets).toEqual([]);
        expect(out.sheetCount).toBe(0);
    });

    it('carries holes through to the panel (even-odd)', () => {
        const out = buildNestedSheets(
            [{ path: rect(300, 300), holes: [rect(100, 100)] }],
            { label: 'holes', title: 'Holes', fill: '#222' },
        );
        expect(out.sheets[0].svg).toContain('fill-rule="evenodd"');
    });
});
