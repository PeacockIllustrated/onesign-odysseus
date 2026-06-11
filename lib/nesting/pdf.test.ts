// @vitest-environment happy-dom
//
// Smoke test for the PDF generator — jsPDF needs a DOM/Blob, which happy-dom
// supplies. Asserts the document builds end to end (per-sheet pages + the
// grouped reference + unplaced warning path) without throwing and yields a
// non-empty PDF blob.

import { describe, expect, it } from 'vitest';
import { generateNestingPdfBlob } from './pdf';
import {
    DEFAULT_NEST_CONFIG,
    type NestConfig,
    type NestPiece,
    type NestSolution,
    type PieceGroup,
    type Ring,
} from './types';

const sq = (size: number): Ring => [
    [0, 0],
    [size, 0],
    [size, size],
    [0, size],
];

function piece(id: string, group: string, withHole = false): NestPiece {
    return {
        id,
        label: `Piece ${id.replace('p', '')}`,
        groupId: group,
        outer: sq(100),
        holes: withHole
            ? [
                  [
                      [30, 30],
                      [70, 30],
                      [70, 70],
                      [30, 70],
                  ],
              ]
            : [],
        areaMm2: withHole ? 100 * 100 - 40 * 40 : 100 * 100,
        widthMm: 100,
        heightMm: 100,
    };
}

describe('generateNestingPdfBlob', () => {
    const config: NestConfig = {
        ...DEFAULT_NEST_CONFIG,
        sheetWidthMm: 600,
        sheetHeightMm: 400,
    };
    const pieces = [
        piece('p1', 'g1', true),
        piece('p2', 'g1'),
        piece('p3', 'g2'),
    ];
    const groups: PieceGroup[] = [
        { id: 'g1', label: 'RETAIL', pieceIds: ['p1', 'p2'] },
        { id: 'g2', label: 'Shape group 1', pieceIds: ['p3'] },
    ];

    it('builds a multi-sheet pack with grouped reference', () => {
        const solution: NestSolution = {
            placements: [
                { pieceId: 'p1', sheetIndex: 0, xMm: 10, yMm: 10, rotationDeg: 0 },
                { pieceId: 'p2', sheetIndex: 0, xMm: 150, yMm: 10, rotationDeg: 90 },
                { pieceId: 'p3', sheetIndex: 1, xMm: 10, yMm: 10, rotationDeg: 0 },
            ],
            sheets: [
                { index: 0, pieceCount: 2, utilisation: 0.4, usedWidthMm: 250, usedHeightMm: 100 },
                { index: 1, pieceCount: 1, utilisation: 0.1, usedWidthMm: 100, usedHeightMm: 100 },
            ],
            unplacedPieceIds: [],
            iteration: 0,
            score: 1,
        };
        const blob = generateNestingPdfBlob({
            jobName: 'test-job',
            pieces,
            groups,
            solution,
            config,
            generatedAt: new Date(0),
        });
        expect(blob).toBeInstanceOf(Blob);
        expect(blob.size).toBeGreaterThan(1000);
    });

    it('handles an unplaced group without throwing', () => {
        const solution: NestSolution = {
            placements: [
                { pieceId: 'p1', sheetIndex: 0, xMm: 10, yMm: 10, rotationDeg: 0 },
            ],
            sheets: [
                { index: 0, pieceCount: 1, utilisation: 0.2, usedWidthMm: 100, usedHeightMm: 100 },
            ],
            unplacedPieceIds: ['p2', 'p3'],
            iteration: 0,
            score: 1,
        };
        const blob = generateNestingPdfBlob({
            jobName: 'overflow',
            pieces,
            groups,
            solution,
            config,
            generatedAt: new Date(0),
        });
        expect(blob.size).toBeGreaterThan(1000);
    });
});
