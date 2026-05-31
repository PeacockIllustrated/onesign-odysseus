import { describe, expect, it } from 'vitest';
import {
    DEFAULT_MOUNT,
    bracketSpecNote,
    hasProjecting,
    projectingDimsLabel,
    projectingSpecLine,
    resolveMount,
    seedProjectingFromMain,
} from './projecting';
import { DEFAULT_PROJECTING_SIZE_MM, type PanelParams } from './types';

const MAIN: PanelParams = {
    name: 'Acme fascia',
    panelWidthMm: 2400,
    panelHeightMm: 400,
    returnDepthMm: 50,
    returns: { top: true, bottom: true, left: true, right: true },
    shadowGapMm: 0,
    keylineMm: 0,
    materialThicknessMm: 5,
    panelColor: '#d6d6d6',
    materialLabel: 'Aluminium, satin white',
    artworkLayers: [
        { id: 'L1', svgSource: '<svg/>', xMm: 10, yMm: 10, scale: 1, wMm: 100, hMm: 50 },
    ],
};

describe('hasProjecting', () => {
    it('is false without a projecting sign, true with one', () => {
        expect(hasProjecting(MAIN)).toBe(false);
        expect(
            hasProjecting({ projectingSign: seedProjectingFromMain(MAIN) }),
        ).toBe(true);
    });
});

describe('resolveMount', () => {
    it('applies all defaults when absent (square, off-the-face)', () => {
        expect(resolveMount(undefined)).toEqual(DEFAULT_MOUNT);
        expect(DEFAULT_MOUNT.shape).toBe('square');
    });

    it('keeps caller-supplied values and fills the rest', () => {
        const r = resolveMount({ offsetXMm: 120, doubleSided: false, shape: 'circle' });
        expect(r.offsetXMm).toBe(120);
        expect(r.doubleSided).toBe(false);
        expect(r.shape).toBe('circle');
        expect(r.bracketStyle).toBe(DEFAULT_MOUNT.bracketStyle);
    });
});

describe('seedProjectingFromMain', () => {
    it('defaults to a small square, not the main panel size', () => {
        const seed = seedProjectingFromMain(MAIN);
        expect(seed.panel.panelWidthMm).toBe(DEFAULT_PROJECTING_SIZE_MM);
        expect(seed.panel.panelHeightMm).toBe(DEFAULT_PROJECTING_SIZE_MM);
        expect(seed.mount.shape).toBe('square');
    });

    it('mirrors the main look (colour, material) but starts with fresh artwork', () => {
        const seed = seedProjectingFromMain(MAIN);
        expect(seed.panel.panelColor).toBe('#d6d6d6');
        expect(seed.panel.materialLabel).toBe('Aluminium, satin white');
        expect(seed.panel.artworkLayers).toEqual([]);
        expect(seed.svgSource).toBeNull();
    });

    it('names the sign after the main panel', () => {
        expect(seedProjectingFromMain(MAIN).panel.name).toBe(
            'Acme fascia — projecting',
        );
    });

    it('is a deep copy — editing the sign never mutates the main', () => {
        const seed = seedProjectingFromMain(MAIN);
        seed.panel.panelColor = '#000000';
        expect(MAIN.panelColor).toBe('#d6d6d6');
        expect(MAIN.artworkLayers![0].xMm).toBe(10);
    });

    it('strips any nested projectingSign so a sign cannot carry its own', () => {
        const nested: PanelParams = {
            ...MAIN,
            projectingSign: seedProjectingFromMain(MAIN),
        };
        const seed = seedProjectingFromMain(nested);
        expect(
            (seed.panel as { projectingSign?: unknown }).projectingSign,
        ).toBeUndefined();
    });
});

describe('dimension + spec strings', () => {
    it('projectingDimsLabel reads square vs circle', () => {
        expect(projectingDimsLabel({ panelWidthMm: 500, panelHeightMm: 500 }, 'square')).toBe(
            '500×500mm',
        );
        expect(projectingDimsLabel({ panelWidthMm: 500, panelHeightMm: 500 }, 'circle')).toBe(
            '500mm dia',
        );
    });

    it('projectingSpecLine reads naturally with defaults', () => {
        expect(projectingSpecLine({ panelWidthMm: 500, panelHeightMm: 500 }, undefined)).toBe(
            'Projecting square · 500×500mm · double-sided · box-arm bracket',
        );
    });

    it('projectingSpecLine reflects circle + single-sided + style', () => {
        expect(
            projectingSpecLine(
                { panelWidthMm: 600, panelHeightMm: 600 },
                { shape: 'circle', doubleSided: false, bracketStyle: 'scroll' },
            ),
        ).toBe('Projecting circle · 600mm dia · single-sided · scroll bracket');
    });

    it('bracketSpecNote notes perpendicular projection + shape', () => {
        const note = bracketSpecNote({ panelWidthMm: 500 }, { shape: 'circle' });
        expect(note).toContain('bought-in box-arm');
        expect(note).toContain('projects 500mm perpendicular from the face');
        expect(note).toContain('Double-sided circle');
    });
});
