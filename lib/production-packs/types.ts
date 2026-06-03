/**
 * Types + Zod schemas for the Production Pack builder.
 *
 * A production pack is a designer-authored internal WORKS document: a cover
 * page plus one section per sign, where each section is an ordered stack of
 * content blocks (headings, notes, images, spec tables, material callouts,
 * a build-stage checklist, QC checks). The whole document lives in
 * production_packs.content (JSONB) — see migration 061.
 *
 * This module is framework-neutral (no 'use server'/'use client') so it can be
 * imported by both the server actions and the client builder.
 */

import { z } from 'zod';

// =============================================================================
// IDS
// =============================================================================

/** Stable-ish unique id for blocks/sections. Works in both browser and node. */
export function genId(prefix: string): string {
    const rnd = globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
    return `${prefix}_${rnd}`;
}

// =============================================================================
// STATUS
// =============================================================================

export const ProductionPackStatusEnum = z.enum(['draft', 'ready', 'archived']);
export type ProductionPackStatus = z.infer<typeof ProductionPackStatusEnum>;

// =============================================================================
// BLOCKS
// =============================================================================

export const BLOCK_TYPES = [
    'heading',
    'text',
    'image',
    'specTable',
    'callouts',
    'stages',
    'qc',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

export const BLOCK_LABELS: Record<BlockType, string> = {
    heading: 'Heading',
    text: 'Text / notes',
    image: 'Image',
    specTable: 'Spec table',
    callouts: 'Material callouts',
    stages: 'Build stages',
    qc: 'QC checks',
};

export const HeadingBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('heading'),
    text: z.string().default(''),
});

export const TextBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('text'),
    title: z.string().default(''),
    body: z.string().default(''),
});

export const ImageBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('image'),
    url: z.string().default(''),
    caption: z.string().default(''),
    fit: z.enum(['contain', 'cover']).default('contain'),
    /** Render height on the printed page, in px (≈ mm at 96dpi screens). */
    height: z.number().int().min(80).max(900).default(300),
});

export const SpecRowSchema = z.object({
    label: z.string().default(''),
    value: z.string().default(''),
});

export const SpecTableBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('specTable'),
    title: z.string().default('Specification'),
    rows: z.array(SpecRowSchema).default([]),
});

export const CalloutsBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('callouts'),
    title: z.string().default('Materials & construction'),
    items: z.array(z.string()).default([]),
});

export const BuildStageSchema = z.object({
    name: z.string().default(''),
    instructions: z.string().default(''),
    done: z.boolean().default(false),
});

export const StagesBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('stages'),
    title: z.string().default('Build stages'),
    stages: z.array(BuildStageSchema).default([]),
});

export const QcCheckSchema = z.object({
    label: z.string().default(''),
    done: z.boolean().default(false),
});

export const QcBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('qc'),
    title: z.string().default('Quality control'),
    checks: z.array(QcCheckSchema).default([]),
});

