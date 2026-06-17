/**
 * Rich works pack from a visualiser design — the "Production pack" button.
 *
 * Splits ONE finished 3D sign into its individual buildable pieces (the
 * aluminium tray, push-through letters, opal backing, face-stuck acrylic, metal
 * faces, stood-off letters, cut/printed vinyl …) and lays each out as its own
 * works-pack section: spec table, the piece's own cut file as a technical
 * drawing, construction callouts, and that piece's REAL department route as the
 * build-stage checklist. An overview section carries the in-situ render, the
 * whole-sign drawing, the overall spec and the assembly order.
 *
 * Pure + framework-neutral (no 'use server'/'use client', no DB, no derivation)
 * — the client assembles the pieces + cut-file data URIs (where the geometry
 * and nest builders already live) and hands them here. Unit-testable.
 */

import {
    genId,
    newVisualBlock,
    newTechnicalBlock,
    newSpecTableBlock,
    newHeadingBlock,
    newCalloutsBlock,
    newQcBlock,
    PackCoverSchema,
    type ProductionPackContent,
    type SignSection,
    type Block,
    type StagesBlock,
} from './types';
import { routeForPiece, assemblySteps, type PieceKind } from './routing';

export interface DesignPieceGroup {
    kind: PieceKind;
    /** Section heading, e.g. "Push-through letters — opal". */
    title: string;
    /** How many physical pieces (letters / panels) — shown on the spec. */
    count: number;
    /** Cut/build thickness, so routing can send thick work to the CNC. */
    thicknessMm?: number;
    /** Painted stood-off / tray work picks up the Painters stage. */
    painted?: boolean;
    specRows: { label: string; value: string }[];
    callouts: string[];
    /** The piece's cut file (SVG/PNG) as a data URI, embedded as a drawing. */
    cutFileDataUri?: string | null;
    /** Whether the cut file is an SVG (vector-sharp + dimensioned). */
    cutFileIsSvg?: boolean;
    cutFileCaption?: string;
}

export interface DesignPackInput {
    name: string;
    clientName?: string | null;
    reference?: string | null;
    /** Whole-sign overall spec (size, material, colour, illumination, fixing). */
    overallSpecRows: { label: string; value: string }[];
    /** In-situ 3D render (PNG data URI) for the hero visual. */
    insituDataUri?: string | null;
    /** Whole-sign artwork drawing (SVG data URI). */
    artworkDataUri?: string | null;
    groups: DesignPieceGroup[];
    /** Link to the LED layout tool, shown when the sign is illuminated. */
    ledToolNote?: string | null;
}

/** A build-stage checklist seeded from a department route (all unchecked). */
function stagesFromRoute(title: string, route: string[]): StagesBlock {
    return {
        id: genId('sg'),
        type: 'stages',
        title,
        stages: route.map((name) => ({ name, instructions: '', done: false })),
    };
}

function specTable(title: string, rows: { label: string; value: string }[]) {
    const block = newSpecTableBlock();
    block.title = title;
    block.rows = rows.length > 0 ? rows : [{ label: '', value: '' }];
    return block;
}

function calloutsBlock(title: string, items: string[]) {
    const block = newCalloutsBlock();
    block.title = title;
    block.items = items.length > 0 ? items : [''];
    return block;
}

function technicalFromDataUri(
    dataUri: string,
    isSvg: boolean,
    caption: string,
) {
    const tech = newTechnicalBlock();
    tech.url = dataUri;
    tech.isSvg = isSvg;
    tech.caption = caption;
    return tech;
}

export function buildPackFromDesignPieces(
    input: DesignPackInput,
): ProductionPackContent {
    const sections: SignSection[] = [];

    // ---- Overview: the whole sign + assembly order -------------------------
    const overview: Block[] = [newVisualBlock()];
    const visual = overview[0];
    if (visual.type === 'visual' && input.insituDataUri) {
        visual.url = input.insituDataUri;
        visual.caption = 'In-situ render';
    }
    if (input.artworkDataUri) {
        overview.push(
            technicalFromDataUri(input.artworkDataUri, true, 'Whole sign — artwork'),
        );
    }
    overview.push(specTable('Sign specification', input.overallSpecRows));
    // A glance-list of every piece this sign breaks into.
    overview.push(
        calloutsBlock(
            'Pieces in this sign',
            input.groups.map((g) =>
                g.count > 1 ? `${g.title} (×${g.count})` : g.title,
            ),
        ),
    );
    // Assembly order — the sequence the pieces come together.
    overview.push(
        stagesFromRoute(
            'Assembly order',
            assemblySteps(input.groups.map((g) => g.kind)),
        ),
    );
    if (input.ledToolNote) {
        overview.push(
            calloutsBlock('Lighting', [input.ledToolNote]),
        );
    }
    overview.push(newQcBlock());

    sections.push({
        id: genId('sec'),
        title: input.name,
        signRef: 'Overview',
        keepWith: [],
        blocks: overview,
    });

    // ---- One section per piece --------------------------------------------
    input.groups.forEach((g, i) => {
        const blocks: Block[] = [newHeadingBlock(g.title)];
        const rows = [...g.specRows];
        if (g.count > 1) rows.push({ label: 'Quantity', value: `${g.count} off` });
        blocks.push(specTable(`${g.title} — specification`, rows));
        if (g.cutFileDataUri) {
            blocks.push(
                technicalFromDataUri(
                    g.cutFileDataUri,
                    g.cutFileIsSvg ?? true,
                    g.cutFileCaption ?? `${g.title} — cut file`,
                ),
            );
        }
        if (g.callouts.length > 0) {
            blocks.push(calloutsBlock('Construction', g.callouts));
        }
        blocks.push(
            stagesFromRoute(
                'Production route',
                routeForPiece(g.kind, {
                    thicknessMm: g.thicknessMm,
                    painted: g.painted,
                }),
            ),
        );
        blocks.push(newQcBlock());

        sections.push({
            id: genId('sec'),
            title: g.title,
            signRef: `Piece ${i + 1}`,
            keepWith: [],
            blocks,
        });
    });

    return {
        cover: PackCoverSchema.parse({
            projectName: input.name,
            clientName: input.clientName ?? '',
            reference: input.reference ?? '',
            subtitle: 'Signage works pack',
        }),
        sections,
        style: 'steel',
    };
}
