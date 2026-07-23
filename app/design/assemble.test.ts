import { describe, it, expect } from 'vitest';
import { assembleDesignPayload, describeSign } from './assemble';
import { DEFAULT_PARAMS } from '../(portal)/admin/visualiser/store';
import type { PanelParams } from '@/lib/visualiser/types';

const SQUARE_SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">' +
    '<path d="M10 10 L90 10 L90 90 L10 90 Z"/></svg>';

function params(patch: Partial<PanelParams> = {}): PanelParams {
    return { ...DEFAULT_PARAMS, ...patch };
}

function baseInput(patch: Record<string, unknown> = {}) {
    return {
        activeTab: 'main' as const,
        projectingEnabled: false,
        params: params(),
        svgSource: null,
        imported: null,
        inactive: null,
        mount: {},
        ...patch,
    };
}

describe('describeSign', () => {
    it('plain panel with no artwork reads as a folded aluminium panel', () => {
        expect(describeSign(params(), false)).toBe('Folded aluminium panel');
    });

    it('stand-off default mode reads as stand-off lettering', () => {
        expect(describeSign(params({ apertureMode: 'standoff' }), false)).toBe(
            'Stand-off lettering',
        );
    });

    it('a push-through group wins over the default mode', () => {
        const p = params({
            materialGroups: [
                {
                    id: 'g1',
                    material: 'pushthrough',
                    pathIndices: [0],
                } as NonNullable<PanelParams['materialGroups']>[number],
            ],
        });
        expect(describeSign(p, false)).toBe('Push-through sign');
    });

    it('appends illumination, vinyl and the projecting suffix', () => {
        const p = params({
            apertureMode: 'standoff',
            illumination: {
                keyline: { enabled: true, color: '#fff', intensity: 1 },
            },
            materialGroups: [
                {
                    id: 'g1',
                    material: 'vinyl',
                    pathIndices: [0],
                } as NonNullable<PanelParams['materialGroups']>[number],
            ],
        });
        expect(describeSign(p, true)).toBe(
            'Stand-off lettering · illuminated, vinyl + projecting sign',
        );
    });
});

describe('assembleDesignPayload', () => {
    it('main-only design passes params through with no projecting sign', () => {
        const out = assembleDesignPayload(
            baseInput({ svgSource: SQUARE_SVG }),
        );
        expect(out.params.projectingSign).toBeUndefined();
        expect(out.svgSource).toBe(SQUARE_SVG);
        expect(out.signType).toBe('Folded aluminium panel');
    });

    it('flattens artwork layers into a composed SVG', () => {
        const p = params({
            artworkLayers: [
                {
                    id: 'L1',
                    svgSource: SQUARE_SVG,
                    label: 'Logo',
                    xMm: 100,
                    yMm: 50,
                    scale: 1,
                    wMm: 100,
                    hMm: 100,
                },
            ],
        });
        const out = assembleDesignPayload(baseInput({ params: p }));
        expect(out.svgSource).toContain('<svg');
        // The flattened output is a fresh composition, not the raw upload.
        expect(out.svgSource).not.toBe(SQUARE_SVG);
    });

    it('keeps the built-up fabrication spec on the submitted params', () => {
        const builtUp = {
            finish: 'brass' as const,
            returnDepthMm: 60,
            materialThicknessMm: 1.2,
            breakAngleDeg: 30,
            stockLengthMm: 2400,
            totalReturnLengthMm: 5400,
            weldCount: 12,
            faceCount: 4,
        };
        const out = assembleDesignPayload(
            baseInput({ params: params({ builtUp }) }),
        );
        expect(out.params.builtUp).toEqual(builtUp);
    });

    it('nests the stashed projecting panel when editing the main panel', () => {
        const blade = params({ name: 'Blade', panelWidthMm: 500 });
        const out = assembleDesignPayload(
            baseInput({
                projectingEnabled: true,
                inactive: {
                    params: blade,
                    svgSource: SQUARE_SVG,
                    imported: null,
                },
                mount: { shape: 'circle' as const },
            }),
        );
        expect(out.params.projectingSign).toBeDefined();
        expect(out.params.projectingSign?.panel.name).toBe('Blade');
        expect(out.params.projectingSign?.mount).toEqual({ shape: 'circle' });
        expect(out.params.projectingSign?.svgSource).toBe(SQUARE_SVG);
        // The blade core must not carry its own nested projecting sign.
        expect(
            (out.params.projectingSign?.panel as PanelParams).projectingSign,
        ).toBeUndefined();
        expect(out.signType).toContain('+ projecting sign');
    });

    it('treats the live panel as the blade when the projecting tab is active', () => {
        const fascia = params({ name: 'Fascia' });
        const blade = params({ name: 'Blade' });
        const out = assembleDesignPayload(
            baseInput({
                activeTab: 'projecting' as const,
                projectingEnabled: true,
                params: blade,
                inactive: { params: fascia, svgSource: null, imported: null },
            }),
        );
        expect(out.params.name).toBe('Fascia');
        expect(out.params.projectingSign?.panel.name).toBe('Blade');
    });
});
