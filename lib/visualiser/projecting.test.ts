import { describe, expect, it } from 'vitest';
import {
    DEFAULT_MOUNT,
    bracketSpecNote,
    hasProjecting,
    projectingSpecLine,
    resolveMount,
    seedProjectingFromMain,
} from './projecting';
import type { PanelParams } from './types';

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
    artworkLayers: [
        { id: 'L1', svgSource: '<svg/>', xMm: 10, yMm: 10, scale: 1, wMm: 100, hMm: 50 },
    ],
};

describe('hasProjecting', () => {
    it('is false without a projecting sign, true with one', () => {
        expect(hasProjecting(MAIN)).toBe(false);
        expect(
            hasProjecting({ projectingSign: seedProjectingFromMain(MAIN, null) }),
        ).toBe(true);
    });
});

describe('resolveMount', () => {
    it('applies all defaults when absent', () => {
        expect(resolveMount(undefined)).toEqual(DEFAULT_MOUNT);
    });

    it('keeps caller-supplied values and fills the rest', () => {
        const r = resolveMount({ offsetXMm: 120, doubleSided: false, side: 'right' });
        expect(r.offsetXMm).toBe(120);
        expect(r.doubleSided).toBe(false);
        expect(r.side).toBe('right');
        expect(r.bracketStyle).toBe(DEFAULT_MOUNT.bracketStyle);
    });
});

describe('seedProjectingFromMain', () => {
    it('mirrors the main artwork/colours and carries the svg', () => {
        const seed = seedProjectingFromMain(MAIN, '<svg id="main"/>');
        expect(seed.panel.panelColor).toBe('#d6d6d6');
        expect(seed.panel.artworkLayers).toHaveLength(1);
        expect(seed.svgSource).toBe('<svg id="main"/>');
        expect(seed.mount).toEqual(DEFAULT_MOUNT);
    });

    it('names the blade after the main panel', () => {
        expect(seedProjectingFromMain(MAIN, null).panel.name).toBe(
            'Acme fascia — projecting',
        );
    });

    it('is a deep copy — editing the blade never mutates the main', () => {
        const seed = seedProjectingFromMain(MAIN, null);
        seed.panel.panelWidthMm = 450;
        seed.panel.artworkLayers![0].xMm = 999;
        expect(MAIN.panelWidthMm).toBe(2400);
        expect(MAIN.artworkLayers![0].xMm).toBe(10);
    });

    it('strips any nested projectingSign so a blade cannot carry its own', () => {
        const nested: PanelParams = {
            ...MAIN,
            projectingSign: seedProjectingFromMain(MAIN, null),
        };
        const seed = seedProjectingFromMain(nested, null);
        expect(
            (seed.panel as { projectingSign?: unknown }).projectingSign,
        ).toBeUndefined();
    });
});

describe('spec strings', () => {
    it('projectingSpecLine reads naturally with defaults', () => {
        expect(projectingSpecLine({ panelWidthMm: 450, panelHeightMm: 1200 }, undefined)).toBe(
            'Projecting blade · 450×1200mm · double-sided · box-arm bracket',
        );
    });

    it('projectingSpecLine reflects single-sided + style', () => {
        expect(
            projectingSpecLine(
                { panelWidthMm: 500, panelHeightMm: 900 },
                { doubleSided: false, bracketStyle: 'scroll' },
            ),
        ).toBe('Projecting blade · 500×900mm · single-sided · scroll bracket');
    });

    it('bracketSpecNote includes protrusion, side + sidedness', () => {
        const note = bracketSpecNote({ panelWidthMm: 450 }, { side: 'right' });
        expect(note).toContain('bought-in box-arm');
        expect(note).toContain('protrudes 450mm');
        expect(note).toContain('mounted right');
        expect(note).toContain('Double-sided');
    });
});
