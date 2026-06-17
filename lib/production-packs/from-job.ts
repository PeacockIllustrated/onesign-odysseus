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
    newStagesBlock,
    newQcBlock,
    PackCoverSchema,
    type ProductionPackContent,
    type SignSection,
    type Block,
} from './types';

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
