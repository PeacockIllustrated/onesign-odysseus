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
// PACK STYLE (print theme / orientation)
// =============================================================================

export const PackStyleEnum = z.enum(['steel', 'landscape', 'editorial', 'mono']);
export type PackStyle = z.infer<typeof PackStyleEnum>;

/** Picker metadata for the print styles. Theme colours live in the print route. */
export const PACK_STYLES: Record<
    PackStyle,
    { label: string; orientation: 'portrait' | 'landscape'; blurb: string }
> = {
    steel: { label: 'Steel', orientation: 'portrait', blurb: 'Onesign teal, classic' },
    landscape: { label: 'Landscape', orientation: 'landscape', blurb: 'Wide, footer band' },
    editorial: { label: 'Editorial', orientation: 'portrait', blurb: 'Dark cover, ruled' },
    mono: { label: 'Mono', orientation: 'portrait', blurb: 'Monochrome, minimal' },
};

// =============================================================================
// BLOCKS
// =============================================================================

export const BLOCK_TYPES = [
    'heading',
    'text',
    'image',
    'visual',
    'technical',
    'specTable',
    'callouts',
    'stages',
    'qc',
    'pageBreak',
] as const;
export type BlockType = (typeof BLOCK_TYPES)[number];

/** Label + one-line description shown in the block palette. */
export const BLOCK_META: Record<BlockType, { label: string; description: string }> = {
    visual: { label: 'Visual', description: 'In-situ render or photo of the finished sign' },
    technical: { label: 'Technical drawing', description: 'Dimensioned drawing — upload an SVG to auto-size it' },
    specTable: { label: 'Spec table', description: 'Key facts — size, material, finish, fixing' },
    callouts: { label: 'Material callouts', description: 'Bulleted construction / material notes' },
    text: { label: 'Text / notes', description: 'Free construction specification or notes' },
    stages: { label: 'Build stages', description: 'Stage-by-stage steps with sign-off' },
    qc: { label: 'QC checks', description: 'Office / Factory / Final sign-off boxes' },
    heading: { label: 'Heading', description: 'A sub-heading within the page' },
    image: { label: 'Image', description: 'A plain image' },
    pageBreak: { label: 'Page break', description: 'Force the blocks below onto a new printed page' },
};

/** Block types offered in the palette, in order. Legacy 'image' is excluded. */
export const PALETTE_BLOCKS: BlockType[] = [
    'visual',
    'technical',
    'specTable',
    'callouts',
    'text',
    'stages',
    'qc',
    'heading',
    'pageBreak',
];

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

/** In-situ visual: how the finished sign looks installed. Hero treatment. */
export const VisualBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('visual'),
    url: z.string().default(''),
    caption: z.string().default(''),
    fit: z.enum(['contain', 'cover']).default('cover'),
    height: z.number().int().min(80).max(900).default(340),
});

/**
 * Technical drawing: a dimensioned drawing. Accepts a raster image or an SVG
 * (rendered vector-sharp). When the overall real-world size is known — read
 * from the SVG's mm units or entered as one reference width — the print view
 * draws overall width/height dimension lines around it. `aspect` (w/h) lets the
 * builder derive the missing dimension and keep the drawing undistorted.
 */
export const TechnicalBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('technical'),
    url: z.string().default(''),
    isSvg: z.boolean().default(false),
    aspect: z.number().default(0),
    widthMm: z.number().nullable().default(null),
    heightMm: z.number().nullable().default(null),
    caption: z.string().default(''),
    showDimensions: z.boolean().default(true),
    height: z.number().int().min(80).max(900).default(320),
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

export const PageBreakBlockSchema = z.object({
    id: z.string().min(1),
    type: z.literal('pageBreak'),
});

export const BlockSchema = z.discriminatedUnion('type', [
    HeadingBlockSchema,
    TextBlockSchema,
    ImageBlockSchema,
    VisualBlockSchema,
    TechnicalBlockSchema,
    SpecTableBlockSchema,
    CalloutsBlockSchema,
    StagesBlockSchema,
    QcBlockSchema,
    PageBreakBlockSchema,
]);
export type Block = z.infer<typeof BlockSchema>;
export type HeadingBlock = z.infer<typeof HeadingBlockSchema>;
export type TextBlock = z.infer<typeof TextBlockSchema>;
export type ImageBlock = z.infer<typeof ImageBlockSchema>;
export type VisualBlock = z.infer<typeof VisualBlockSchema>;
export type TechnicalBlock = z.infer<typeof TechnicalBlockSchema>;
export type SpecTableBlock = z.infer<typeof SpecTableBlockSchema>;
export type CalloutsBlock = z.infer<typeof CalloutsBlockSchema>;
export type StagesBlock = z.infer<typeof StagesBlockSchema>;
export type QcBlock = z.infer<typeof QcBlockSchema>;
export type PageBreakBlock = z.infer<typeof PageBreakBlockSchema>;

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
    /**
     * Block ids whose block should stay on the same printed page as the block
     * directly after it ("keep with next"). Consecutive links form a group the
     * print view wraps in a break-inside:avoid container so they don't split.
     */
    keepWith: z.array(z.string()).default([]),
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
    /** uploaded client logo shown on the cover (public URL) */
    logoUrl: z.string().default(''),
    showWordmark: z.boolean().default(true),
});
export type PackCover = z.infer<typeof PackCoverSchema>;

export const ProductionPackContentSchema = z.object({
    // .prefault({}) (Zod 4) parses {} through the schema so every cover field
    // gets its default when a stored document omits `cover`. Plain .default()
    // in Zod 4 takes the OUTPUT type and would demand a fully-formed object.
    cover: PackCoverSchema.prefault({}),
    sections: z.array(SignSectionSchema).default([]),
    /** Print theme — drives the cover/title-block aesthetic + orientation. */
    style: PackStyleEnum.default('steel'),
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
export function newVisualBlock(): VisualBlock {
    return { id: genId('vis'), type: 'visual', url: '', caption: '', fit: 'cover', height: 340 };
}
export function newTechnicalBlock(): TechnicalBlock {
    return {
        id: genId('tech'),
        type: 'technical',
        url: '',
        isSvg: false,
        aspect: 0,
        widthMm: null,
        heightMm: null,
        caption: '',
        showDimensions: true,
        height: 320,
    };
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
export function newPageBreakBlock(): PageBreakBlock {
    return { id: genId('pb'), type: 'pageBreak' };
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
        case 'visual':
            return newVisualBlock();
        case 'technical':
            return newTechnicalBlock();
        case 'specTable':
            return newSpecTableBlock();
        case 'callouts':
            return newCalloutsBlock();
        case 'stages':
            return newStagesBlock();
        case 'qc':
            return newQcBlock();
        case 'pageBreak':
            return newPageBreakBlock();
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
        keepWith: [],
        blocks: [
            newVisualBlock(),
            newTechnicalBlock(),
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
    style: 'steel',
};

/**
 * Coerce a raw JSONB document into a valid ProductionPackContent, falling back
 * to defaults rather than throwing if the stored shape is unexpected.
 */
export function parseContent(raw: unknown): ProductionPackContent {
    const res = ProductionPackContentSchema.safeParse(raw ?? {});
    return res.success ? res.data : DEFAULT_PRODUCTION_PACK_CONTENT;
}
