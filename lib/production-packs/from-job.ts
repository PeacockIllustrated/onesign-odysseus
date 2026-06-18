/**
 * Scaffold a production (works) pack from an artwork job + its linked
 * visualiser design.
 *
 * Pulls ALL the pieces attached to the job — every artwork component and its
 * sub-items — and lays them out as a starting works pack: an overview section
 * (in-situ render placeholder + the visualiser artwork + the overall spec),
 * then one section per component with its sub-items as a spec table and the
 * standard build-stage + QC checklist. Everything is fully editable afterward
 * (the production pack is a pure block builder).
 *
 * Framework-neutral + pure (no 'use server'/'use client', no DB) so it's
 * unit-testable; the server action feeds it rows it has already fetched.
 */

import {
    genId,
    newVisualBlock,
    newTechnicalBlock,
    newSpecTableBlock,
    newHeadingBlock,
    newCalloutsBlock,
    newStagesBlock,
    newQcBlock,
    PackCoverSchema,
    type ProductionPackContent,
    type SignSection,
    type Block,
} from './types';
import type { PanelParams } from '@/lib/visualiser/types';

export interface JobForPack {
    job_name: string | null;
    job_reference: string | null;
    client_name: string | null;
    panel_size: string | null;
    paint_colour: string | null;
}

export interface SubItemForPack {
    label?: string | null;
    name?: string | null;
    material?: string | null;
    application_method?: string | null;
    finish?: string | null;
    width_mm?: number | null;
    height_mm?: number | null;
    quantity?: number | null;
}

export interface ComponentForPack {
    component_name?: string | null;
    name?: string | null;
    sub_items?: SubItemForPack[] | null;
}

export interface DesignForPack {
    name: string | null;
    svgSource: string | null;
}

/** One sub-item → a "material · method · finish · WxH · ×qty" value line. */
function subItemValue(s: SubItemForPack): string {
    const dims =
        s.width_mm && s.height_mm
            ? `${Math.round(s.width_mm)}×${Math.round(s.height_mm)}mm`
            : null;
    const qty = s.quantity && s.quantity > 1 ? `×${s.quantity}` : null;
    return [s.material, s.application_method, s.finish, dims, qty]
        .filter((p): p is string => !!p)
        .join('  ·  ');
}

export function buildPackFromJob(
    job: JobForPack,
    components: ComponentForPack[],
    design: DesignForPack | null,
): ProductionPackContent {
    const sections: SignSection[] = [];

    // Overview — the whole sign: in-situ render placeholder, the visualiser
    // artwork (as a technical drawing), and the overall spec.
    const overview: Block[] = [newVisualBlock()];
    if (design?.svgSource) {
        const tech = newTechnicalBlock();
        tech.url = `data:image/svg+xml;utf8,${encodeURIComponent(design.svgSource)}`;
        tech.isSvg = true;
        tech.caption = design.name
            ? `Visualiser artwork — ${design.name}`
            : 'Visualiser artwork';
        overview.push(tech);
    }
    const overallSpec = newSpecTableBlock();
    overallSpec.title = 'Sign specification';
    overallSpec.rows = [
        { label: 'Overall size', value: job.panel_size ?? '' },
        { label: 'Paint colour', value: job.paint_colour ?? '' },
        { label: 'Job reference', value: job.job_reference ?? '' },
    ];
    overview.push(overallSpec);
    sections.push({
        id: genId('sec'),
        title: job.job_name ?? 'Sign',
        signRef: 'Sign Ref 1',
        keepWith: [],
        blocks: overview,
    });

    // One section per artwork component — its sub-items as a spec table, plus
    // the standard build-stage + QC checklist.
    components.forEach((c, i) => {
        const compName = c.component_name ?? c.name ?? `Component ${i + 1}`;
        const spec = newSpecTableBlock();
        spec.title = `${compName} — specification`;
        const rows = (c.sub_items ?? []).map((s) => ({
            label: s.label ?? s.name ?? 'Item',
            value: subItemValue(s),
        }));
        spec.rows = rows.length > 0 ? rows : [{ label: '', value: '' }];
        sections.push({
            id: genId('sec'),
            title: compName,
            signRef: `Sign Ref ${i + 2}`,
            keepWith: [],
            blocks: [newHeadingBlock(compName), spec, newStagesBlock(), newQcBlock()],
        });
    });

    return {
        cover: PackCoverSchema.parse({
            projectName: job.job_name ?? '',
            clientName: job.client_name ?? '',
            reference: job.job_reference ?? '',
            subtitle: 'Signage works pack',
        }),
        sections,
        style: 'steel',
    };
}

/** Plain-English note for each non-trivial material group on the sign. */
const MATERIAL_NOTE: Record<string, string> = {
    vinyl: 'Vinyl appliqué',
    acrylic: 'Face-stuck acrylic',
    standoff: 'Stand-off lettering',
    pushthrough: 'Push-through acrylic letters',
    backlight: 'Backlit opal',
};

/**
 * Scaffold a works pack straight from a visualiser design (no artwork job) —
 * one section with the design's artwork as a technical drawing and a spec table
 * derived from the panel params (size, material, colour, illumination), plus
 * material callouts and the build-stage/QC checklist. Used by the "Production
 * pack" button in the visualiser.
 */
export function buildPackFromDesign(
    name: string,
    params: PanelParams,
    svgSource: string | null,
): ProductionPackContent {
    const blocks: Block[] = [newVisualBlock()];

    if (svgSource) {
        const tech = newTechnicalBlock();
        tech.url = `data:image/svg+xml;utf8,${encodeURIComponent(svgSource)}`;
        tech.isSvg = true;
        tech.caption = 'Visualiser artwork';
        blocks.push(tech);
    }

    const spec = newSpecTableBlock();
    spec.title = 'Sign specification';
    spec.rows = [
        {
            label: 'Overall size',
            value: `${Math.round(params.panelWidthMm)} × ${Math.round(params.panelHeightMm)}mm`,
        },
        { label: 'Material', value: params.materialLabel ?? '' },
        { label: 'Panel colour', value: params.panelRal ?? params.panelColor ?? '' },
        {
            label: 'Illumination',
            value: params.illumination?.keyline?.enabled
                ? 'Keyline illuminated'
                : '',
        },
        { label: 'Fixing', value: '' },
    ];
    blocks.push(spec);

    const mats = Array.from(
        new Set((params.materialGroups ?? []).map((g) => g.material)),
    ).filter((m) => m !== 'cut' && m !== 'solid');
    if (mats.length > 0) {
        const callouts = newCalloutsBlock();
        callouts.items = mats.map((m) => MATERIAL_NOTE[m] ?? m);
        blocks.push(callouts);
    }

    blocks.push(newStagesBlock(), newQcBlock());

    return {
        cover: PackCoverSchema.parse({
            projectName: name,
            subtitle: 'Signage works pack',
        }),
        sections: [
            {
                id: genId('sec'),
                title: name,
                signRef: 'Sign Ref 1',
                keepWith: [],
                blocks,
            },
        ],
        style: 'steel',
    };
}
