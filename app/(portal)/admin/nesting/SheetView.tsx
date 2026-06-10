'use client';

/**
 * One nested sheet, rendered as plain SVG at true aspect ratio. Pieces are
 * drawn with even-odd fill so counters read as holes; hovering a piece (or
 * a group in the list) outlines every related piece in the brand accent
 * and fades the rest — the "where did my letters go" QoL feature.
 */

import { useMemo } from 'react';
import { placedPieceRings, ringsToPathData } from '@/lib/nesting/geom';
import type { NestConfig, NestPiece, Placement } from '@/lib/nesting/types';

const ACCENT = '#4e7e8c';
const INK = '#1a1f23';

export function SheetView({
    pieces,
    placements,
    config,
    highlight,
    onHoverPiece,
}: {
    pieces: NestPiece[];
    /** Placements for THIS sheet only. */
    placements: Placement[];
    config: NestConfig;
    /** Piece ids to outline; empty set = nothing hovered. */
    highlight: Set<string>;
    onHoverPiece: (pieceId: string | null) => void;
}) {
    const W = config.sheetWidthMm;
    const H = config.sheetHeightMm;
    const pieceById = useMemo(
        () => new Map(pieces.map((p) => [p.id, p])),
        [pieces],
    );
    const rendered = useMemo(
        () =>
            placements
                .map((pl) => {
                    const piece = pieceById.get(pl.pieceId);
                    if (!piece) return null;
                    const rings = placedPieceRings(piece, pl);
                    return {
                        id: piece.id,
                        label: piece.label,
                        d: ringsToPathData([rings.outer, ...rings.holes], 2),
                    };
                })
                .filter((r): r is NonNullable<typeof r> => r !== null),
        [placements, pieceById],
    );
    const anyHover = highlight.size > 0;

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full rounded-md border border-neutral-300 bg-white shadow-sm"
            onMouseLeave={() => onHoverPiece(null)}
        >
            {/* Margin keep-out guide. */}
            <rect
                x={config.marginMm}
                y={config.marginMm}
                width={Math.max(0, W - 2 * config.marginMm)}
                height={Math.max(0, H - 2 * config.marginMm)}
                fill="none"
                stroke="#d4d4d4"
                strokeWidth={1}
                strokeDasharray="6 6"
                vectorEffect="non-scaling-stroke"
            />
            {rendered.map((r) => {
                const hot = highlight.has(r.id);
                return (
                    <path
                        key={r.id}
                        d={r.d}
                        fillRule="evenodd"
                        fill={hot ? ACCENT : INK}
                        opacity={anyHover && !hot ? 0.22 : 1}
                        stroke={hot ? ACCENT : 'none'}
                        strokeWidth={hot ? 3 : 0}
                        vectorEffect="non-scaling-stroke"
                        onMouseEnter={() => onHoverPiece(r.id)}
                    >
                        <title>{r.label}</title>
                    </path>
                );
            })}
        </svg>
    );
}

/**
 * Pre-nest preview: the artwork exactly as imported (pieces in their
 * original positions) so the operator can sanity-check the split + hover
 * the list before running the nest.
 */
export function ArtworkPreview({
    pieces,
    highlight,
    onHoverPiece,
}: {
    pieces: NestPiece[];
    highlight: Set<string>;
    onHoverPiece: (pieceId: string | null) => void;
}) {
    const view = useMemo(() => {
        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;
        for (const p of pieces) {
            for (const [x, y] of p.outer) {
                if (x < minX) minX = x;
                if (y < minY) minY = y;
                if (x > maxX) maxX = x;
                if (y > maxY) maxY = y;
            }
        }
        if (!Number.isFinite(minX)) return '0 0 100 100';
        const pad = Math.max(maxX - minX, maxY - minY) * 0.03 + 1;
        return `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;
    }, [pieces]);
    const rendered = useMemo(
        () =>
            pieces.map((p) => ({
                id: p.id,
                label: p.label,
                d: ringsToPathData([p.outer, ...p.holes], 2),
            })),
        [pieces],
    );
    const anyHover = highlight.size > 0;

    return (
        <svg
            viewBox={view}
            className="block h-auto w-full rounded-md border border-neutral-300 bg-neutral-50"
            onMouseLeave={() => onHoverPiece(null)}
        >
            {rendered.map((r) => {
                const hot = highlight.has(r.id);
                return (
                    <path
                        key={r.id}
                        d={r.d}
                        fillRule="evenodd"
                        fill={hot ? ACCENT : INK}
                        opacity={anyHover && !hot ? 0.22 : 1}
                        stroke={hot ? ACCENT : 'none'}
                        strokeWidth={hot ? 3 : 0}
                        vectorEffect="non-scaling-stroke"
                        onMouseEnter={() => onHoverPiece(r.id)}
                    >
                        <title>{r.label}</title>
                    </path>
                );
            })}
        </svg>
    );
}
