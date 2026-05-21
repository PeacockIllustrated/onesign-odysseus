import { describe, it, expect } from 'vitest';
import {
    buildSectionedExport,
    clipApertureToSection,
    validateExport,
    buildDevelopment,
    placeFixings,
} from './geometry';
import { splitPanels } from './split';
import type { FlatPath, PanelParams } from './types';

function base(overrides: Partial<PanelParams> = {}): PanelParams {
    return {
        name: 'export-test',
        panelWidthMm: 1000,
        panelHeightMm: 350,
        returnDepthMm: 80,
        returns: { top: true, bottom: true, left: true, right: true },
        shadowGapMm: 0,
        keylineMm: 0,
        materialThicknessMm: 5,
        materialLabel: '5mm aluminium',
        ...overrides,
    };
}

describe('buildSectionedExport — split signs become per-section flat blanks', () => {
    it('single-panel sign collapses to one section with the full returns', () => {
        const params = base();
        const split = splitPanels(params.panelWidthMm);
        const sx = buildSectionedExport(params, split);

        expect(sx.sections.length).toBe(1);
        const s = sx.sections[0];
        expect(s.index).toBe(0);
        expect(s.count).toBe(1);
        expect(s.sectionWidthMm).toBe(1000);
        expect(s.layoutOriginXMm).toBe(0);
        expect(s.returnsUsed).toEqual(params.returns);
    });

    it('4000 mm sign → 3 sections; only outer keep their L/R returns', () => {
        const params = base({ panelWidthMm: 4000 });
        const split = splitPanels(params.panelWidthMm);
        const sx = buildSectionedExport(params, split);

        expect(sx.sections.length).toBe(3);
        // Outer sections keep their relevant returns; the centre has neither.
        expect(sx.sections[0].returnsUsed.left).toBe(true);
        expect(sx.sections[0].returnsUsed.right).toBe(false);
        expect(sx.sections[1].returnsUsed.left).toBe(false);
        expect(sx.sections[1].returnsUsed.right).toBe(false);
        expect(sx.sections[2].returnsUsed.left).toBe(false);
        expect(sx.sections[2].returnsUsed.right).toBe(true);
        // Top + bottom unchanged on every section.
        for (const s of sx.sections) {
            expect(s.returnsUsed.top).toBe(true);
            expect(s.returnsUsed.bottom).toBe(true);
        }
        // Section nominal widths sum back to the full face width.
        const sum = sx.sections.reduce((a, s) => a + s.sectionWidthMm, 0);
        expect(sum).toBeCloseTo(4000, 3);
    });

    it('layout origins are cumulative with a gap between sections', () => {
        const params = base({ panelWidthMm: 4000 });
        const split = splitPanels(params.panelWidthMm);
        const sx = buildSectionedExport(params, split);

        expect(sx.gapMm).toBeGreaterThan(0);
        expect(sx.sections[0].layoutOriginXMm).toBe(0);
        const expected1 =
            sx.sections[0].development.totalFlatWMm + sx.gapMm;
        expect(sx.sections[1].layoutOriginXMm).toBeCloseTo(expected1, 3);
        const expected2 =
            expected1 + sx.sections[1].development.totalFlatWMm + sx.gapMm;
        expect(sx.sections[2].layoutOriginXMm).toBeCloseTo(expected2, 3);
        // totalLayoutW excludes the trailing gap.
        const sumFlats = sx.sections.reduce(
            (a, s) => a + s.development.totalFlatWMm,
            0,
        );
        expect(sx.totalLayoutWMm).toBeCloseTo(
            sumFlats + sx.gapMm * (sx.sections.length - 1),
            3,
        );
    });
});

