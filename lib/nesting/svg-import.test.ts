// @vitest-environment happy-dom
//
// importNestSvg needs a real DOM (DOMParser) — happy-dom provides one per
// file via the pragma above while the rest of the suite stays on node.
// This doubles as the pipeline integration test: a realistic
// Illustrator-style fixture goes import → buildPieces → nestOnce →
// buildSheetSvg without touching a browser.

import { describe, expect, it } from 'vitest';
import { nestOnce } from './engine';
import { buildPieces } from './pieces';
import { buildSheetSvg } from './svg-export';
import { importNestSvg } from './svg-import';
import { DEFAULT_NEST_CONFIG } from './types';

/**
 * Mirrors an Illustrator "export as SVG" of outlined artwork: physical mm
 * units, a named group (id), a renamed group (data-name), a compound path
 * (outer + island in ONE path element, like an outlined D), a transformed
 * path, primitive shapes, and a stray live-text element.
 */
const FIXTURE = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="400mm" height="200mm" viewBox="0 0 400 200">
  <g id="RETAIL">
    <path d="M10,10 h60 v60 h-60 Z M25,25 h20 v20 h-20 Z"/>
    <path transform="translate(100,10) rotate(45 30 30)" d="M0,0 h60 v60 h-60 Z"/>
  </g>
  <g data-name="Opening Hours" id="Opening_x20_Hours">
    <rect x="200" y="10" width="50" height="30"/>
  </g>
  <circle cx="300" cy="100" r="20"/>
  <text x="0" y="190">live text</text>
</svg>`;

describe('importNestSvg', () => {
    it('imports mm-true contours with group provenance', () => {
        const result = importNestSvg(FIXTURE);

        // 400mm over a 400-unit viewBox → 1 unit = 1mm.
        // Compound path = 2 contours, + rotated square + rect + circle = 5.
        expect(result.paths).toHaveLength(5);
        expect(result.paths.every((p) => p.closed)).toBe(true);

        // Both contours of the compound path share one source element + label.
        const retail = result.paths.filter((p) => p.groupLabel === 'RETAIL');
        expect(retail).toHaveLength(3);
        expect(retail[0].sourceIndex).toBe(retail[1].sourceIndex);
        expect(retail[2].sourceIndex).not.toBe(retail[0].sourceIndex);

        // data-name wins over the escaped id.
        const hours = result.paths.find((p) => p.groupLabel === 'Opening Hours');
        expect(hours).toBeDefined();

        // The transform (translate + rotate about a centre) is baked in:
        // the square's centre stays at (130, 40), its bbox grows to 60·√2.
        const rotated = retail[2];
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const [x, y] of rotated.points) {
            minX = Math.min(minX, x);
            maxX = Math.max(maxX, x);
            minY = Math.min(minY, y);
            maxY = Math.max(maxY, y);
        }
        expect((minX + maxX) / 2).toBeCloseTo(130, 3);
        expect((minY + maxY) / 2).toBeCloseTo(40, 3);
        expect(maxX - minX).toBeCloseTo(60 * Math.SQRT2, 3);

        // The live <text> is ignored but flagged.
        expect(
            result.warnings.some((w) => w.toLowerCase().includes('text')),
        ).toBe(true);
    });

    it('warns when the file has no physical units', () => {
        const result = importNestSvg(
            '<svg xmlns="http://www.w3.org/2000/svg"><rect x="0" y="0" width="10" height="10"/></svg>',
        );
        expect(result.paths).toHaveLength(1);
        expect(result.warnings.some((w) => w.includes('1mm'))).toBe(true);
    });

    it('feeds the whole pipeline: import → pieces → nest → export', () => {
        const imported = importNestSvg(FIXTURE);
        const { pieces, groups } = buildPieces(imported.paths);

        // 4 pieces: D-like (with its island as a hole), rotated square,
        // rect, circle.
        expect(pieces).toHaveLength(4);
        const withHole = pieces.find((p) => p.holes.length === 1);
        expect(withHole).toBeDefined();
        expect(withHole!.areaMm2).toBeCloseTo(60 * 60 - 20 * 20, 1);

        const retailGroup = groups.find((g) => g.label === 'RETAIL');
        expect(retailGroup?.pieceIds).toHaveLength(2);

        const config = {
            ...DEFAULT_NEST_CONFIG,
            sheetWidthMm: 300,
            sheetHeightMm: 300,
            marginMm: 10,
            gapMm: 3,
            rotationStepDeg: 90 as const,
        };
        const solution = nestOnce(pieces, config);
        expect(solution.placements).toHaveLength(4);
        expect(solution.unplacedPieceIds).toHaveLength(0);
        expect(solution.sheets).toHaveLength(1);

        const svg = buildSheetSvg({
            pieces,
            placements: solution.placements,
            config,
            title: 'pipeline test',
        });
        expect(svg).toContain('width="300mm"');
        // One cut path per piece + the sheet boundary rect.
        expect(svg.match(/<path /g)).toHaveLength(4);
    });
});
