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
    it('packs pieces onto a sheet and returns cut-file SVG(s)', () => {
        const pieces = [
            { path: rect(200, 100) },
            { path: rect(200, 100) },
            { path: rect(150, 150) },
        ];
        const out = buildNestedSheets(pieces, { label: 'acrylic', title: 'Test' });
        expect(out.sheets.length).toBeGreaterThanOrEqual(1);
        expect(out.sheetCount).toBeGreaterThanOrEqual(1);
        // true-mm cut file with the sheet boundary + at least one cut path
        expect(out.sheets[0]).toMatch(/width="\d+mm"/);
        expect(out.sheets[0]).toContain('<path');
        expect(out.unplaced).toBe(0);
    });

    it('returns nothing to nest for an empty input', () => {
        const out = buildNestedSheets([], { label: 'acrylic', title: 'Empty' });
        expect(out.sheets).toEqual([]);
        expect(out.sheetCount).toBe(0);
    });

    it('carries holes through to the cut file (even-odd)', () => {
        const out = buildNestedSheets(
            [{ path: rect(300, 300), holes: [rect(100, 100)] }],
            { label: 'acrylic', title: 'Holes' },
        );
        expect(out.sheets[0]).toContain('fill-rule="evenodd"');
    });
});
