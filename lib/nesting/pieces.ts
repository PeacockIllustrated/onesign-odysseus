/**
 * Contours → cut pieces.
 *
 * An outlined letter usually arrives as one compound <path>: the outer
 * contour plus the counters (the islands inside D, R, O…). Nesting needs the
 * opposite grouping to the flat path list: each OUTER contour becomes a
 * piece, and every contour directly inside it travels with it as a hole.
 *
 * The classic even-odd depth rule handles arbitrary nesting: sort rings by
 * area, find each ring's smallest enclosing ring, count ancestors. Even
 * depth = a piece's outer contour; odd depth = a hole belonging to its
 * parent. A ring at depth 2 (an island sitting inside a hole — e.g. the
 * bullet inside a donut) correctly becomes its own piece again.
 *
 * DOM-free and pure; heavily unit-tested.
 */

import {
    normalizeRing,
    ringInsideRing,
    ringsBBox,
    signedArea,
} from './geom';
import type { NestPath, NestPiece, PieceGroup, Ring } from './types';

/** Contours with less material than this are flattening noise — drop them. */
const MIN_RING_AREA_MM2 = 0.5;

export interface BuiltPieces {
    pieces: NestPiece[];
    groups: PieceGroup[];
    warnings: string[];
}

interface RingEntry {
    ring: Ring;
    area: number;
    pathIndex: number;
    parent: number; // index into entries, -1 = top level
    depth: number;
}

export function buildPieces(paths: NestPath[]): BuiltPieces {
    const warnings: string[] = [];

    let openCount = 0;
    let tinyCount = 0;
    const entries: RingEntry[] = [];
    for (let i = 0; i < paths.length; i++) {
        const p = paths[i];
        if (!p.closed) {
            openCount++;
            continue;
        }
        const ring = normalizeRing(p.points);
        if (ring.length < 3) {
            tinyCount++;
            continue;
        }
        const area = Math.abs(signedArea(ring));
        if (area < MIN_RING_AREA_MM2) {
            tinyCount++;
            continue;
        }
        entries.push({ ring, area, pathIndex: i, parent: -1, depth: 0 });
    }
    if (openCount > 0) {
        warnings.push(
            `${openCount} open path${openCount === 1 ? ' was' : 's were'} ignored — only closed outlines can be cut as pieces.`,
        );
    }
    if (tinyCount > 0) {
        warnings.push(
            `${tinyCount} degenerate contour${tinyCount === 1 ? ' was' : 's were'} dropped (under ${MIN_RING_AREA_MM2}mm²).`,
        );
    }

    // Hierarchy: for each ring, its parent is the SMALLEST ring that contains
    // it. Scanning candidates in ascending area order finds that directly.
    const byAreaAsc = entries
        .map((_, idx) => idx)
        .sort((a, b) => entries[a].area - entries[b].area);
    for (let k = 0; k < byAreaAsc.length; k++) {
        const i = byAreaAsc[k];
        for (let m = k + 1; m < byAreaAsc.length; m++) {
            const j = byAreaAsc[m];
            if (ringInsideRing(entries[i].ring, entries[j].ring)) {
                entries[i].parent = j;
                break;
            }
        }
    }
    // Depth via parent chains (parents always have larger area, so chains
    // terminate; memoised walk keeps this linear).
    const depthOf = (idx: number): number => {
        const e = entries[idx];
        if (e.parent === -1) return 0;
        if (e.depth > 0) return e.depth;
        const d = depthOf(e.parent) + 1;
        e.depth = d;
        return d;
    };
    for (let i = 0; i < entries.length; i++) entries[i].depth = depthOf(i);

    // Assemble pieces: even depth = outer, odd depth = hole of its parent.
    const pieceIndexByEntry = new Map<number, number>();
    const pieces: NestPiece[] = [];
    const order = entries
        .map((_, idx) => idx)
        .sort((a, b) => entries[a].pathIndex - entries[b].pathIndex);
    for (const idx of order) {
        const e = entries[idx];
        if (e.depth % 2 !== 0) continue;
        const bb = ringsBBox([e.ring]);
        pieceIndexByEntry.set(idx, pieces.length);
        pieces.push({
            id: `piece-${pieces.length + 1}`,
            label: `Piece ${pieces.length + 1}`,
            groupId: '',
            outer: e.ring,
            holes: [],
            areaMm2: e.area,
            widthMm: bb.maxX - bb.minX,
            heightMm: bb.maxY - bb.minY,
        });
    }
    for (const idx of order) {
        const e = entries[idx];
        if (e.depth % 2 !== 1) continue;
        const parentPiece = pieceIndexByEntry.get(e.parent);
        if (parentPiece === undefined) continue; // unreachable by construction
        pieces[parentPiece].holes.push(e.ring);
        pieces[parentPiece].areaMm2 -= e.area;
    }

    // Grouping for the QoL list. Priority: the SVG group name (Illustrator
    // layer/group), else the source element when one compound path yielded
    // several pieces (an outlined word), else a per-piece singleton.
    const groupKeyOf = (pathIndex: number): { key: string; label: string | null } => {
        const p = paths[pathIndex];
        // Primary: the immediate <g> (a real Illustrator group/section), with
        // its own name as the label when it has one. Then a named ancestor,
        // then the source element (splits an outlined word that's one path).
        if (p.groupKey) return { key: p.groupKey, label: p.groupLabel ?? null };
        if (p.groupLabel) return { key: `g:${p.groupLabel}`, label: p.groupLabel };
        return { key: `src:${p.sourceIndex}`, label: null };
    };
    const groupsByKey = new Map<string, PieceGroup & { autoLabel: boolean }>();
    for (const idx of order) {
        const e = entries[idx];
        const pieceIdx = pieceIndexByEntry.get(idx);
        if (pieceIdx === undefined) continue;
        const { key, label } = groupKeyOf(e.pathIndex);
        let g = groupsByKey.get(key);
        if (!g) {
            g = {
                id: `group-${groupsByKey.size + 1}`,
                label: label ?? '',
                pieceIds: [],
                autoLabel: label === null,
            };
            groupsByKey.set(key, g);
        }
        pieces[pieceIdx].groupId = g.id;
        g.pieceIds.push(pieces[pieceIdx].id);
    }
    // Name the unnamed groups: multi-piece sources read "Shape group N",
    // singletons take their piece's label so the list stays scannable.
    const groups: PieceGroup[] = [];
    let autoN = 0;
    const pieceById = new Map(pieces.map((p) => [p.id, p]));
    for (const g of groupsByKey.values()) {
        if (g.autoLabel) {
            if (g.pieceIds.length > 1) {
                autoN++;
                g.label = `Section ${autoN}`;
            } else {
                g.label = pieceById.get(g.pieceIds[0])?.label ?? 'Piece';
            }
        }
        groups.push({ id: g.id, label: g.label, pieceIds: g.pieceIds });
    }

    return { pieces, groups, warnings };
}

/** Uniformly rescale built pieces (artwork-width calibration). */
export function scalePieces(pieces: NestPiece[], factor: number): NestPiece[] {
    if (factor === 1) return pieces;
    const scaleRing = (r: Ring): Ring => r.map(([x, y]) => [x * factor, y * factor]);
    return pieces.map((p) => ({
        ...p,
        outer: scaleRing(p.outer),
        holes: p.holes.map(scaleRing),
        areaMm2: p.areaMm2 * factor * factor,
        widthMm: p.widthMm * factor,
        heightMm: p.heightMm * factor,
    }));
}
