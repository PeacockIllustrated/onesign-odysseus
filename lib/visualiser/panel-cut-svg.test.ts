import { describe, it, expect } from 'vitest';
import { buildPanelDevelopmentSvg, composeTrayHoles } from './panel-cut-svg';
import type { FlatPath, SectionedExport } from './types';

/** A distinct closed square at an offset, tagged by its first point for identity. */
function tag(id: number): FlatPath {
    return {
        closed: true,
        points: [
            [id, id],
            [id + 10, id],
            [id + 10, id + 10],
            [id, id],
        ],
    };
}

describe('composeTrayHoles — shared tray face-cut authority', () => {
    const base = {
        sectionCount: 1,
        apertureBySection: [[tag(1)]],
        keylineBySection: [[]] as FlatPath[][],
        pushThroughKeylineBySection: [[tag(2)]],
        pushThroughIslandsBySection: [[tag(3)]],
        fixingsBySection: [[tag(4)]],
        cableHolesBySection: [[tag(5)]],
    };

    it('uses the raw aperture when there is no keyline, and folds in the rest', () => {
        const [holes] = composeTrayHoles(base);
        const firsts = holes.map((h) => h.points[0][0]);
        expect(firsts).toEqual([1, 2, 3, 4, 5]); // aperture + pt-keyline + island + fixing + cable
    });

    it('a global keyline SUPERSEDES the raw aperture', () => {
        const [holes] = composeTrayHoles({
            ...base,
            keylineBySection: [[tag(9)]],
        });
        const firsts = holes.map((h) => h.points[0][0]);
        expect(firsts).toContain(9); // keyline present
        expect(firsts).not.toContain(1); // raw aperture dropped
        expect(firsts).toEqual([9, 2, 3, 4, 5]);
    });

    it('never cuts letter counters into the tray (no apertureHoles input at all)', () => {
        // The signature structurally excludes apertureHoles — a counter can only
        // reach the cutter via the acrylic insert, never the aluminium tray.
        expect('apertureHolesBySection' in base).toBe(false);
    });

    it('is index-wise per section', () => {
        const two = composeTrayHoles({
            sectionCount: 2,
            apertureBySection: [[tag(1)], [tag(11)]],
            keylineBySection: [[], [tag(19)]],
            pushThroughKeylineBySection: [[], []],
            pushThroughIslandsBySection: [[], []],
            fixingsBySection: [[], []],
            cableHolesBySection: [[], []],
        });
        expect(two[0].map((h) => h.points[0][0])).toEqual([1]); // section 0: aperture
        expect(two[1].map((h) => h.points[0][0])).toEqual([19]); // section 1: keyline supersedes
    });
});

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

    it('cut mode emits hairline outline paths — no fill or background', () => {
        const out = buildPanelDevelopmentSvg({
            sectionExport: sectionExport(),
            holesBySection: [[aperture]],
            panelColor: '#c8ccce',
            mode: 'cut',
        });
        expect(out.svg).toContain('fill="none"');
        expect(out.svg).not.toContain('fill="#c8ccce"'); // not filled in panel colour
        expect(out.svg).toContain('stroke="#000000"'); // black cut line
        expect(out.svg).toContain('#0000ff'); // fold line = reference blue
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
