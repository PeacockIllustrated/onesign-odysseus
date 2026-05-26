'use client';

import { useMemo, useRef } from 'react';
import type {
    PanelDevelopment,
    PanelSplit,
    FlatPath,
    MaterialPiece,
} from '@/lib/visualiser/types';

const DEFAULT_PANEL_COLOR = '#d6d6d6';

function pathD(p: FlatPath): string {
    if (p.points.length === 0) return '';
    const [first, ...rest] = p.points;
    return (
        `M ${first[0]} ${first[1]} ` +
        rest.map(([x, y]) => `L ${x} ${y}`).join(' ') +
        (p.closed ? ' Z' : '')
    );
}

export function FlatPreview({
    development: dev,
    split,
    aperture,
    keyline,
    fixings = [],
    reference = [],
    vinylPieces = [],
    acrylicPieces = [],
    placedPathsByIndex = null,
    pathGroupColors = null,
    pendingPaths,
    isEditingGroup = false,
    onPathToggle,
    panelColor = DEFAULT_PANEL_COLOR,
    fixingMode = 'off',
    onFixingClick,
}: {
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    fixings?: FlatPath[];
    reference?: FlatPath[];
    vinylPieces?: MaterialPiece[];
    acrylicPieces?: MaterialPiece[];
    /**
     * Per-original-path placed+clipped data — one entry per imported
     * path, null if it was clipped away. Drives the click overlays and
     * group highlights.
     */
    placedPathsByIndex?: Array<FlatPath | null> | null;
    /**
     * Highlight colour per imported path (group's palette colour) or
     * null if the path isn't in any group.
     */
    pathGroupColors?: Array<string | null> | null;
    /** Paths in the active group-edit selection (multi-select). */
    pendingPaths?: Set<number>;
    /** True when the operator is editing a material group. */
    isEditingGroup?: boolean;
    /** Click handler — called with the path index. Only in edit mode. */
    onPathToggle?: (index: number) => void;
    panelColor?: string;
    fixingMode?: 'off' | 'place' | 'delete';
    /** Called with the click point in flat-development mm coords. */
    onFixingClick?: (p: [number, number]) => void;
}) {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (fixingMode === 'off') return;
        if (!onFixingClick || !svgRef.current) return;
        const ctm = svgRef.current.getScreenCTM();
        if (!ctm) return;
        const pt = svgRef.current.createSVGPoint();
        pt.x = e.clientX;
        pt.y = e.clientY;
        const local = pt.matrixTransform(ctm.inverse());
        // Only register clicks that land inside the face — outside it
        // there's no panel to fix into, so silently ignore.
        const face = dev.segments.find((s) => s.role === 'face');
        if (!face) return;
        if (
            local.x < face.xMm ||
            local.x > face.xMm + face.wMm ||
            local.y < face.yMm ||
            local.y > face.yMm + face.hMm
        )
            return;
        onFixingClick([local.x, local.y]);
    };
    const pad = Math.max(20, dev.totalFlatWMm * 0.06);
    const vb = useMemo(
        () =>
            `${-pad} ${-pad} ${dev.totalFlatWMm + pad * 2} ${
                dev.totalFlatHMm + pad * 2
            }`,
        [dev.totalFlatWMm, dev.totalFlatHMm, pad],
    );
    const stroke = Math.max(0.6, dev.totalFlatWMm / 800);
    const face = dev.segments.find((s) => s.role === 'face');
    const k = face ? face.wMm / dev.faceNominalWMm : 1;

    // Build the face as a single path with the cuts as holes (even-odd
    // fill rule). Apertures and stand-off fixings genuinely show through
    // the panel so the operator can see what the cutter will remove.
    const faceD = useMemo(() => {
        if (!face) return '';
        const out: string[] = [
            `M ${face.xMm} ${face.yMm} ` +
                `H ${face.xMm + face.wMm} ` +
                `V ${face.yMm + face.hMm} ` +
                `H ${face.xMm} Z`,
        ];
        for (const cut of [...aperture, ...fixings]) {
            if (cut.points.length < 3) continue;
            const [first, ...rest] = cut.points;
            out.push(
                `M ${first[0]} ${first[1]} ` +
                    rest.map(([x, y]) => `L ${x} ${y}`).join(' ') +
                    ' Z',
            );
        }
        return out.join(' ');
    }, [face, aperture, fixings]);

    return (
        <div className="h-full w-full bg-neutral-50">
            <svg
                ref={svgRef}
                viewBox={vb}
                className={`h-full w-full ${
                    fixingMode !== 'off' ? 'cursor-crosshair' : ''
                }`}
                preserveAspectRatio="xMidYMid meet"
                onClick={handleClick}
            >
                {/* Non-face segments — returns + shadow lips, all in the
                    same panel colour, edges in technical-drawing black. */}
                {dev.segments
                    .filter((s) => s.role !== 'face')
                    .map((s) => (
                        <g key={s.id}>
                            <rect
                                x={s.xMm}
                                y={s.yMm}
                                width={s.wMm}
                                height={s.hMm}
                                fill={panelColor}
                                stroke="#1a1f23"
                                strokeWidth={stroke}
                            />
                            <text
                                x={s.xMm + s.wMm / 2}
                                y={s.yMm + s.hMm / 2}
                                fontSize={Math.max(8, Math.min(s.wMm, s.hMm) / 10)}
                                fill="#6b7280"
                                textAnchor="middle"
                                dominantBaseline="middle"
                            >
                                {s.label}
                            </text>
                        </g>
                    ))}

                {/* Face — drawn as a single path with cut-outs (even-odd
                    fill) so the holes really do show through. */}
                {face && (
                    <g>
                        <path
                            d={faceD}
                            fill={panelColor}
                            fillRule="evenodd"
                            stroke="#1a1f23"
                            strokeWidth={stroke}
                        />
                        <text
                            x={face.xMm + face.wMm / 2}
                            y={face.yMm + face.hMm / 2}
                            fontSize={Math.max(8, Math.min(face.wMm, face.hMm) / 10)}
                            fill="#6b7280"
                            textAnchor="middle"
                            dominantBaseline="middle"
                            pointerEvents="none"
                        >
                            {face.label}
                        </text>
                    </g>
                )}

                {/* Vinyl appliqués — flat coloured fills sitting on the
                    face. No cut, no extrusion: just a printed/cut vinyl
                    sticker glued to the panel. */}
                {vinylPieces.map((piece, i) => (
                    <path
                        key={`vinyl-${i}`}
                        d={pathD(piece.path)}
                        fill={piece.color}
                        stroke="#1a1f23"
                        strokeWidth={stroke * 0.4}
                    />
                ))}

                {/* Acrylic pieces — coloured fills with a stronger edge
                    stroke so they read as a sheet sitting proud of the
                    panel rather than vinyl. Thickness shows up properly
                    in the 3D view; the flat preview just hints at it. */}
                {acrylicPieces.map((piece, i) => (
                    <g key={`acrylic-${i}`}>
                        <path
                            d={pathD(piece.path)}
                            fill={piece.color}
                            stroke="#1a1f23"
                            strokeWidth={stroke * 1.1}
                        />
                    </g>
                ))}

                {/* Fold lines */}
                {dev.foldLines.map((f) => (
                    <line
                        key={f.id}
                        x1={f.x1}
                        y1={f.y1}
                        x2={f.x2}
                        y2={f.y2}
                        stroke="#cc0000"
                        strokeWidth={stroke}
                        strokeDasharray={`${stroke * 4} ${stroke * 3}`}
                    />
                ))}

                {/* Seam lines */}
                {split.wasSplit &&
                    face &&
                    split.seamXsMm.map((sx, i) => {
                        const fx = face.xMm + sx * k;
                        return (
                            <line
                                key={`seam-${i}`}
                                x1={fx}
                                y1={face.yMm}
                                x2={fx}
                                y2={face.yMm + face.hMm}
                                stroke="#009933"
                                strokeWidth={stroke * 1.4}
                                strokeDasharray={`${stroke * 6} ${stroke * 3}`}
                            />
                        );
                    })}

                {/* Reference lettering outline (standoff mode, NOT cut). */}
                {reference.map((p, i) => (
                    <path
                        key={`ref-${i}`}
                        d={pathD(p)}
                        fill="none"
                        stroke="#9ca3af"
                        strokeWidth={stroke * 0.9}
                        strokeDasharray={`${stroke * 3} ${stroke * 2}`}
                    />
                ))}

                {/* Keyline (register line, NOT cut). Apertures and fixings
                    are real cut-outs in the face path above. */}
                {keyline.map((p, i) => (
                    <path
                        key={`kl-${i}`}
                        d={pathD(p)}
                        fill="none"
                        stroke="#00aabe"
                        strokeWidth={stroke}
                        strokeDasharray={`${stroke * 2} ${stroke * 2}`}
                    />
                ))}

                {/* Click-to-select overlays — one transparent hit shape per
                    imported path, regardless of whether it's a cut, vinyl
                    or acrylic. Lets the operator click a hole in the panel
                    (a cut) just as easily as a filled vinyl/acrylic piece.
                    The selected path gets an orange dashed highlight on
                    top so it's obvious which row the side panel is for. */}
                {placedPathsByIndex && (
                    <g>
                        {placedPathsByIndex.map((p, i) => {
                            if (!p) return null;
                            const groupStroke =
                                pathGroupColors?.[i] ?? null;
                            const inPending = !!pendingPaths?.has(i);
                            // The hit overlay only listens to clicks
                            // while the operator is editing a group;
                            // otherwise the canvas stays passive.
                            const hitListens =
                                isEditingGroup && !!onPathToggle;
                            return (
                                <g key={`pick-${i}`}>
                                    {/* Solid group highlight underneath
                                        so it sits below the pending /
                                        select highlight without
                                        fighting it. */}
                                    {groupStroke && !inPending && (
                                        <path
                                            d={pathD(p)}
                                            fill="none"
                                            stroke={groupStroke}
                                            strokeWidth={stroke * 1.4}
                                            pointerEvents="none"
                                        />
                                    )}
                                    {hitListens && (
                                        <path
                                            d={pathD(p)}
                                            fill="rgba(0,0,0,0.001)"
                                            stroke="rgba(0,0,0,0)"
                                            strokeWidth={Math.max(
                                                stroke * 4,
                                                2,
                                            )}
                                            style={{ cursor: 'pointer' }}
                                            pointerEvents="all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onPathToggle?.(i);
                                            }}
                                        />
                                    )}
                                    {inPending && (
                                        <path
                                            d={pathD(p)}
                                            fill="none"
                                            stroke="#f97316"
                                            strokeWidth={stroke * 2.4}
                                            strokeDasharray={`${stroke * 3} ${stroke * 2}`}
                                            pointerEvents="none"
                                        />
                                    )}
                                </g>
                            );
                        })}
                    </g>
                )}

                {/* Overall dimensions */}
                <text
                    x={dev.totalFlatWMm / 2}
                    y={dev.totalFlatHMm + pad * 0.7}
                    fontSize={pad * 0.5}
                    fill="#374151"
                    textAnchor="middle"
                >
                    {dev.totalFlatWMm} mm
                </text>
                <text
                    x={-pad * 0.55}
                    y={dev.totalFlatHMm / 2}
                    fontSize={pad * 0.5}
                    fill="#374151"
                    textAnchor="middle"
                    transform={`rotate(-90 ${-pad * 0.55} ${dev.totalFlatHMm / 2})`}
                >
                    {dev.totalFlatHMm} mm
                </text>
            </svg>
        </div>
    );
}
