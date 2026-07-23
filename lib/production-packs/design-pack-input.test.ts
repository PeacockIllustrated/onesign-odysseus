import { describe, it, expect } from 'vitest';
import {
    buildDesignPackInput,
    appendProjectingSign,
    type DesignPackPieceData,
} from './design-pack-input';
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
        keylineBySection: empty,
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

    it('a global-keyline sign gets an opal backing AND an illuminated-acrylic insert', () => {
        const params = baseParams({
            keylineMm: 3,
            illumination: {
                keyline: { enabled: true, color: '#ffffff', intensity: 1 },
            },
        });
        const data = pieceData(params);
        const ap: FlatPath = {
            closed: true,
            points: [[100, 100], [300, 100], [300, 250], [100, 250]],
        };
        const kl: FlatPath = {
            closed: true,
            points: [[97, 97], [303, 97], [303, 253], [97, 253]],
        };
        data.apertureBySection = data.sectionExport.sections.map((_s, i) =>
            i === 0 ? [ap] : [],
        );
        data.keylineBySection = data.sectionExport.sections.map((_s, i) =>
            i === 0 ? [kl] : [],
        );
        const input = buildDesignPackInput(data, {
            insituDataUri: null,
            logoDataUri: null,
        });
        expect(input.groups.some((g) => g.kind === 'opalBacking')).toBe(true);
        expect(
            input.groups.some((g) => g.title === 'Illuminated acrylic inserts'),
        ).toBe(true);
    });

    it('emits BOTH the aperture insert and the push-through group when a sign has both (disjoint sets, matching the production PDF)', () => {
        const params = baseParams({
            keylineMm: 3,
            illumination: {
                keyline: { enabled: true, color: '#ffffff', intensity: 1 },
            },
        });
        const data = pieceData(params);
        // Global-keyline APERTURE letter (section 0)…
        const ap: FlatPath = {
            closed: true,
            points: [[100, 100], [300, 100], [300, 250], [100, 250]],
        };
        const kl: FlatPath = {
            closed: true,
            points: [[97, 97], [303, 97], [303, 253], [97, 253]],
        };
        data.apertureBySection = data.sectionExport.sections.map((_s, i) =>
            i === 0 ? [ap] : [],
        );
        data.keylineBySection = data.sectionExport.sections.map((_s, i) =>
            i === 0 ? [kl] : [],
        );
        // …AND a SEPARATE explicit push-through piece.
        const pt: FlatPath = {
            closed: true,
            points: [[400, 100], [600, 100], [600, 250], [400, 250]],
        };
        data.pushThroughPieces = [
            {
                pathIndex: 1,
                path: pt,
                holes: [],
                color: '#f5f5f0',
                thicknessMm: 5,
                keylineOffsetMm: 3,
                protrusionMm: 5,
            },
        ];
        const input = buildDesignPackInput(data, {
            insituDataUri: null,
            logoDataUri: null,
        });
        // Both cut pieces exist — the aperture inserts AND the push-through
        // group. They cover disjoint letters, so neither is dropped (the
        // production PDF sums them: insertOuters = apertures + pushThrough).
        expect(
            input.groups.filter(
                (g) => g.title === 'Illuminated acrylic inserts',
            ).length,
        ).toBe(1);
        expect(
            input.groups.some((g) => g.title.startsWith('Push-through letters')),
        ).toBe(true);
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

describe('appendProjectingSign', () => {
    const main = buildDesignPackInput(pieceData(baseParams()), {
        insituDataUri: 'data:image/png;base64,AAAA',
        logoDataUri: null,
    });
    const projData = pieceData(
        baseParams({ name: 'ABS — Blade', panelWidthMm: 600 }),
    );
    // Give the blade a lit piece so it has a whole-sign face to merge.
    projData.backlightPieces = [squareBacklight()];
    const proj = buildDesignPackInput(projData, {
        insituDataUri: null,
        logoDataUri: null,
    });
    const merged = appendProjectingSign(main, proj);

    it('appends the projecting sign as its own prefixed pack sections', () => {
        // Every fascia group survives…
        for (const g of main.groups) {
            expect(merged.groups.some((m) => m.title === g.title)).toBe(true);
        }
        // …and the projecting sign's pieces are added, clearly labelled.
        expect(merged.groups.length).toBe(main.groups.length + proj.groups.length);
        expect(
            merged.groups.some((g) => g.title.startsWith('Projecting sign · ')),
        ).toBe(true);
    });

    it('adds the projecting face to the overview but keeps one in-situ render', () => {
        const visuals = merged.overviewDrawings.filter((d) => d.kind === 'visual');
        expect(visuals).toHaveLength(1); // single in-situ (the fascia's)
        expect(
            merged.overviewDrawings.some(
                (d) => d.caption === 'Projecting sign — face',
            ),
        ).toBe(true);
    });

    it('keeps the fascia cover, name + overall spec', () => {
        expect(merged.name).toBe(main.name);
        expect(merged.overallSpecRows).toEqual(main.overallSpecRows);
    });

    it('still round-trips through the real pack schema', () => {
        const content = buildPackFromDesignPieces(merged);
        expect(ProductionPackContentSchema.safeParse(content).success).toBe(true);
    });
});
