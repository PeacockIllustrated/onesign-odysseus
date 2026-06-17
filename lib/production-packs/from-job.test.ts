import { describe, it, expect } from 'vitest';
import { buildPackFromJob, buildPackFromDesign } from './from-job';
import { ProductionPackContentSchema } from './types';
import type { PanelParams } from '@/lib/visualiser/types';

const job = {
    job_name: 'Black Rabbit — The Warren',
    job_reference: 'AWC-2026-000123',
    client_name: 'Black Rabbit',
    panel_size: '2400 × 600mm',
    paint_colour: 'RAL 9005',
};

const components = [
    {
        component_name: 'Fascia letters',
        sub_items: [
            {
                label: 'Letter set',
                material: 'Opal acrylic',
                application_method: 'Push-through',
                finish: 'Brass faced',
                width_mm: 1800,
                height_mm: 420,
                quantity: 1,
            },
        ],
    },
    { component_name: 'Projecting blade', sub_items: [] },
];

describe('buildPackFromJob', () => {
    it('produces a valid production-pack document', () => {
        const content = buildPackFromJob(job, components, {
            name: 'Warren sign',
            svgSource: '<svg><path d="M0 0 L10 0 L10 10 Z"/></svg>',
        });
        // The whole thing round-trips through the real schema.
        expect(ProductionPackContentSchema.safeParse(content).success).toBe(true);
    });

    it('makes an overview section + one section per component', () => {
        const content = buildPackFromJob(job, components, null);
        // overview + 2 components.
        expect(content.sections).toHaveLength(3);
        expect(content.sections[0].title).toBe('Black Rabbit — The Warren');
        expect(content.sections[1].title).toBe('Fascia letters');
        expect(content.sections[2].title).toBe('Projecting blade');
        // Cover carries the job's identity.
        expect(content.cover.projectName).toBe('Black Rabbit — The Warren');
        expect(content.cover.clientName).toBe('Black Rabbit');
        expect(content.cover.reference).toBe('AWC-2026-000123');
    });

    it('embeds the linked design SVG as a technical drawing in the overview', () => {
        const content = buildPackFromJob(job, components, {
            name: 'Warren sign',
            svgSource: '<svg id="art"/>',
        });
        const tech = content.sections[0].blocks.find((b) => b.type === 'technical');
        expect(tech).toBeDefined();
        expect((tech as { url: string }).url).toContain('data:image/svg+xml');
        expect((tech as { isSvg: boolean }).isSvg).toBe(true);
        // No design → no technical block.
        const noDesign = buildPackFromJob(job, components, null);
        expect(noDesign.sections[0].blocks.some((b) => b.type === 'technical')).toBe(false);
    });

    it("rolls a component's sub-items into a spec table", () => {
        const content = buildPackFromJob(job, components, null);
        const spec = content.sections[1].blocks.find((b) => b.type === 'specTable');
        expect(spec).toBeDefined();
        const rows = (spec as { rows: Array<{ label: string; value: string }> }).rows;
        expect(rows[0].label).toBe('Letter set');
        expect(rows[0].value).toContain('Opal acrylic');
        expect(rows[0].value).toContain('Push-through');
        expect(rows[0].value).toContain('1800×420mm');
    });
});

describe('buildPackFromDesign', () => {
    const params = {
        panelWidthMm: 2400,
        panelHeightMm: 600,
        materialLabel: 'Folded aluminium',
        panelRal: 'RAL 9005',
        illumination: { keyline: { enabled: true, color: '#ffffff' } },
        materialGroups: [
            { id: 'g', material: 'pushthrough', color: '#ffffff', pathIndices: [0] },
        ],
    } as unknown as PanelParams;

    it('scaffolds a valid one-section pack from a design', () => {
        const content = buildPackFromDesign('Warren fascia', params, '<svg/>');
        expect(ProductionPackContentSchema.safeParse(content).success).toBe(true);
        expect(content.sections).toHaveLength(1);
        expect(content.cover.projectName).toBe('Warren fascia');
    });

    it('derives the spec + material callouts from the panel params', () => {
        const content = buildPackFromDesign('Warren fascia', params, '<svg/>');
        const blocks = content.sections[0].blocks;
        const spec = blocks.find((b) => b.type === 'specTable') as {
            rows: Array<{ label: string; value: string }>;
        };
        expect(spec.rows.find((r) => r.label === 'Overall size')?.value).toContain(
            '2400',
        );
        expect(spec.rows.find((r) => r.label === 'Illumination')?.value).toBe(
            'Keyline illuminated',
        );
        const callouts = blocks.find((b) => b.type === 'callouts') as {
            items: string[];
        };
        expect(callouts.items).toContain('Push-through acrylic letters');
    });
});
