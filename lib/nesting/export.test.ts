import { describe, expect, it } from 'vitest';
import { buildSheetDxf } from './dxf';
import { buildSheetSvg } from './svg-export';
import { DEFAULT_NEST_CONFIG, type NestConfig, type NestPiece } from './types';

const config: NestConfig = {
    ...DEFAULT_NEST_CONFIG,
    sheetWidthMm: 250,
    sheetHeightMm: 200,
    marginMm: 10,
};

const piece: NestPiece = {
    id: 'p1',
    label: 'Piece 1',
    groupId: 'g1',
    outer: [
        [0, 0],
        [100, 0],
        [100, 50],
        [0, 50],
    ],
    holes: [
        [
            [20, 10],
            [40, 10],
            [40, 30],
            [20, 30],
        ],
    ],
    areaMm2: 100 * 50 - 20 * 20,
    widthMm: 100,
    heightMm: 50,
};

const placement = {
    pieceId: 'p1',
    sheetIndex: 0,
    xMm: 10,
    yMm: 10,
    rotationDeg: 0,
};

describe('buildSheetSvg', () => {
    it('emits a true-mm document with cut paths and a boundary', () => {
        const svg = buildSheetSvg({
            pieces: [piece],
            placements: [placement],
            config,
            title: 'test — sheet 1 of 1',
        });
        expect(svg).toContain('width="250mm"');
        expect(svg).toContain('height="200mm"');
        expect(svg).toContain('viewBox="0 0 250 200"');
        // Sheet boundary on the blue reference colour.
        expect(svg).toContain('stroke="#0000ff"');
        // The piece path: placed at the margin, hole included, even-odd.
        expect(svg).toContain('fill-rule="evenodd"');
        expect(svg).toContain('M 10 10');
        expect(svg).toContain('M 30 20'); // hole at +20,+10 from placement
        expect(svg).toContain('data-piece="Piece 1"');
    });

    it('escapes XML-hostile titles', () => {
        const svg = buildSheetSvg({
            pieces: [piece],
            placements: [placement],
            config,
            title: 'a<b>&"c"',
        });
        expect(svg).toContain('a&lt;b&gt;&amp;&quot;c&quot;');
    });
});

describe('buildSheetDxf', () => {
    it('emits an R12 document with mm units and CUT/SHEET layers', () => {
        const dxf = buildSheetDxf({
            pieces: [piece],
            placements: [placement],
            config,
            title: 'test',
        });
        expect(dxf).toContain('$ACADVER');
        expect(dxf).toContain('AC1009');
        expect(dxf).toContain('$INSUNITS');
        expect(dxf.split('POLYLINE')).toHaveLength(1 + 3); // sheet + outer + hole
        expect(dxf).toContain('CUT');
        expect(dxf).toContain('SHEET');
        expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
    });

    it('flips y so the sheet reads y-up in CAD', () => {
        const dxf = buildSheetDxf({
            pieces: [piece],
            placements: [placement],
            config,
            title: 'test',
        });
        // Placement corner (10, 10) y-down → (10, 190) in DXF space.
        const lines = dxf.split('\r\n');
        const idx = lines.findIndex(
            (l, i) => l === '10' && lines[i + 1] === '10' && lines[i + 2] === '20',
        );
        expect(idx).toBeGreaterThan(-1);
        expect(lines[idx + 3]).toBe('190');
    });
});
