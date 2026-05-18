'use client';

import { useMemo } from 'react';
import type {
    PanelDevelopment,
    PanelSplit,
    FlatPath,
} from '@/lib/visualiser/types';

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
}: {
    development: PanelDevelopment;
    split: PanelSplit;
    aperture: FlatPath[];
    keyline: FlatPath[];
}) {
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

    return (
        <div className="h-full w-full bg-neutral-50">
            <svg
                viewBox={vb}
                className="h-full w-full"
                preserveAspectRatio="xMidYMid meet"
            >
                {/* Segments */}
                {dev.segments.map((s) => (
                    <g key={s.id}>
                        <rect
                            x={s.xMm}
                            y={s.yMm}
                            width={s.wMm}
                            height={s.hMm}
                            fill={s.role === 'face' ? '#e8f0f3' : '#f4f7f8'}
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

                {/* Aperture + keyline */}
                {aperture.map((p, i) => (
                    <path
                        key={`ap-${i}`}
                        d={pathD(p)}
                        fill="none"
                        stroke="#1e5fc8"
                        strokeWidth={stroke}
                    />
                ))}
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
