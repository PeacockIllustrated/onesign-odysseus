/**
 * Rich works pack from a visualiser design — the "Production pack" button.
 *
 * Splits ONE finished 3D sign into its individual buildable pieces (the
 * aluminium tray, push-through letters, opal backing, face-stuck acrylic, metal
 * faces, stood-off letters, cut/printed vinyl …) and lays each out as its own
 * works-pack section: the piece's drawings (filled material-colour artwork +
 * its nested cut file) full-width with the spec, construction callouts and that
 * piece's REAL department route underneath. An overview section carries the
 * clean in-situ render, the whole-sign face, the overall spec and the assembly
 * order. Renders on the landscape "studio" drawing-sheet template.
 *
 * Pure + framework-neutral (no 'use server'/'use client', no DB, no derivation)
 * — the client assembles the pieces + drawing data URIs (where the geometry,
 * nest + display builders live) and hands them here. Unit-testable.
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

/** One drawing on a piece/overview — a filled face, a nested cut file or the
 *  in-situ 3D render. Dimensions drive the print view's dimension lines. */
export interface PackDrawing {
    dataUri: string;
    isSvg: boolean;
    kind?: 'visual' | 'technical';
    caption?: string;
    widthMm?: number | null;
    heightMm?: number | null;
    /** Print render height in px — hero drawings get more scale. */
    heightPx?: number;
}

export interface DesignPieceGroup {
    kind: PieceKind;
    title: string;
    count: number;
    thicknessMm?: number;
    painted?: boolean;
    specRows: { label: string; value: string }[];
    callouts: string[];
    drawings: PackDrawing[];
}

export interface DesignPackInput {
    name: string;
    clientName?: string | null;
    reference?: string | null;
    overallSpecRows: { label: string; value: string }[];
    /** Client logo (data URI) for the cover header, from the binder library. */
    logoDataUri?: string | null;
    /** In-situ render + whole-sign face for the overview hero. */
    overviewDrawings: PackDrawing[];
    groups: DesignPieceGroup[];
    /** Link to the LED layout tool, shown when the sign is illuminated. */
    ledToolNote?: string | null;
}

// Sized so a full-width drawing + its details fit a landscape A4 sheet. Signs
// are wide, so a contain-fit at this height still reads large across the page.
const HERO_HEIGHT_PX = 300;
const PIECE_HEIGHT_PX = 320;

function stagesFromRoute(title: string, route: string[]): StagesBlock {
    return {
        id: genId('sg'),
        type: 'stages',
        title,
        stages: route.map((name) => ({ name, instructions: '', done: false })),
    };
}

function specTable(title: string, rows: { label: string; value: string }[]): Block {
    const block = newSpecTableBlock();
    block.title = title;
    block.rows = rows.length > 0 ? rows : [{ label: '', value: '' }];
    return block;
}

function calloutsBlock(title: string, items: string[]): Block {
    const block = newCalloutsBlock();
    block.title = title;
    block.items = items.length > 0 ? items : [''];
    return block;
}

/** A drawing → a visual (in-situ photo) or technical (dimensioned) block. */
function drawingBlock(d: PackDrawing, fallbackHeight: number): Block {
    if (d.kind === 'visual') {
        const v = newVisualBlock();
        v.url = d.dataUri;
        v.caption = d.caption ?? '';
        // Contained so the real-life render never crops / overflows its frame.
        v.fit = 'contain';
        v.height = d.heightPx ?? fallbackHeight;
        return v;
    }
    const tech = newTechnicalBlock();
    tech.url = d.dataUri;
    tech.isSvg = d.isSvg;
    tech.caption = d.caption ?? '';
    tech.widthMm = d.widthMm ?? null;
    tech.heightMm = d.heightMm ?? null;
    tech.showDimensions = d.widthMm != null;
    tech.height = d.heightPx ?? fallbackHeight;
    return tech;
}

/**
 * Overview hero: TWO keep-with groups — the drawings (full-width on the studio
 * stage) and the info underneath (full-width). The studio sheet collapses a
 * single-kind group to the full page width, so the in-situ render + whole-sign
 * face get maximum scale with the details beneath them. Only the overview uses
 * this; piece pages keep the standard side-by-side studio layout.
 */
function heroSection(
    title: string,
    signRef: string,
    drawings: Block[],
    info: Block[],
): SignSection {
    const blocks = [...drawings, ...info];
    const keepWith: string[] = [];
    drawings.slice(0, -1).forEach((b) => keepWith.push(b.id));
    info.slice(0, -1).forEach((b) => keepWith.push(b.id));
    return { id: genId('sec'), title, signRef, keepWith, blocks };
}

/**
 * A piece page in the ORIGINAL studio layout: the spec/route info in the left
 * rail beside its drawings on the stage — one keep-with group so the whole
 * piece stays together on its page.
 */
function pieceSection(
    title: string,
    signRef: string,
    drawings: Block[],
    info: Block[],
): SignSection {
    const blocks = [...info, ...drawings];
    const keepWith = blocks.slice(0, -1).map((b) => b.id);
    return { id: genId('sec'), title, signRef, keepWith, blocks };
}

export function buildPackFromDesignPieces(
    input: DesignPackInput,
): ProductionPackContent {
    const sections: SignSection[] = [];

    // ---- Overview: the whole sign + assembly order -------------------------
    const overviewDrawings: Block[] =
        input.overviewDrawings.length > 0
            ? input.overviewDrawings.map((d) => drawingBlock(d, HERO_HEIGHT_PX))
            : [newVisualBlock()];

    const overviewInfo: Block[] = [
        specTable('Sign specification', input.overallSpecRows),
        calloutsBlock(
            'Pieces in this sign',
            input.groups.map((g) =>
                g.count > 1 ? `${g.title} (×${g.count})` : g.title,
            ),
        ),
        stagesFromRoute(
            'Assembly order',
            assemblySteps(input.groups.map((g) => g.kind)),
        ),
    ];
    if (input.ledToolNote) {
        overviewInfo.push(calloutsBlock('Lighting', [input.ledToolNote]));
    }
    overviewInfo.push(newQcBlock());

    sections.push(
        heroSection(input.name, 'Overview', overviewDrawings, overviewInfo),
    );

    // ---- One section per piece --------------------------------------------
    input.groups.forEach((g, i) => {
        const drawings: Block[] = g.drawings.map((d) =>
            drawingBlock(d, PIECE_HEIGHT_PX),
        );

        const rows = [...g.specRows];
        if (g.count > 1) rows.push({ label: 'Quantity', value: `${g.count} off` });
        const info: Block[] = [
            newHeadingBlock(g.title),
            specTable(`${g.title} — specification`, rows),
        ];
        if (g.callouts.length > 0) {
            info.push(calloutsBlock('Construction', g.callouts));
        }
        info.push(
            stagesFromRoute(
                'Production route',
                routeForPiece(g.kind, {
                    thicknessMm: g.thicknessMm,
                    painted: g.painted,
                }),
            ),
        );
        info.push(newQcBlock());

        sections.push(pieceSection(g.title, `Piece ${i + 1}`, drawings, info));
    });

    return {
        cover: PackCoverSchema.parse({
            projectName: input.name,
            clientName: input.clientName ?? '',
            reference: input.reference ?? '',
            subtitle: 'Signage works pack',
            logoUrl: input.logoDataUri ?? '',
        }),
        sections,
        style: 'studio',
    };
}
