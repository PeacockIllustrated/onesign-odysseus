import { describe, it, expect } from 'vitest';
import { buildPanelDevelopmentSvg } from './panel-cut-svg';
import type { FlatPath, SectionedExport } from './types';

function sectionExport(): SectionedExport {
    return {
        sections: [
            {
                index: 0,
                count: 1,
                sectionWidthMm: 1000,
                faceSliceXMm: 0,
                returnsUsed: { top: true, bottom: true, left: true, right: true },
                development: {
                    faceNominalWMm: 1000,
                    faceNominalHMm: 500,
                    faceFlatWMm: 1000,
                    faceFlatHMm: 500,
                    returnFlatDepthMm: 50,
                    lipFlatDepthMm: 0,
                    totalFlatWMm: 1100,
                    totalFlatHMm: 600,
                    segments: [
                        { id: 'face', role: 'face', xMm: 50, yMm: 50, wMm: 1000, hMm: 500, label: 'face' },
                    ],
                    foldLines: [
                        { id: 'f-top', edge: 'top', kind: 'return', x1: 50, y1: 50, x2: 1050, y2: 50, note: 'top return' },
                    ],
                },
                layoutOriginXMm: 0,
            },
        ],
        totalLayoutWMm: 1100,
        totalLayoutHMm: 600,
        gapMm: 0,
    };
}

const aperture: FlatPath = {
    closed: true,
    points: [
        [200, 200],
        [400, 200],
        [400, 400],
        [200, 400],
        [200, 200],
    ],
};

describe('buildPanelDevelopmentSvg', () => {
    it('renders the flat blank filled in the panel colour with the bend line', () => {
        const out = buildPanelDevelopmentSvg({
            sectionExport: sectionExport(),
            holesBySection: [[aperture]],
            panelColor: '#c8ccce',
        });
        expect(out.svg).toContain('fill="#c8ccce"');
        // apertures punched even-odd
        expect(out.svg).toContain('fill-rule="evenodd"');
        // a dashed fold line
        expect(out.svg).toContain('stroke-dasharray');
        // true-mm + the flat-blank size reported
        expect(out.svg).toMatch(/width="[\d.]+mm"/);
        expect(out.widthMm).toBe(1100);
        expect(out.heightMm).toBe(600);
    });

    it('punches each aperture as a hole subpath (outer + holes)', () => {
        const out = buildPanelDevelopmentSvg({
            sectionExport: sectionExport(),
            holesBySection: [[aperture, aperture]],
            panelColor: '#cccccc',
        });
        // The compound path has the blank outline + 2 aperture rings → ≥3 Z's.
        const d = out.svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
        expect((d.match(/Z/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });

    it('includes a counter island nested inside its letter (cut too)', () => {
        // A letter outer + its counter ring → both land in the compound path,
        // so even-odd leaves the counter as a solid island.
        const counter: FlatPath = {
            closed: true,
            points: [
                [260, 260],
                [340, 260],
                [340, 340],
                [260, 340],
                [260, 260],
            ],
        };
        const out = buildPanelDevelopmentSvg({
            sectionExport: sectionExport(),
            holesBySection: [[aperture, counter]],
            panelColor: '#cccccc',
        });
        const d = out.svg.match(/<path d="([^"]+)"/)?.[1] ?? '';
        // blank perimeter + letter + counter ⇒ ≥3 closed rings in one path.
        expect((d.match(/Z/g) ?? []).length).toBeGreaterThanOrEqual(3);
    });

    it('survives a section with no holes', () => {
        const out = buildPanelDevelopmentSvg({
            sectionExport: sectionExport(),
            holesBySection: [[]],
            panelColor: '#cccccc',
        });
        expect(out.svg).toContain('<svg');
    });
});
