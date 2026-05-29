'use client';

import { useMemo, useRef, useState } from 'react';
import type {
    PanelDevelopment,
    PanelSplit,
    FlatPath,
    MaterialPiece,
    PushThroughPiece,
} from '@/lib/visualiser/types';

const DEFAULT_PANEL_COLOR = '#d6d6d6';

/**
 * Per-path clickable overlay. Always picks up clicks so the operator
 * can pick a path straight from the canvas — outside group-edit mode
 * the click auto-enters the path's group (or starts a new one with
 * that path selected); inside edit mode it toggles selection.
 *
 * When a path belongs to a group, the WHOLE shape is washed in the
 * group's palette colour (translucent fill + matching outline) so it
 * reads as a tagged element rather than just an outlined one.
 */
function PathHitOverlay({
    d,
    stroke,
    groupStroke,
    inPending,
    hitListens,
    onClick,
}: {
    d: string;
    stroke: number;
    groupStroke: string | null;
    inPending: boolean;
    /**
     * Always-on click handler is provided when this is true. The
     * dispatch (toggle-in-edit-mode vs auto-enter-group) is owned by
     * the parent so we don't need to know which we're doing here.
     */
    hitListens: boolean;
    onClick: () => void;
}) {
    const [hovered, setHovered] = useState(false);
    return (
        <g>
            {/* Group-membership wash — translucent fill + matching
                stroke covering the whole element. Hidden when a
                pending / hover state is showing so the active feedback
                always wins. */}
            {groupStroke && !inPending && !hovered && (
                <path
                    d={d}
                    fill={groupStroke}
                    fillOpacity={0.22}
                    fillRule="evenodd"
                    stroke={groupStroke}
                    strokeWidth={stroke * 1.4}
                    pointerEvents="none"
                />
            )}
            {hitListens && (
                <path
                    d={d}
                    /* Translucent fill = clickable interior; the slight
                       alpha matters because SVG hit testing on a
                       fully-transparent fill is browser-inconsistent. */
                    fill="rgba(0,0,0,0.001)"
                    fillRule="evenodd"
                    stroke="rgba(0,0,0,0)"
                    /* Non-scaling stroke = strokeWidth is in SCREEN
                       pixels, not SVG/mm units. Without this, a small
                       counter on a 2.4 m panel collapses to a hit
                       target of ~3 px even with the mm padding bumped
                       up. 18 px gives a generous click halo around
                       even the smallest path. */
                    strokeWidth={18}
                    vectorEffect="non-scaling-stroke"
                    style={{ cursor: 'pointer' }}
                    pointerEvents="all"
                    onClick={(e) => {
                        e.stopPropagation();
                        onClick();
                    }}
                    onMouseEnter={() => setHovered(true)}
                    onMouseLeave={() => setHovered(false)}
                />
            )}
            {(inPending || (hitListens && hovered)) && (
                <path
                    d={d}
                    fill="#f97316"
                    fillOpacity={inPending ? 0.28 : 0.18}
                    fillRule="evenodd"
                    stroke="#f97316"
                    strokeWidth={inPending ? stroke * 2.4 : stroke * 2}
                    strokeDasharray={
                        inPending
                            ? `${stroke * 3} ${stroke * 2}`
                            : undefined
                    }
                    opacity={inPending ? 1 : 0.85}
                    pointerEvents="none"
                />
            )}
        </g>
    );
}

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
    pushThroughKeyline = [],
    pushThroughIslands = [],
    pushThroughPieces = [],
    fixings = [],
    cableHoles = [],
    reference = [],
    vinylPieces = [],
    acrylicPieces = [],
    solidPieces = [],
    placedPathsByIndex = null,
    pathGroupColors = null,
    pendingPaths,
    isEditingGroup = false,
    onPathToggle,
    panelColor = DEFAULT_PANEL_COLOR,
    fixingMode = 'off',
    cableMode = 'off',
    onFixingClick,
}: {
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    /**
     * Per-pushthrough-path outward keyline — what's actually cut into
     * the panel face for press-fit assembly. Drawn as real face holes
     * so the operator sees the panel-with-letter-shaped-windows.
     */
    pushThroughKeyline?: FlatPath[];
    /**
     * Retained counter islands — the metal panel kept inside each
     * counter (G/e/g), ringed by the keyline gap. Drawn in the panel
     * colour on top of the open counter so it reads as metal with a
     * thin cut around it, not an open hole.
     */
    pushThroughIslands?: FlatPath[];
    /**
     * Push-through inserts — letters mounted from behind. Drawn as
     * filled acrylic shapes (outer + each counter as a SEPARATE piece)
     * sitting inside the panel hole, matching the production assembly.
     */
    pushThroughPieces?: PushThroughPiece[];
    fixings?: FlatPath[];
    /**
     * Cable-routing holes (flat-dev circle polys). Real holes cut in
     * the panel face, drawn with a distinct ring so the operator can
     * tell them from standoff fixings.
     */
    cableHoles?: FlatPath[];
    reference?: FlatPath[];
    vinylPieces?: MaterialPiece[];
    acrylicPieces?: MaterialPiece[];
    /**
     * Pieces in the panel colour — typically inner counters that
     * stay as solid panel material. Rendered as filled shapes on top
     * of the face so they visibly fill in the donut hole of their
     * parent aperture.
     */
    solidPieces?: MaterialPiece[];
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
    cableMode?: 'off' | 'place' | 'delete';
    /** Called with the click point in flat-development mm coords. */
    onFixingClick?: (p: [number, number]) => void;
}) {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const placementActive = fixingMode !== 'off' || cableMode !== 'off';
    const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!placementActive) return;
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
    // fill rule). Apertures, stand-off fixings, and push-through
    // keylines genuinely show through the panel so the operator can
    // see what the cutter will remove. (Push-through keylines are the
    // letter-shaped panel openings the inserts press through from
    // behind — drawn as holes so the acrylic insert pieces drawn over
    // them read as sitting INSIDE the panel hole.)
    const faceD = useMemo(() => {
        if (!face) return '';
        const out: string[] = [
            `M ${face.xMm} ${face.yMm} ` +
                `H ${face.xMm + face.wMm} ` +
                `V ${face.yMm + face.hMm} ` +
                `H ${face.xMm} Z`,
        ];
        for (const cut of [
            ...aperture,
            ...pushThroughKeyline,
            ...fixings,
            ...cableHoles,
        ]) {
            if (cut.points.length < 3) continue;
            const [first, ...rest] = cut.points;
            out.push(
                `M ${first[0]} ${first[1]} ` +
                    rest.map(([x, y]) => `L ${x} ${y}`).join(' ') +
                    ' Z',
            );
        }
        return out.join(' ');
    }, [face, aperture, pushThroughKeyline, fixings, cableHoles]);

    return (
        <div className="h-full w-full bg-neutral-50">
            <svg
                ref={svgRef}
                viewBox={vb}
                className={`h-full w-full ${
                    placementActive ? 'cursor-crosshair' : ''
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

                {/* Solid pieces — drawn FIRST so vinyl / acrylic sit
                    on top of them visually. Solid pieces fill with the
                    panel colour (or a group-customised colour), making
                    floating inner counters (the hole in O, e, g) read
                    as real panel material rather than as cuts. */}
                {solidPieces.map((piece, i) => {
                    const d =
                        pathD(piece.path) +
                        ' ' +
                        (piece.holes ?? [])
                            .map((h) => pathD(h))
                            .join(' ');
                    return (
                        <path
                            key={`solid-${i}`}
                            d={d}
                            fill={piece.color}
                            fillRule="evenodd"
                            stroke="#1a1f23"
                            strokeWidth={stroke * 0.25}
                            strokeOpacity={0.4}
                        />
                    );
                })}

                {/* Vinyl appliqués — flat coloured fills sitting on the
                    face. Nested paths become evenodd holes so an outer
                    letter outline assigned to vinyl renders as a proper
                    donut around its inner counters. */}
                {vinylPieces.map((piece, i) => {
                    const d =
                        pathD(piece.path) +
                        ' ' +
                        (piece.holes ?? [])
                            .map((h) => pathD(h))
                            .join(' ');
                    return (
                        <path
                            key={`vinyl-${i}`}
                            d={d}
                            fill={piece.color}
                            fillRule="evenodd"
                            stroke="#1a1f23"
                            strokeWidth={stroke * 0.4}
                        />
                    );
                })}

                {/* Push-through inserts — outer letter outline rendered
                    as a compound donut, with counters as evenodd holes.
                    Counters are NOT filled in (even though production
                    cuts them as separate acrylic pieces) because filling
                    them would hide the very thing the operator checks:
                    "does the R have a counter? is the O a donut?". The
                    counter pieces still emit on the production PDF as
                    separate contours. */}
                {pushThroughPieces.map((piece, i) => {
                    const d =
                        pathD(piece.path) +
                        ' ' +
                        (piece.holes ?? [])
                            .map((h) => pathD(h))
                            .join(' ');
                    return (
                        <path
                            key={`pt-${i}`}
                            d={d}
                            fill={piece.color}
                            fillRule="evenodd"
                            stroke="#1a1f23"
                            strokeWidth={stroke * 0.8}
                        />
                    );
                })}

                {/* Retained counter islands — panel metal kept inside
                    each counter, drawn in the panel colour on top of the
                    open counter so it reads as metal. The keyline gap
                    between the island and the counter edge stays open
                    (shows the face/background through). */}
                {pushThroughIslands.map((p, i) => (
                    <path
                        key={`pt-island-${i}`}
                        d={pathD(p)}
                        fill={panelColor}
                        stroke="#1a1f23"
                        strokeWidth={stroke * 0.8}
                    />
                ))}

                {/* Acrylic pieces — coloured fills with a stronger edge
                    stroke so they read as a sheet sitting proud of the
                    panel rather than vinyl. Thickness shows up properly
                    in the 3D view; the flat preview just hints at it. */}
                {acrylicPieces.map((piece, i) => {
                    const d =
                        pathD(piece.path) +
                        ' ' +
                        (piece.holes ?? [])
                            .map((h) => pathD(h))
                            .join(' ');
                    return (
                        <path
                            key={`acrylic-${i}`}
                            d={d}
                            fill={piece.color}
                            fillRule="evenodd"
                            stroke="#1a1f23"
                            strokeWidth={stroke * 1.1}
                        />
                    );
                })}

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

                {/* Push-through keyline traces — the press-fit shoulder
                    drawn as a register line. The hole itself is already
                    cut into the face above; this just makes the shoulder
                    visible so the operator can sanity-check the offset. */}
                {pushThroughKeyline.map((p, i) => (
                    <path
                        key={`ptkl-${i}`}
                        d={pathD(p)}
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth={stroke}
                        strokeDasharray={`${stroke * 2} ${stroke * 2}`}
                    />
                ))}

                {/* Cable holes — real holes in the face (cut above), with
                    a distinct purple ring + crosshair so they read as
                    cable routing rather than standoff fixings, and so
                    they're an obvious target in cable-delete mode. */}
                {cableHoles.map((p, i) => {
                    let cx = 0;
                    let cy = 0;
                    for (const [x, y] of p.points) {
                        cx += x;
                        cy += y;
                    }
                    cx /= p.points.length || 1;
                    cy /= p.points.length || 1;
                    let r = 0;
                    for (const [x, y] of p.points)
                        r += Math.hypot(x - cx, y - cy);
                    r /= p.points.length || 1;
                    const xh = r * 1.5;
                    const ringColor =
                        cableMode === 'delete' ? '#dc2626' : '#7c3aed';
                    return (
                        <g key={`cable-${i}`} pointerEvents="none">
                            <circle
                                cx={cx}
                                cy={cy}
                                r={r}
                                fill="none"
                                stroke={ringColor}
                                strokeWidth={stroke * 1.2}
                            />
                            <line
                                x1={cx - xh}
                                y1={cy}
                                x2={cx + xh}
                                y2={cy}
                                stroke={ringColor}
                                strokeWidth={stroke}
                            />
                            <line
                                x1={cx}
                                y1={cy - xh}
                                x2={cx}
                                y2={cy + xh}
                                stroke={ringColor}
                                strokeWidth={stroke}
                            />
                        </g>
                    );
                })}

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
                            // Always clickable when a handler is
                            // supplied. The parent decides whether to
                            // pass one (it doesn't in fixing mode).
                            const hitListens = !!onPathToggle;
                            return (
                                <PathHitOverlay
                                    key={`pick-${i}`}
                                    d={pathD(p)}
                                    stroke={stroke}
                                    groupStroke={groupStroke}
                                    inPending={inPending}
                                    hitListens={hitListens}
                                    onClick={() => onPathToggle?.(i)}
                                />
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
