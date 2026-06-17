import { describe, it, expect } from 'vitest';
import {
    FACE_MATERIALS,
    FACE_MATERIAL_ORDER,
    deriveExtraFacePieces,
    type FaceableLetter,
} from './extra-face';
import { buildExtraFaceNestSvg, faceGroupId } from './extra-face-export';
import { FaceMaterialEnum, type FlatPath } from './types';

function rect(x: number, y: number, w: number, h: number): FlatPath {
    return {
        points: [
            [x, y],
            [x + w, y],
            [x + w, y + h],
            [x, y + h],
        ],
        closed: true,
    };
}

describe('FACE_MATERIALS catalog', () => {
    it('has a spec for every FaceMaterial enum value', () => {
        for (const key of FaceMaterialEnum.options) {
            expect(FACE_MATERIALS[key]).toBeDefined();
            expect(FACE_MATERIALS[key].color).toMatch(/^#[0-9a-f]{6}$/i);
            expect(FACE_MATERIALS[key].defaultThicknessMm).toBeGreaterThan(0);
        }
    });

    it('order list matches the enum (no missing/extra keys)', () => {
        expect([...FACE_MATERIAL_ORDER].sort()).toEqual(
            [...FaceMaterialEnum.options].sort(),
        );
    });
});

describe('deriveExtraFacePieces', () => {
    const letters: FaceableLetter[] = [
        { pathIndex: 0, path: rect(0, 0, 100, 100), holes: [rect(40, 40, 20, 20)], frontZMm: 5 },
        { pathIndex: 1, path: rect(120, 0, 80, 100), frontZMm: 5 },
    ];

    it('stamps the resolved material colour + thickness onto every piece', () => {
        const pieces = deriveExtraFacePieces(letters, 'brass', 1.5);
        expect(pieces).toHaveLength(2);
        expect(pieces[0].material).toBe('brass');
        expect(pieces[0].color).toBe(FACE_MATERIALS.brass.color);
        expect(pieces[0].thicknessMm).toBe(1.5);
        // Geometry is carried straight through (face is coincident with letter).
        expect(pieces[0].path).toBe(letters[0].path);
        expect(pieces[0].holes).toHaveLength(1);
        expect(pieces[0].frontZMm).toBe(5);
    });

    it('falls back to the stock default thickness when given <= 0', () => {
        const pieces = deriveExtraFacePieces(letters, 'aluminium', 0);
        expect(pieces[0].thicknessMm).toBe(FACE_MATERIALS.aluminium.defaultThicknessMm);
    });

    it('normalises an empty holes array to undefined', () => {
        const pieces = deriveExtraFacePieces(
            [{ pathIndex: 2, path: rect(0, 0, 10, 10), holes: [], frontZMm: 0 }],
            'copper',
            2,
        );
        expect(pieces[0].holes).toBeUndefined();
    });
});

describe('buildExtraFaceNestSvg', () => {
    const pieces = deriveExtraFacePieces(
        [
            { pathIndex: 0, path: rect(10, 10, 100, 100), holes: [rect(40, 40, 20, 20)], frontZMm: 5 },
            { pathIndex: 1, path: rect(130, 10, 80, 100), frontZMm: 5 },
        ],
        'brass',
        1.5,
    );

    it('emits a true-mm SVG with the material group and counters as paths', () => {
        const svg = buildExtraFaceNestSvg({ pieces, material: 'brass', title: 'ACME' });
        expect(svg).toContain('<g id="BRASS_FACES">');
        expect(svg).toContain('1 unit = 1 mm');
        // 2 outer outlines + 1 counter = 3 path elements.
        expect((svg.match(/<path /g) ?? []).length).toBe(3);
    });

    it('sizes width/height + viewBox to the pieces bbox in mm', () => {
        const svg = buildExtraFaceNestSvg({ pieces, material: 'brass', title: 'ACME' });
        // bbox spans x:[10,210] y:[10,110] => 200 x 100 mm.
        expect(svg).toContain('width="200mm" height="100mm"');
        expect(svg).toContain('viewBox="10 10 200 100"');
    });

    it('names the group from the material', () => {
        expect(faceGroupId('stainless')).toBe('STAINLESS_FACES');
        const svg = buildExtraFaceNestSvg({
            pieces: deriveExtraFacePieces([{ pathIndex: 0, path: rect(0, 0, 50, 50), frontZMm: 0 }], 'mirror', 1.5),
            material: 'mirror',
            title: 'x',
        });
        expect(svg).toContain('<g id="MIRROR_FACES">');
    });

    it('stays a valid (empty) SVG with no pieces', () => {
        const svg = buildExtraFaceNestSvg({ pieces: [], material: 'brass', title: 'empty' });
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect((svg.match(/<path /g) ?? []).length).toBe(0);
    });
});
