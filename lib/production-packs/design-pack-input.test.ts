import { describe, it, expect } from 'vitest';
import { buildDesignPackInput, type DesignPackPieceData } from './design-pack-input';
import { buildSectionedExport } from '@/lib/visualiser/geometry';
import { splitPanels } from '@/lib/visualiser/split';
import { buildPackFromDesignPieces } from './from-design';
import { ProductionPackContentSchema } from './types';
import type {
    PanelParams,
    MaterialPiece,
    FlatPath,
} from '@/lib/visualiser/types';

function baseParams(overrides: Partial<PanelParams> = {}): PanelParams {
    return {
        name: 'ABS — Test',
        panelWidthMm: 2400,
        panelHeightMm: 400,
        returnDepthMm: 50,
        returns: { top: true, bottom: true, left: true, right: true },
        shadowGapMm: 0,
        keylineMm: 0,
        materialThicknessMm: 5,
        materialLabel: '5mm aluminium',
        panelColor: '#1f6feb',
        ...overrides,
    };
}

/** Minimal derived-piece bundle for a bare tray (no artwork). */
function pieceData(params: PanelParams): DesignPackPieceData {
    const split = splitPanels(params.panelWidthMm);
    const sectionExport = buildSectionedExport(params, split);
    const empty = sectionExport.sections.map(() => [] as FlatPath[]);
    return {
        params,
        sectionExport,
        apertureBySection: empty,
        apertureHolesBySection: empty,
        pushThroughKeylineBySection: empty,
        pushThroughIslandsBySection: empty,
        fixingsBySection: empty,
        cableHolesBySection: empty,
        vinylPieces: [],
        acrylicPieces: [],
        solidPieces: [],
        backlightPieces: [],
        standoffPieces: [],
        pushThroughPieces: [],
        extraFacePieces: [],
        vinylPrintDataUrl: null,
    };
}

/** A simple square backlit aperture, for the illuminated / opal-backing path. */
function squareBacklight(): MaterialPiece {
    const path: FlatPath = {
        closed: true,
        points: [
            [100, 100],
            [300, 100],
            [300, 250],
            [100, 250],
        ],
    };
    return { pathIndex: 0, path, holes: [], color: '#ffffff', glowIntensity: 1 };
}

describe('buildDesignPackInput', () => {
    it('always emits an aluminium tray group + face-size overall spec', () => {
        const params = baseParams();
        const input = buildDesignPackInput(pieceData(params), {
            insituDataUri: null,
            logoDataUri: null,
        });

        expect(input.name).toBe('ABS — Test');
        expect(input.groups[0].kind).toBe('panel');
        expect(input.groups[0].title).toBe('Aluminium tray');
        expect(input.groups[0].drawings.length).toBeGreaterThan(0);
        expect(
            input.overallSpecRows.some(
                (r) => r.label.includes('Face size') && r.value.includes('2400'),
            ),
        ).toBe(true);
        // A bare, non-illuminated tray carries no LED note.
        expect(input.ledToolNote).toBeNull();
    });

    it('uses the stored in-situ image as the overview hero when provided', () => {
        const params = baseParams();
        const input = buildDesignPackInput(pieceData(params), {
            insituDataUri: 'data:image/png;base64,AAAA',
            logoDataUri: null,
        });
        const hero = input.overviewDrawings[0];
        expect(hero.kind).toBe('visual');
        expect(hero.dataUri).toContain('data:image/png');
    });

    it('adds an opal-backing group + LED note for an illuminated sign', () => {
        const params = baseParams();
        const data = pieceData(params);
        data.backlightPieces = [squareBacklight()];
        const input = buildDesignPackInput(data, {
            insituDataUri: null,
            logoDataUri: null,
        });

        expect(input.groups.some((g) => g.kind === 'opalBacking')).toBe(true);
        expect(input.ledToolNote).toMatch(/LED/i);
    });

    it('produces content that round-trips through the real pack schema', () => {
        const params = baseParams();
        const input = buildDesignPackInput(pieceData(params), {
            insituDataUri: null,
            logoDataUri: null,
        });
        const content = buildPackFromDesignPieces(input);
        expect(ProductionPackContentSchema.safeParse(content).success).toBe(true);
    });
});
