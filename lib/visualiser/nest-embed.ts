/**
 * Reproduce a saved nest's packed sheets for embedding in the visualiser
 * reference / production PDFs.
 *
 * Browser-only: `importNestSvg` uses DOMParser — fine, because the visualiser
 * PDFs are generated in the browser (jsPDF) too. Prefers the operator's saved
 * layout (`config_json.solution`, persisted by the nester); falls back to a
 * deterministic re-pack only if the nest was created but never opened/saved.
 */

import { importNestSvg } from '@/lib/nesting/svg-import';
import { buildPieces } from '@/lib/nesting/pieces';
import { nestOnce } from '@/lib/nesting/engine';
import { placedPieceRings } from '@/lib/nesting/geom';
import type { NestingDesignRow, Ring } from '@/lib/nesting/types';

export interface EmbeddedNestPiece {
    /** Outer outline + holes, in sheet mm (origin top-left, y-down). */
    rings: Ring[];
}

export interface EmbeddedNestSheet {
    index: number;
    widthMm: number;
    heightMm: number;
    utilisation: number;
    pieceCount: number;
    pieces: EmbeddedNestPiece[];
}

export interface EmbeddedNest {
    name: string;
    sourceKind: string | null;
    sheets: EmbeddedNestSheet[];
    unplacedCount: number;
}

/** Reproduce one nest's sheets, or null if it can't be parsed/has no pieces. */
export function embedNest(row: NestingDesignRow): EmbeddedNest | null {
    try {
        const config = row.config_json.config;
        const imported = importNestSvg(row.svg_source);
        const { pieces } = buildPieces(imported.paths);
        if (pieces.length === 0) return null;

        // The piece ids buildPieces assigns are deterministic from the SVG, so
        // the saved solution's placements re-bind exactly. Re-pack only if no
        // solution was saved.
        const solution = row.config_json.solution ?? nestOnce(pieces, config);
        const pieceById = new Map(pieces.map((p) => [p.id, p]));

        const sheets: EmbeddedNestSheet[] = solution.sheets.map((s) => {
            const placed = solution.placements.filter(
                (pl) => pl.sheetIndex === s.index,
            );
            const sheetPieces: EmbeddedNestPiece[] = [];
            for (const pl of placed) {
                const piece = pieceById.get(pl.pieceId);
                if (!piece) continue;
                const r = placedPieceRings(piece, pl);
                sheetPieces.push({ rings: [r.outer, ...r.holes] });
            }
            return {
                index: s.index,
                widthMm: config.sheetWidthMm,
                heightMm: config.sheetHeightMm,
                utilisation: s.utilisation,
                pieceCount: s.pieceCount,
                pieces: sheetPieces,
            };
        });

        return {
            name: row.name,
            sourceKind: row.source_kind ?? null,
            sheets: sheets.filter((s) => s.pieces.length > 0),
            unplacedCount: solution.unplacedPieceIds.length,
        };
    } catch {
        return null;
    }
}

/** Reproduce every nest, dropping any that can't be parsed or are empty. */
export function embedNests(rows: NestingDesignRow[]): EmbeddedNest[] {
    return rows
        .map(embedNest)
        .filter((n): n is EmbeddedNest => n !== null && n.sheets.length > 0);
}