describe('clipApertureToSection — apertures are clipped + translated per section', () => {
    it('an aperture entirely inside one section ends up in that section only', () => {
        const params = base({ panelWidthMm: 4000 });
        const fullDev = buildDevelopment(params);
        const split = splitPanels(params.panelWidthMm);
        const sx = buildSectionedExport(params, split);

        // A 100 mm square aperture placed inside the centre section's face.
        const face = fullDev.segments.find((s) => s.role === 'face')!;
        const centreStart = face.xMm + sx.sections[1].faceSliceXMm;
        const ap: FlatPath = {
            closed: true,
            points: [
                [centreStart + 200, face.yMm + 100],
                [centreStart + 300, face.yMm + 100],
                [centreStart + 300, face.yMm + 200],
                [centreStart + 200, face.yMm + 200],
                [centreStart + 200, face.yMm + 100],
            ],
        };

        expect(clipApertureToSection(fullDev, sx.sections[0], [ap])).toEqual(
            [],
        );
        expect(clipApertureToSection(fullDev, sx.sections[2], [ap])).toEqual(
            [],
        );
        const centre = clipApertureToSection(fullDev, sx.sections[1], [ap]);
        expect(centre.length).toBe(1);
        // The clipped + translated points fit inside the centre section's
        // flat-blank bounding box in the export sheet space.
        const s1 = sx.sections[1];
        const xMin = s1.layoutOriginXMm;
        const xMax = xMin + s1.development.totalFlatWMm;
        for (const [x] of centre[0].points) {
            expect(x).toBeGreaterThanOrEqual(xMin - 1e-3);
            expect(x).toBeLessThanOrEqual(xMax + 1e-3);
        }
    });

    it('an aperture straddling a seam is split between two sections', () => {
        const params = base({ panelWidthMm: 4000 });
        const fullDev = buildDevelopment(params);
        const split = splitPanels(params.panelWidthMm);
        const sx = buildSectionedExport(params, split);

        // Square aperture straddling the first seam (= width of section 0).
        const face = fullDev.segments.find((s) => s.role === 'face')!;
        const seamX = face.xMm + sx.sections[0].sectionWidthMm; // first seam
        const ap: FlatPath = {
            closed: true,
            points: [
                [seamX - 60, face.yMm + 100],
                [seamX + 60, face.yMm + 100],
                [seamX + 60, face.yMm + 200],
                [seamX - 60, face.yMm + 200],
                [seamX - 60, face.yMm + 100],
            ],
        };
        const left = clipApertureToSection(fullDev, sx.sections[0], [ap]);
        const centre = clipApertureToSection(fullDev, sx.sections[1], [ap]);
        const right = clipApertureToSection(fullDev, sx.sections[2], [ap]);
        expect(left.length).toBe(1);
        expect(centre.length).toBe(1);
        expect(right.length).toBe(0);
    });
});

describe('validateExport — advisory warnings before download', () => {
    it('flags a missing material label', () => {
        const params = base({ materialLabel: '' });
        const dev = buildDevelopment(params);
        const split = splitPanels(params.panelWidthMm);
        const warnings = validateExport({
            params,
            split,
            development: dev,
            aperture: [],
            fixings: [],
            apertureClipped: false,
        });
        expect(warnings.some((w) => w.kind === 'missing_material')).toBe(true);
    });

    it('flags a fixing sitting on a seam', () => {
        const params = base({ panelWidthMm: 4000 });
        const dev = buildDevelopment(params);
        const split = splitPanels(params.panelWidthMm);
        // First seam in flat-dev coords:
        const face = dev.segments.find((s) => s.role === 'face')!;
        const k = face.wMm / dev.faceNominalWMm;
        const seamFlatX = face.xMm + split.seamXsMm[0] * k;
        // A 10 mm-diameter circle centred on the seam.
        const circle: FlatPath = {
            closed: true,
            points: Array.from({ length: 17 }, (_, i) => {
                const t = (i / 16) * Math.PI * 2;
                return [seamFlatX + Math.cos(t) * 5, face.yMm + 100 + Math.sin(t) * 5] as [
                    number,
                    number,
                ];
            }),
        };
        const warnings = validateExport({
            params,
            split,
            development: dev,
            aperture: [],
            fixings: [circle],
            apertureClipped: false,
        });
        expect(warnings.some((w) => w.kind === 'fixing_on_seam')).toBe(true);
    });

    it('flags an aperture point too close to a fold line', () => {
        const params = base();
        const dev = buildDevelopment(params);
        const split = splitPanels(params.panelWidthMm);
        // Place a point right on the bottom fold line (face bottom edge).
        const face = dev.segments.find((s) => s.role === 'face')!;
        const ap: FlatPath = {
            closed: true,
            points: [
                [face.xMm + 200, face.yMm + face.hMm - 1],
                [face.xMm + 250, face.yMm + face.hMm - 1],
                [face.xMm + 250, face.yMm + face.hMm - 30],
                [face.xMm + 200, face.yMm + face.hMm - 30],
                [face.xMm + 200, face.yMm + face.hMm - 1],
            ],
        };
        const warnings = validateExport({
            params,
            split,
            development: dev,
            aperture: [ap],
            fixings: [],
            apertureClipped: false,
        });
        expect(warnings.some((w) => w.kind === 'aperture_near_fold')).toBe(
            true,
        );
    });

    it('clean spec → no warnings', () => {
        const params = base(); // all good
        const dev = buildDevelopment(params);
        const split = splitPanels(params.panelWidthMm);
        const fixings = placeFixings(
            [
                {
                    closed: true,
                    points: [
                        [dev.segments[0].xMm + 100, dev.segments[0].yMm + 100],
                        [dev.segments[0].xMm + 300, dev.segments[0].yMm + 100],
                        [dev.segments[0].xMm + 300, dev.segments[0].yMm + 200],
                        [dev.segments[0].xMm + 100, dev.segments[0].yMm + 200],
                        [dev.segments[0].xMm + 100, dev.segments[0].yMm + 100],
                    ],
                },
            ],
            10,
        );
        const warnings = validateExport({
            params,
            split,
            development: dev,
            aperture: [],
            fixings,
            apertureClipped: false,
        });
        expect(warnings.length).toBe(0);
    });
});
