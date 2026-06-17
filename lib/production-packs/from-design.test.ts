import { describe, it, expect } from 'vitest';
import {
    buildPackFromDesignPieces,
    type DesignPieceGroup,
    type PackDrawing,
} from './from-design';
import { ProductionPackContentSchema } from './types';
import { DEPT } from './routing';

const faceTech: PackDrawing = {
    dataUri: 'data:image/svg+xml;utf8,<svg id="face"/>',
    isSvg: true,
    kind: 'technical',
    caption: 'Whole sign — face',
    widthMm: 2400,
    heightMm: 600,
};

const groups: DesignPieceGroup[] = [
    {
        kind: 'panel',
        title: 'Aluminium tray',
        count: 1,
        painted: true,
        specRows: [{ label: 'Face size', value: '2400 × 600mm' }],
        callouts: ['Folded aluminium tray'],
        drawings: [
            { dataUri: 'data:image/svg+xml;utf8,<svg/>', isSvg: true, kind: 'technical', widthMm: 2400, heightMm: 600 },
        ],
    },
    {
        kind: 'pushthrough',
        title: 'Push-through letters — opal',
        count: 7,
        thicknessMm: 10,
        specRows: [{ label: 'Acrylic', value: 'Opal' }],
        callouts: ['Pressed through the face'],
        drawings: [
            { dataUri: 'data:image/svg+xml;utf8,<svg/>', isSvg: true, kind: 'technical', caption: 'cut file', widthMm: 1800, heightMm: 420 },
        ],
    },
];

function build() {
    return buildPackFromDesignPieces({
        name: 'The Court — Durham',
        clientName: 'The Court',
        reference: 'OSD-2026-000123',
        overallSpecRows: [{ label: 'Overall size', value: '2400 × 600mm' }],
        logoDataUri: 'data:image/svg+xml;utf8,<svg id="logo"/>',
        overviewDrawings: [
            { dataUri: 'data:image/png;base64,AAAA', isSvg: false, kind: 'visual', caption: 'In-situ render' },
            faceTech,
        ],
        groups,
        ledToolNote: 'Build the LED layout…',
    });
}

describe('buildPackFromDesignPieces', () => {
    it('round-trips through the real schema and defaults to the studio template', () => {
        const content = build();
        expect(ProductionPackContentSchema.safeParse(content).success).toBe(true);
        expect(content.style).toBe('studio');
        expect(content.cover.logoUrl).toContain('data:image/svg+xml');
    });

    it('makes an overview section + one section per piece', () => {
        const content = build();
        expect(content.sections).toHaveLength(3);
        expect(content.sections[0].signRef).toBe('Overview');
        expect(content.sections[1].title).toBe('Aluminium tray');
        expect(content.sections[2].title).toBe('Push-through letters — opal');
    });

    it('puts the in-situ render (contained) + face + assembly order on the overview', () => {
        const overview = build().sections[0];
        const visual = overview.blocks.find((b) => b.type === 'visual') as {
            url: string;
            fit: string;
        };
        expect(visual.url).toContain('data:image/png');
        expect(visual.fit).toBe('contain'); // no overflow / real-life look
        const tech = overview.blocks.find((b) => b.type === 'technical') as {
            widthMm: number | null;
            showDimensions: boolean;
        };
        expect(tech.widthMm).toBe(2400);
        expect(tech.showDimensions).toBe(true); // dimensions annotated
        const stages = overview.blocks.find(
            (b) => b.type === 'stages',
        ) as { title: string; stages: { name: string }[] };
        expect(stages.title).toBe('Assembly order');
        expect(stages.stages[0].name).toMatch(/tray/i);
        expect(stages.stages[stages.stages.length - 1].name).toMatch(/goods out/i);
    });

    it('splits each section into a drawings group + an info group (keep-with)', () => {
        const push = build().sections[2];
        // The last block (qc, info) is never kept-with — it terminates the info
        // group; the drawing is its own group.
        const ids = push.blocks.map((b) => b.id);
        expect(push.keepWith).not.toContain(ids[ids.length - 1]);
        // The single drawing is alone in its group, so it isn't kept-with either
        // (nothing after it in its own group) — the info heading starts fresh.
        const tech = push.blocks.find((b) => b.type === 'technical')!;
        expect(push.keepWith).not.toContain(tech.id);
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
