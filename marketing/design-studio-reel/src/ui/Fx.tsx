import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { BRAND, EASE } from '../theme';
import { ramp } from './anim';

function withAlpha(hex: string, a: number): string {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const r = parseInt(v.slice(0, 2), 16);
    const g = parseInt(v.slice(2, 4), 16);
    const b = parseInt(v.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * A rhythmic "beat" 0→1 impulse with a sharp attack and cubic decay, repeating
 * every `period` frames (18f ≈ 100bpm at 30fps). Drives the pulse energy that
 * runs under the whole film.
 */
export function beat(frame: number, period = 18): number {
    const t = (frame % period) / period;
    return Math.pow(1 - t, 3);
}

/** Subtle whole-frame pulse on the beat — gives the reel a heartbeat. */
export function BeatPulse({
    children,
    amount = 0.007,
    period = 18,
}: {
    children: React.ReactNode;
    amount?: number;
    period?: number;
}) {
    const frame = useCurrentFrame();
    const s = 1 + amount * beat(frame, period);
    return (
        <AbsoluteFill style={{ transform: `scale(${s})`, transformOrigin: '50% 50%' }}>
            {children}
        </AbsoluteFill>
    );
}

/** Animated film grain for texture/energy. Cheap, blend-mode overlay. */
export function Grain({ opacity = 0.055 }: { opacity?: number }) {
    const frame = useCurrentFrame();
    const seed = frame % 40;
    return (
        <AbsoluteFill
            style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}
        >
            <svg width="100%" height="100%">
                <filter id={`grain${seed}`}>
                    <feTurbulence
                        type="fractalNoise"
                        baseFrequency="0.85"
                        numOctaves={2}
                        seed={seed}
                    />
                </filter>
                <rect width="100%" height="100%" filter={`url(#grain${seed})`} />
            </svg>
        </AbsoluteFill>
    );
}

/** A soft light bar sweeping across the stage on a loop — cinematic sheen. */
export function ScanSweep({
    period = 140,
    opacity = 0.1,
    color = BRAND.accentGlow,
}: {
    period?: number;
    opacity?: number;
    color?: string;
}) {
    const frame = useCurrentFrame();
    const p = (frame % period) / period;
    const x = p * 150 - 25;
    return (
        <AbsoluteFill
            style={{
                pointerEvents: 'none',
                mixBlendMode: 'screen',
                opacity,
                background: `linear-gradient(100deg, transparent ${x - 9}%, ${withAlpha(color, 0.9)} ${x}%, transparent ${x + 9}%)`,
            }}
        />
    );
}

/** A bright wash at a scene's entrance — the "whip flash" on every cut. */
export function EntryFlash({
    at = 0,
    dur = 7,
    color = BRAND.accentGlow,
    strength = 0.6,
}: {
    at?: number;
    dur?: number;
    color?: string;
    strength?: number;
}) {
    const frame = useCurrentFrame();
    // Only active within its own [at, at+dur] window — otherwise the clamp
    // would hold the flash at full strength for every frame before `at`.
    if (frame < at || frame > at + dur) return null;
    const t = interpolate(frame, [at, at + dur], [1, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    if (t <= 0) return null;
    return (
        <AbsoluteFill
            style={{
                pointerEvents: 'none',
                mixBlendMode: 'screen',
                background: `radial-gradient(circle at 50% 44%, ${withAlpha('#ffffff', 0.5 * strength * t)} 0%, ${withAlpha(color, 0.6 * strength * t)} 30%, transparent 72%)`,
            }}
        />
    );
}

/** An expanding shockwave ring. */
export function ShockwaveRing({
    x,
    y,
    startF,
    size = 1000,
    dur = 24,
    color = BRAND.accentGlow,
    thickness = 8,
}: {
    x: number;
    y: number;
    startF: number;
    size?: number;
    dur?: number;
    color?: string;
    thickness?: number;
}) {
    const frame = useCurrentFrame();
    const p = ramp(frame, startF, startF + dur, EASE.out);
    if (p <= 0 || p >= 1) return null;
    const s = 0.15 + p * 1.05;
    const fade = 1 - p;
    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                width: size,
                height: size,
                transform: `translate(-50%, -50%) scale(${s})`,
                borderRadius: '50%',
                border: `${thickness * fade + 1}px solid ${withAlpha(color, fade * 0.85)}`,
                boxShadow: `0 0 50px ${withAlpha(color, fade * 0.5)}, inset 0 0 40px ${withAlpha(color, fade * 0.3)}`,
                pointerEvents: 'none',
            }}
        />
    );
}

/** A radial burst of glowing sparks (deterministic — no RNG). */
export function SparkBurst({
    x,
    y,
    startF,
    count = 20,
    spread = 560,
    dur = 32,
    color = BRAND.accentGlow,
    gravity = 140,
}: {
    x: number;
    y: number;
    startF: number;
    count?: number;
    spread?: number;
    dur?: number;
    color?: string;
    gravity?: number;
}) {
    const frame = useCurrentFrame();
    const p = ramp(frame, startF, startF + dur, EASE.out);
    if (p <= 0 || p > 1) return null;
    return (
        <>
            {Array.from({ length: count }).map((_, i) => {
                const a = (i / count) * Math.PI * 2 + (i % 3) * 0.17;
                const reach = spread * (0.45 + ((i * 7) % 11) / 11 * 0.55);
                const px = x + Math.cos(a) * reach * p;
                const py = y + Math.sin(a) * reach * p + p * p * gravity;
                const sz = 8 * (1 - p) + 2.5;
                return (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: px,
                            top: py,
                            width: sz,
                            height: sz,
                            borderRadius: '50%',
                            background: '#ffffff',
                            boxShadow: `0 0 12px ${color}, 0 0 22px ${withAlpha(color, 0.7)}`,
                            opacity: 1 - p,
                            transform: 'translate(-50%, -50%)',
                            pointerEvents: 'none',
                        }}
                    />
                );
            })}
        </>
    );
}

/** Radial speed lines converging/receding — a burst of energy on the hook. */
export function SpeedLines({
    startF,
    dur = 16,
    count = 22,
    color = BRAND.accentGlow,
}: {
    startF: number;
    dur?: number;
    count?: number;
    color?: string;
}) {
    const frame = useCurrentFrame();
    const p = ramp(frame, startF, startF + dur, EASE.out);
    if (p <= 0 || p >= 1) return null;
    const fade = Math.sin(p * Math.PI); // in then out
    return (
        <AbsoluteFill style={{ pointerEvents: 'none', mixBlendMode: 'screen' }}>
            {Array.from({ length: count }).map((_, i) => {
                const a = (i / count) * 360;
                const len = 220 + ((i * 13) % 160);
                return (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: '50%',
                            top: '46%',
                            width: len,
                            height: 3,
                            transformOrigin: 'left center',
                            transform: `rotate(${a}deg) translateX(${180 + p * 500}px)`,
                            background: `linear-gradient(90deg, transparent, ${withAlpha(color, fade * 0.7)})`,
                            opacity: fade,
                        }}
                    />
                );
            })}
        </AbsoluteFill>
    );
}
