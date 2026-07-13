import { describe, it, expect } from 'vitest';
import { buildAsciiStl, countStlFacets, type StlSolidInput } from './stl-export';

/** A unit square (two triangles) in the z = 0 plane, wound CCW from +Z. */
const squarePositions = [
    // tri 1: (0,0) (1,0) (1,1)
    0, 0, 0, 1, 0, 0, 1, 1, 0,
    // tri 2: (0,0) (1,1) (0,1)
    0, 0, 0, 1, 1, 0, 0, 1, 0,
];

describe('buildAsciiStl', () => {
    it('wraps each solid in a named solid…endsolid block', () => {
        const stl = buildAsciiStl([{ name: 'tray', positions: squarePositions }]);
        expect(stl.startsWith('solid tray')).toBe(true);
        expect(stl.trimEnd().endsWith('endsolid tray')).toBe(true);
    });

    it('emits one facet per triangle with three vertices each', () => {
        const stl = buildAsciiStl([{ name: 'tray', positions: squarePositions }]);
        expect((stl.match(/facet normal/g) ?? []).length).toBe(2);
        expect((stl.match(/vertex /g) ?? []).length).toBe(6);
        expect((stl.match(/outer loop/g) ?? []).length).toBe(2);
    });

    it('computes a unit facet normal facing +Z for a CCW z-plane triangle', () => {
        const stl = buildAsciiStl([{ name: 't', positions: squarePositions }]);
        const first = stl
            .split('\n')
            .find((l) => l.includes('facet normal'));
        expect(first).toBe('  facet normal 0.000000 0.000000 1.000000');
    });

    it('keeps each layer as its OWN named solid — separated but in one file', () => {
        const solids: StlSolidInput[] = [
            { name: 'tray', positions: squarePositions },
            { name: 'letters', positions: squarePositions },
        ];
        const stl = buildAsciiStl(solids);
        expect((stl.match(/^solid /gm) ?? []).length).toBe(2);
        expect(stl).toContain('solid tray');
        expect(stl).toContain('solid letters');
        // One document, so the second solid follows the first's endsolid.
        expect(stl.indexOf('solid letters')).toBeGreaterThan(
            stl.indexOf('endsolid tray'),
        );
    });

    it('drops degenerate (zero-area) facets', () => {
        // Three collinear points → no surface.
        const collinear = [0, 0, 0, 1, 0, 0, 2, 0, 0];
        expect(countStlFacets([{ name: 'x', positions: collinear }])).toBe(0);
        // A solid with only degenerate facets is omitted entirely.
        expect(buildAsciiStl([{ name: 'x', positions: collinear }])).toBe('');
    });

    it('ignores a trailing partial triangle', () => {
        const withStray = [...squarePositions, 5, 5]; // 2 stray floats
        expect(countStlFacets([{ name: 'x', positions: withStray }])).toBe(2);
    });

    it('sanitises solid names and never emits an empty label', () => {
        const stl = buildAsciiStl([
            { name: '  metal  faces\n', positions: squarePositions },
        ]);
        expect(stl).toContain('solid metal faces');
        expect(stl).toContain('endsolid metal faces');
        const blank = buildAsciiStl([{ name: '   ', positions: squarePositions }]);
        expect(blank).toContain('solid solid');
    });

    it('prints negative normals but folds signed zero to 0', () => {
        // a=(0,0,0) b=(1,0,0) c=(0,0,1) → normal (0,-1,0): the -1 must print,
        // the zero axes must never come out as "-0.000000".
        const tri = [0, 0, 0, 1, 0, 0, 0, 0, 1];
        const stl = buildAsciiStl([{ name: 'x', positions: tri }]);
        expect(stl).toContain('facet normal 0.000000 -1.000000 0.000000');
        expect(stl).not.toContain('-0.000000');
    });

    it('returns an empty string when there is nothing to export', () => {
        expect(buildAsciiStl([])).toBe('');
    });
});

describe('countStlFacets', () => {
    it('counts valid triangles across all solids', () => {
        expect(
            countStlFacets([
                { name: 'a', positions: squarePositions },
                { name: 'b', positions: squarePositions },
            ]),
        ).toBe(4);
    });
});