export const BlockSchema = z.discriminatedUnion('type', [
    HeadingBlockSchema,
    TextBlockSchema,
    ImageBlockSchema,
    SpecTableBlockSchema,
    CalloutsBlockSchema,
    StagesBlockSchema,
    QcBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type SpecTableBlock = z.infer<typeof SpecTableBlockSchema>;
export type CalloutsBlock = z.infer<typeof CalloutsBlockSchema>;
export type StagesBlock = z.infer<typeof StagesBlockSchema>;
export type QcBlock = z.infer<typeof QcBlockSchema>;

// =============================================================================
// SECTIONS + COVER + DOCUMENT
// =============================================================================

export const SignSectionSchema = z.object({
    id: z.string().min(1),
    /** e.g. "Fascia sign" */
    title: z.string().default('Untitled sign'),
    /** e.g. "Sign Ref 1" — printed as the page tag */
    signRef: z.string().default(''),
    blocks: z.array(BlockSchema).default([]),
});
export type SignSection = z.infer<typeof SignSectionSchema>;

export const PackCoverSchema = z.object({
    projectName: z.string().default(''),
    clientName: z.string().default(''),
    /** strapline under the wordmark, e.g. "Signage works pack" */
    subtitle: z.string().default('Signage works pack'),
    siteAddress: z.string().default(''),
    /** free-text works/job reference shown in the title block */
    reference: z.string().default(''),
    revision: z.string().default(''),
    drawnBy: z.string().default(''),
    checkedBy: z.string().default(''),
    /** free-text or ISO date; printed as-is */
    date: z.string().default(''),
    showWordmark: z.boolean().default(true),
});
export type PackCover = z.infer<typeof PackCoverSchema>;

export const ProductionPackContentSchema = z.object({
    // .prefault({}) (Zod 4) parses {} through the schema so every cover field
    // gets its default when a stored document omits `cover`. Plain .default()
    // in Zod 4 takes the OUTPUT type and would demand a fully-formed object.
    cover: PackCoverSchema.prefault({}),
    sections: z.array(SignSectionSchema).default([]),
});
export type ProductionPackContent = z.infer<typeof ProductionPackContentSchema>;

/** Full database row (timestamps kept loose — rows are cast, never parsed). */
export const ProductionPackSchema = z.object({
    id: z.string(),
    title: z.string(),
    status: ProductionPackStatusEnum,
    client_name: z.string().nullable(),
    project_name: z.string().nullable(),
    content: ProductionPackContentSchema,
    linked_quote_id: z.string().nullable(),
    linked_artwork_job_id: z.string().nullable(),
    linked_production_job_id: z.string().nullable(),
    created_by: z.string().nullable(),
    created_at: z.string(),
    updated_at: z.string(),
});
export type ProductionPack = z.infer<typeof ProductionPackSchema>;

// =============================================================================
// INPUT SCHEMAS (server actions safeParse these)
// =============================================================================

export const CreateProductionPackInputSchema = z.object({
    title: z.string().trim().min(1).max(200).default('Untitled production pack'),
});
export type CreateProductionPackInput = z.infer<typeof CreateProductionPackInputSchema>;

export const UpdatePackMetaInputSchema = z.object({
    title: z.string().trim().min(1).max(200).optional(),
    status: ProductionPackStatusEnum.optional(),
    client_name: z.string().nullable().optional(),
    project_name: z.string().nullable().optional(),
});
export type UpdatePackMetaInput = z.infer<typeof UpdatePackMetaInputSchema>;

// =============================================================================
// DEFAULTS + FACTORIES
// =============================================================================

/**
 * Default build stages seeded onto a new sign. These mirror the real Onesign
 * departments (migration 028) trimmed to a sensible works-pack default — every
 * one is fully editable/removable per pack (the user chose an editable checklist
 * over auto-derived routing).
 */
export const DEFAULT_BUILD_STAGES = [
    'Cut',
    'Fabrication',
    'Paint',
    'Lighting',
    'Vinyl',
    'Assembly',
    'Goods out',
] as const;

/** QC gates, echoing the competitor pack Chris liked (Office / Factory / Final). */
export const DEFAULT_QC_CHECKS = ['Office check', 'Factory check', 'Final check'] as const;

export function newHeadingBlock(text = ''): HeadingBlock {
    return { id: genId('h'), type: 'heading', text };
}
export function newTextBlock(title = '', body = ''): TextBlock {
    return { id: genId('t'), type: 'text', title, body };
}
export function newImageBlock(): ImageBlock {
    return { id: genId('img'), type: 'image', url: '', caption: '', fit: 'contain', height: 300 };
}
export function newSpecTableBlock(): SpecTableBlock {
    return {
        id: genId('st'),
        type: 'specTable',
        title: 'Specification',
        rows: [
            { label: 'Overall size', value: '' },
            { label: 'Material', value: '' },
            { label: 'Finish', value: '' },
            { label: 'Illumination', value: '' },
            { label: 'Fixing', value: '' },
        ],
    };
}
export function newCalloutsBlock(): CalloutsBlock {
    return { id: genId('c'), type: 'callouts', title: 'Materials & construction', items: [''] };
}
export function newStagesBlock(): StagesBlock {
    return {
        id: genId('sg'),
        type: 'stages',
        title: 'Build stages',
        stages: DEFAULT_BUILD_STAGES.map((name) => ({ name, instructions: '', done: false })),
    };
}
export function newQcBlock(): QcBlock {
    return {
        id: genId('qc'),
        type: 'qc',
        title: 'Quality control',
        checks: DEFAULT_QC_CHECKS.map((label) => ({ label, done: false })),
    };
}

/** Build a fresh block of the requested type with sensible empty defaults. */
export function newBlock(type: BlockType): Block {
    switch (type) {
        case 'heading':
            return newHeadingBlock();
        case 'text':
            return newTextBlock();
        case 'image':
            return newImageBlock();
        case 'specTable':
            return newSpecTableBlock();
        case 'callouts':
            return newCalloutsBlock();
        case 'stages':
            return newStagesBlock();
        case 'qc':
            return newQcBlock();
    }
}

/**
 * A new sign section, pre-seeded with the standard works-pack block stack so a
 * designer fills specifics rather than building the layout from nothing. This
 * is a sensible starting point, NOT a job-type template — every block can be
 * removed/reordered (the user chose a pure block builder).
 */
export function newSection(index: number): SignSection {
    return {
        id: genId('sec'),
        title: `Sign ${index}`,
        signRef: `Sign Ref ${index}`,
        blocks: [
            newHeadingBlock(''),
            newImageBlock(),
            newSpecTableBlock(),
            newCalloutsBlock(),
            newTextBlock('Construction specification', ''),
            newStagesBlock(),
            newQcBlock(),
        ],
    };
}

export const DEFAULT_PRODUCTION_PACK_CONTENT: ProductionPackContent = {
    cover: PackCoverSchema.parse({}),
    sections: [],
};

/**
 * Coerce a raw JSONB document into a valid ProductionPackContent, falling back
 * to defaults rather than throwing if the stored shape is unexpected.
 */
export function parseContent(raw: unknown): ProductionPackContent {
    const res = ProductionPackContentSchema.safeParse(raw ?? {});
    return res.success ? res.data : DEFAULT_PRODUCTION_PACK_CONTENT;
}
