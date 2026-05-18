import { describe, it, expect } from 'vitest';
import { generateDxf, dxfFilename } from './dxf';
import { buildDevelopment } from './geometry';
import { splitPanels } from './split';
import type { PanelParams } from './types';

function params(overrides: Partial<PanelParams> = {}): PanelParams {
    return {
        name: 'Façade × Sign',
        panelWidthMm: 1000,
        panelHeightMm: 350,
        returnDepthMm: 80,
        returns: { top: true, bottom: true, left: true, right: true },
        shadowGapMm: 0,
        keylineMm: 0,
        materialThicknessMm: 5,
        materialLabel: '5mm aluminium — satin',
        ...overrides,
    };
}

function build(p: PanelParams) {
    return generateDxf({
        development: buildDevelopment(p),
        split: splitPanels(p.panelWidthMm),
        params: p,
    });
}

describe('generateDxf — production correctness', () => {
    it('is ASCII-only (no Unicode that R12/CAM readers mangle)', () => {
        // Name + material label deliberately contain ç, ×, — .
        const dxf = build(params());
        // Only printable ASCII plus the newline DXF delimiter.
        expect(/[^\x09\x0A\x0D\x20-\x7E]/.test(dxf)).toBe(false);
        expect(dxf).not.toContain('×');
        expect(dxf).not.toContain('—');
    });

    it('emits ONLY discrete LINE/TEXT entities — no polylines/blocks/splines', () => {
        const dxf = build(params());
        expect(dxf).toContain('\nLINE\n');
        expect(dxf).not.toContain('LWPOLYLINE');
        expect(dxf).not.toContain('\nPOLYLINE\n');
        expect(dxf).not.toContain('\nBLOCK\n');
        expect(dxf).not.toContain('SPLINE');
    });

    it('declares every named layer and is structurally valid', () => {
        const dxf = build(params());
        for (const layer of [
            'PANEL_OUTLINE',
            'FOLD_LINES',
            'APERTURE',
            'KEYLINE',
            'SEAM',
            'DIMENSIONS',
            'NOTES',
        ]) {
            expect(dxf).toContain(`\n${layer}\n`);
        }
        expect(dxf.startsWith('0\nSECTION\n')).toBe(true);
        expect(dxf.trimEnd().endsWith('EOF')).toBe(true);
        expect(dxf).toContain('$INSUNITS');
    });

    it('labels fold lines as DO NOT CUT and centres text properly', () => {
        const dxf = build(params());
        expect(dxf).toContain('DO NOT CUT');
        // Centre + middle justification group codes must be present.
        expect(dxf).toContain('\n72\n1\n');
        expect(dxf).toContain('\n73\n2\n');
    });

    it('tags panel joins when the sign is split', () => {
        const wide = build(params({ panelWidthMm: 4000 }));
        expect(wide).toContain('PANEL JOIN');
        expect(wide).toContain('Split 3 panels');
        const single = build(params({ panelWidthMm: 1000 }));
        expect(single).not.toContain('PANEL JOIN');
        expect(single).toContain('Single panel');
    });

    it('filename is filesystem-safe', () => {
        expect(dxfFilename(params())).toBe('Fa-ade-Sign-1000x350-flat.dxf');
    });
});
