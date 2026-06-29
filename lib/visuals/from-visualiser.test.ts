import { describe, expect, it } from 'vitest';
import type { PanelParams } from '../visualiser/types';
import { visualiserToSignSpec } from './from-visualiser';

/** Minimal valid PanelParams; tests spread overrides onto this. */
const base: PanelParams = {
    name: 'Sign',
    panelWidthMm: 2400,
    panelHeightMm: 600,
    returnDepthMm: 40,
    returns: { top: true, bottom: true, left: true, right: true },
    shadowGapMm: 0,
    keylineMm: 0,
    materialThicknessMm: 3,
};

describe('visualiserToSignSpec', () => {
    it('maps a default folded-aluminium fascia panel', () => {
        const spec = visualiserToSignSpec({ ...base, name: 'Queen Bee sign', panelRal: 'RAL 7016' });
        expect(spec.form).toBe('fascia_panel');
        expect(spec.faceMaterial).toBe('painted_aluminium');
        expect(spec.illumination).toBe('none');
        expect(spec.mounting).toBe('flush');
        expect(spec.colour).toBe('RAL 7016');
        expect(spec.dimensions).toBe('2400 × 600 mm');
        expect(spec.text).toBe('Queen Bee'); // "sign" stripped
    });

    it('detects built-up brass letters (stood-off, brass face)', () => {
        const spec = visualiserToSignSpec({
            ...base,
            builtUp: {
                finish: 'brass',
                returnDepthMm: 40,
                materialThicknessMm: 1.5,
                breakAngleDeg: 90,
                stockLengthMm: 3000,
                totalReturnLengthMm: 1200,
                weldCount: 8,
                faceCount: 6,
            },
        });
        expect(spec.form).toBe('built_up_letters');
        expect(spec.faceMaterial).toBe('brass');
        expect(spec.mounting).toBe('stood_off');
    });

    it('detects halo-lit push-through letters with a metal extra-face', () => {
        const spec = visualiserToSignSpec({
            ...base,
            illumination: { keyline: { enabled: true, color: '#ffffff', intensity: 1 } },
            materialGroups: [
                {
                    id: 'g1',
                    material: 'pushthrough',
                    color: '#ffffff',
                    extraFace: { material: 'stainless', thicknessMm: 1.5 },
                    pathIndices: [0, 1],
                },
            ],
        });
        expect(spec.form).toBe('push_through_letters');
        expect(spec.faceMaterial).toBe('stainless'); // extra-face metal wins
        expect(spec.illumination).toBe('halo'); // keyline enabled
        expect(spec.mounting).toBe('flush');
    });

    it('treats a vinyl-wrapped panel as printed vinyl on a fascia', () => {
        const spec = visualiserToSignSpec({ ...base, apertureMode: 'vinyl', panelColor: '#d6d6d6' });
        expect(spec.form).toBe('fascia_panel');
        expect(spec.faceMaterial).toBe('printed_vinyl');
        expect(spec.colour).toBe('#d6d6d6'); // falls back to hex when no RAL
    });

    it('maps stand-off cut lettering and a backlit group', () => {
        const standoff = visualiserToSignSpec({ ...base, apertureMode: 'standoff' });
        expect(standoff.form).toBe('flat_cut_letters');
        expect(standoff.mounting).toBe('stood_off');

        const backlit = visualiserToSignSpec({
            ...base,
            materialGroups: [{ id: 'g', material: 'backlight', color: '#ffffff', pathIndices: [0] }],
        });
        expect(backlit.illumination).toBe('backlit');
    });

    it('notes a projecting blade sign and a free-text material label', () => {
        const spec = visualiserToSignSpec({
            ...base,
            materialLabel: 'Folded 3mm aluminium',
            projectingSign: {
                panel: { ...base, name: 'blade' },
                mount: { shape: 'square' },
            },
        });
        expect(spec.notes).toContain('Folded 3mm aluminium');
        expect(spec.notes).toContain('with a matching projecting blade sign alongside');
    });

    it('lets an explicit wording override win', () => {
        const spec = visualiserToSignSpec({ ...base, name: 'Whatever' }, 'THE GEORGE');
        expect(spec.text).toBe('THE GEORGE');
    });
});
