import { describe, it, expect } from 'vitest';
import { generateDxf, dxfFilename } from './dxf';
import { buildSectionedExport } from './geometry';
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
    const split = splitPanels(p.panelWidthMm);
    return generateDxf({
        sectionExport: buildSectionedExport(p, split),
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

    it('split signs lay each section out side-by-side, no seam markers', () => {
        const wide = build(params({ panelWidthMm: 4000 }));
        // Sections are physically separate cuts now — no SEAM markers, no
        // "PANEL JOIN" tags.
        expect(wide).not.toContain('PANEL JOIN');
        expect(wide).toContain('3 panel sections');
        // Each section is labelled "SECTION i / N" on the DIMENSIONS layer.
        expect(wide).toContain('SECTION 1 / 3');
        expect(wide).toContain('SECTION 2 / 3');
        expect(wide).toContain('SECTION 3 / 3');

        const single = build(params({ panelWidthMm: 1000 }));
        expect(single).not.toContain('PANEL JOIN');
        expect(single).toContain('Single panel');
        expect(single).not.toContain('SECTION 1 / 1');
    });

    it('emits cuts INSIDE-OUT — perimeter is the last cut layer to appear', () => {
        // Build a single panel; the order of entity emission per section
        // should be aperture/fixings/keyline (none here) → fold lines →
        // perimeter. So the first APERTURE layer reference (if any) comes
        // before the first PANEL_OUTLINE reference, and FOLD_LINES geometry
        // comes before PANEL_OUTLINE geometry.
        const dxf = build(params());
        const firstFold = dxf.indexOf('\nFOLD_LINES\n');
        const firstPerim = dxf.indexOf('\nPANEL_OUTLINE\n');
        // Both layers are also declared in the LAYER table near the top, so
        // skip past that and look in the ENTITIES section.
        const entitiesStart = dxf.indexOf('\nSECTION\n2\nENTITIES\n');
        const foldInEntities = dxf.indexOf('\nFOLD_LINES\n', entitiesStart);
        const perimInEntities = dxf.indexOf(
            '\nPANEL_OUTLINE\n',
            entitiesStart,
        );
        expect(entitiesStart).toBeGreaterThan(0);
        expect(foldInEntities).toBeGreaterThan(0);
        expect(perimInEntities).toBeGreaterThan(0);
        expect(foldInEntities).toBeLessThan(perimInEntities);
        // Sanity that the layer table came first.
        expect(firstFold).toBeLessThan(foldInEntities);
        expect(firstPerim).toBeLessThan(perimInEntities);
    });

    it('filename is filesystem-safe', () => {
        expect(dxfFilename(params())).toBe('Fa-ade-Sign-1000x350-flat.dxf');
    });
});
