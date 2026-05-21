'use client';

import { useMemo, useRef } from 'react';
import type {
    PanelDevelopment,
    PanelSplit,
    FlatPath,
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
    panelColor = DEFAULT_PANEL_COLOR,
    placeFixingMode = false,
    onPlaceFixing,
}: {
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
    fixings?: FlatPath[];
    reference?: FlatPath[];
    panelColor?: string;
    placeFixingMode?: boolean;
    /** Called with the click point in flat-development mm coords. */
    onPlaceFixing?: (p: [number, number]) => void;
}) {
    const svgRef = useRef<SVGSVGElement | null>(null);

    const handleClick = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!placeFixingMode || !onPlaceFixing || !svgRef.current) return;
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
        onPlaceFixing([local.x, local.y]);
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
                    placeFixingMode ? 'cursor-crosshair' : ''
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
