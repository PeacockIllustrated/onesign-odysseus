import { describe, it, expect } from 'vitest';
import { buildPackFromDesignPieces, type DesignPieceGroup } from './from-design';
import { ProductionPackContentSchema } from './types';
import { DEPT } from './routing';

const groups: DesignPieceGroup[] = [
    {
        kind: 'panel',
        title: 'Aluminium tray',
        count: 1,
        painted: true,
        specRows: [{ label: 'Face size', value: '2400 × 600mm' }],
        callouts: ['Folded aluminium tray'],
        cutFileDataUri: null,
    },
    {
        kind: 'pushthrough',
        title: 'Push-through letters — opal',
        count: 7,
        thicknessMm: 10,
        specRows: [{ label: 'Acrylic', value: 'Opal' }],
        callouts: ['Pressed through the face'],
        cutFileDataUri: 'data:image/svg+xml;utf8,<svg/>',
        cutFileCaption: 'Push-through — cut file',
    },
];

function build() {
    return buildPackFromDesignPieces({
        name: 'The Court — Durham',
        clientName: 'The Court',
        reference: 'OSD-2026-000123',
        overallSpecRows: [{ label: 'Overall size', value: '2400 × 600mm' }],
        insituDataUri: 'data:image/png;base64,AAAA',
        artworkDataUri: 'data:image/svg+xml;utf8,<svg id="art"/>',
        groups,
        ledToolNote: 'Build the LED layout…',
    });
}

describe('buildPackFromDesignPieces', () => {
    it('round-trips through the real schema', () => {
        expect(ProductionPackContentSchema.safeParse(build()).success).toBe(true);
    });

    it('makes an overview section + one section per piece', () => {
        const content = build();
        // overview + 2 pieces.
        expect(content.sections).toHaveLength(3);
        expect(content.sections[0].signRef).toBe('Overview');
        expect(content.sections[1].title).toBe('Aluminium tray');
        expect(content.sections[2].title).toBe('Push-through letters — opal');
        expect(content.cover.projectName).toBe('The Court — Durham');
        expect(content.cover.clientName).toBe('The Court');
    });

    it('puts the in-situ render + artwork + assembly order on the overview', () => {
        const overview = build().sections[0];
        const visual = overview.blocks.find((b) => b.type === 'visual');
        expect((visual as { url: string }).url).toContain('data:image/png');
        const tech = overview.blocks.find((b) => b.type === 'technical');
        expect((tech as { url: string }).url).toContain('data:image/svg+xml');
        const stages = overview.blocks.find(
            (b) => b.type === 'stages',
        ) as { title: string; stages: { name: string }[] };
        expect(stages.title).toBe('Assembly order');
        // Tray step first, goods out last.
        expect(stages.stages[0].name).toMatch(/tray/i);
        expect(stages.stages[stages.stages.length - 1].name).toMatch(/goods out/i);
    });

    it("seeds each piece's build stages from its real department route", () => {
        const push = build().sections[2];
        const stages = push.blocks.find((b) => b.type === 'stages') as {
            stages: { name: string }[];
        };
        expect(stages.stages.map((s) => s.name)).toEqual([
            DEPT.cutList,
            DEPT.laser,
            DEPT.plasticFab,
            DEPT.assembly,
        ]);
        // The cut file rides as a technical drawing.
        const tech = push.blocks.find((b) => b.type === 'technical');
        expect(tech).toBeDefined();
        // Quantity is rolled into the spec.
        const spec = push.blocks.find((b) => b.type === 'specTable') as {
            rows: { label: string; value: string }[];
        };
        expect(spec.rows.some((r) => r.value === '7 off')).toBe(true);
    });

    it('lists every piece on the overview "Pieces in this sign" callout', () => {
        const overview = build().sections[0];
        const callout = overview.blocks.find(
            (b) => b.type === 'callouts' && b.title === 'Pieces in this sign',
        ) as { items: string[] };
        expect(callout.items).toContain('Aluminium tray');
        expect(callout.items.some((i) => /Push-through letters.*×7/.test(i))).toBe(
            true,
        );
    });
});
