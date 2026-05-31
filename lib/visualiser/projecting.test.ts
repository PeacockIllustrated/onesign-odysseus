import { describe, expect, it } from 'vitest';
import {
    bracketSpecNote,
    isProjecting,
    projectingSpecLine,
    resolveProjecting,
    signTypeOf,
} from './projecting';
import { DEFAULT_PROJECTING, type PanelParams } from './types';

describe('signTypeOf', () => {
    it('treats absent signType as fascia (backward compatible)', () => {
        expect(signTypeOf({})).toBe('fascia');
        expect(signTypeOf({ signType: undefined })).toBe('fascia');
    });

    it('respects an explicit signType', () => {
        expect(signTypeOf({ signType: 'projecting' })).toBe('projecting');
        expect(signTypeOf({ signType: 'fascia' })).toBe('fascia');
    });

    it('isProjecting only true for projecting', () => {
        expect(isProjecting({})).toBe(false);
        expect(isProjecting({ signType: 'projecting' })).toBe(true);
    });
});

describe('resolveProjecting', () => {
    it('applies all §5 defaults when absent', () => {
        expect(resolveProjecting(undefined)).toEqual(DEFAULT_PROJECTING);
    });

    it('keeps caller-supplied values and fills the rest', () => {
        const r = resolveProjecting({ projectionMm: 900, doubleSided: false });
        expect(r.projectionMm).toBe(900);
        expect(r.doubleSided).toBe(false);
        expect(r.bracketStyle).toBe(DEFAULT_PROJECTING.bracketStyle);
        expect(r.wallPlate).toEqual(DEFAULT_PROJECTING.wallPlate);
    });
});

describe('spec strings', () => {
    it('projectingSpecLine reads naturally with defaults', () => {
        expect(projectingSpecLine(resolveProjecting(undefined))).toBe(
            'Projecting · 600mm projection · double-sided · box-arm bracket',
        );
    });

    it('projectingSpecLine reflects single-sided + style', () => {
        const r = resolveProjecting({
            doubleSided: false,
            bracketStyle: 'scroll',
            projectionMm: 450,
        });
        expect(projectingSpecLine(r)).toBe(
            'Projecting · 450mm projection · single-sided · scroll bracket',
        );
    });

    it('bracketSpecNote includes wall-plate footprint + projection', () => {
        const note = bracketSpecNote(resolveProjecting(undefined));
        expect(note).toContain('bought-in box-arm');
        expect(note).toContain('600mm projection');
        expect(note).toContain('300×300mm');
        expect(note).toContain('Double-sided');
    });
});

describe('PanelParams stays valid without projecting fields', () => {
    it('a minimal fascia params object has no signType', () => {
        const p: PanelParams = {
            name: 'x',
            panelWidthMm: 100,
            panelHeightMm: 100,
            returnDepthMm: 0,
            returns: { top: false, bottom: false, left: false, right: false },
            shadowGapMm: 0,
            keylineMm: 0,
            materialThicknessMm: 3,
        };
        expect(signTypeOf(p)).toBe('fascia');
    });
});
