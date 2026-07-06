import React from 'react';
import { CC } from '../theme';

// Minimal, refined line-art motifs for the promo set. Cream stroke with brown
// accents, rounded caps — echoing the hand-crafted brand. Steam is driven by a
// 0..1 loop phase so promos can hold or loop with no seam.

const STROKE = CC.cream;
const ACCENT = CC.brown;

function Steam({ phase, x, delay }: { phase: number; x: number; delay: number }) {
    const p = (phase + delay) % 1;
    const y = -p * 34;
    const op = Math.sin(p * Math.PI) * 0.8;
    return (
        <path
            d={`M ${x} 60 q -7 -10 0 -20 q 7 -10 0 -20`}
            fill="none"
            stroke={ACCENT}
            strokeWidth={3.4}
            strokeLinecap="round"
            opacity={op}
            transform={`translate(0 ${y})`}
        />
    );
}

export function CoffeeCup({ size = 200, phase = 0 }: { size?: number; phase?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
            <g>
                <Steam phase={phase} x={82} delay={0} />
                <Steam phase={phase} x={100} delay={0.33} />
                <Steam phase={phase} x={118} delay={0.66} />
            </g>
            {/* cup */}
            <path
                d="M52 92 h84 v24 a34 34 0 0 1 -34 34 h-16 a34 34 0 0 1 -34 -34 z"
                stroke={STROKE}
                strokeWidth={5}
                strokeLinejoin="round"
            />
            {/* handle */}
            <path d="M136 100 a20 20 0 0 1 0 34" stroke={STROKE} strokeWidth={5} fill="none" strokeLinecap="round" />
            {/* saucer */}
            <path d="M44 158 h112" stroke={ACCENT} strokeWidth={5} strokeLinecap="round" />
            {/* crema line */}
            <path d="M60 100 h72" stroke={ACCENT} strokeWidth={3} strokeLinecap="round" opacity={0.7} />
        </svg>
    );
}

export function Sando({ size = 200 }: { size?: number }) {
    // A triangular deli-sando wedge, point up: bread outline, a wavy filling and
    // a straight filling layer, on a thicker brown bottom crust.
    return (
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
            {/* bread wedge outline */}
            <path
                d="M100 58 L152 142 L48 142 Z"
                stroke={STROKE}
                strokeWidth={5}
                strokeLinejoin="round"
            />
            {/* wavy filling (lettuce) */}
            <path
                d="M64 116 q6 -7 12 0 t12 0 t12 0 t12 0 t12 0"
                stroke={ACCENT}
                strokeWidth={4.2}
                strokeLinecap="round"
                fill="none"
            />
            {/* straight filling (cheese / meat) */}
            <path d="M58 128 h84" stroke={STROKE} strokeWidth={4.2} strokeLinecap="round" />
            {/* bottom crust */}
            <path d="M48 142 h104" stroke={ACCENT} strokeWidth={6} strokeLinecap="round" />
        </svg>
    );
}

export function ToGo({ size = 200, phase = 0 }: { size?: number; phase?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 200 200" fill="none">
            <g>
                <Steam phase={phase} x={92} delay={0} />
                <Steam phase={phase} x={110} delay={0.5} />
            </g>
            {/* lid */}
            <path d="M64 78 h72 l-4 12 h-64 z" stroke={STROKE} strokeWidth={5} strokeLinejoin="round" />
            <path d="M88 66 h24 a6 6 0 0 1 0 12 h-24 a6 6 0 0 1 0 -12 z" stroke={STROKE} strokeWidth={4} />
            {/* cup body (tapered) */}
            <path d="M70 94 h60 l-8 60 h-44 z" stroke={STROKE} strokeWidth={5} strokeLinejoin="round" />
            {/* sleeve */}
            <path d="M67 116 h66" stroke={ACCENT} strokeWidth={16} strokeLinecap="butt" opacity={0.9} />
            <path d="M67 116 h66" stroke={STROKE} strokeWidth={5} opacity={0} />
        </svg>
    );
}
