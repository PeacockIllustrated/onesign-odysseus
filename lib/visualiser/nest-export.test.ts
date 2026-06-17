import { describe, it, expect } from 'vitest';
import { buildNestSvg, type NestablePiece } from './nest-export';
import type { FlatPath } from './types';

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

describe('buildNestSvg', () => {
    const pieces: NestablePiece[] = [
        { path: rect(10, 10, 100, 100), holes: [rect(40, 40, 20, 20)] },
        { path: rect(130, 10, 80, 100) },
    ];

    it('emits a true-mm SVG under the given group with counters as paths', () => {
        const svg = buildNestSvg(pieces, 'ACRYLIC', 'ACME — acrylic #ff0000 3mm');
        expect(svg).toContain('<g id="ACRYLIC">');
        expect(svg).toContain('1 unit = 1 mm');
        // 2 outer outlines + 1 counter = 3 path elements.
        expect((svg.match(/<path /g) ?? []).length).toBe(3);
    });

    it('sizes width/height + viewBox to the pieces bbox in mm', () => {
        const svg = buildNestSvg(pieces, 'ACRYLIC', 'x');
        // x:[10,210] y:[10,110] => 200 x 100 mm.
        expect(svg).toContain('width="200mm" height="100mm"');
        expect(svg).toContain('viewBox="10 10 200 100"');
    });

    it('escapes a group id / title and stays valid with no pieces', () => {
        const svg = buildNestSvg([], 'A&B', '<x>');
        expect(svg).toContain('<g id="A&amp;B">');
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect((svg.match(/<path /g) ?? []).length).toBe(0);
    });
});
