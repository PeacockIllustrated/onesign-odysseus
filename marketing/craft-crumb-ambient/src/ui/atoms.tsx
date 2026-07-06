import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CC, stage, withAlpha } from '../theme';

/** The warm dim-café stage: near-black with a soft warm pool that drifts on a
 *  slow closed loop (a large radial highlight orbiting a tiny circle) so a
 *  screensaver can run forever with no visible seam. */
export function Stage({
    children,
    loop,
    warmth = 1,
}: {
    children?: React.ReactNode;
    loop: number; // frames in one seamless cycle
    warmth?: number;
}) {
    const frame = useCurrentFrame();
    const t = (frame % loop) / loop; // 0..1
    const ang = t * Math.PI * 2;
    const cx = 50 + Math.cos(ang) * 6;
    const cy = 34 + Math.sin(ang) * 5;
    return (
        <AbsoluteFill style={{ background: stage() }}>
            {/* drifting warm lamp pool */}
            <AbsoluteFill
                style={{
                    background: `radial-gradient(60% 55% at ${cx}% ${cy}%, ${withAlpha(
                        CC.brownLit,
                        0.16 * warmth,
                    )} 0%, ${withAlpha(CC.brown, 0.06 * warmth)} 34%, rgba(0,0,0,0) 70%)`,
                }}
            />
            {/* bottom warmth grounding the scene */}
            <AbsoluteFill
                style={{
                    background: `radial-gradient(80% 50% at 50% 108%, ${withAlpha(
                        CC.brownDeep,
                        0.28,
                    )} 0%, rgba(0,0,0,0) 60%)`,
                }}
            />
            {children}
            {/* vignette */}
            <AbsoluteFill
                style={{
                    boxShadow: 'inset 0 0 320px 90px rgba(0,0,0,0.62)',
                    pointerEvents: 'none',
                }}
            />
        </AbsoluteFill>
    );
}

/** Fine film grain — soft, warm-overlaid. */
export function Grain({ opacity = 0.05 }: { opacity?: number }) {
    const frame = useCurrentFrame();
    const seed = frame % 36;
    return (
        <AbsoluteFill style={{ opacity, mixBlendMode: 'overlay', pointerEvents: 'none' }}>
            <svg width="100%" height="100%">
                <filter id={`g${seed}`}>
                    <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves={2} seed={seed} />
                </filter>
                <rect width="100%" height="100%" filter={`url(#g${seed})`} />
            </svg>
        </AbsoluteFill>
    );
}

/** Slow warm dust / steam motes drifting up and wrapping seamlessly. */
export function Motes({
    count = 26,
    loop,
    color = CC.brownLit,
}: {
    count?: number;
    loop: number;
    color?: string;
}) {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();
    const motes = React.useMemo(() => {
        // deterministic pseudo-random (no Math.random at module/render scope)
        const rnd = (n: number) => {
            const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
            return x - Math.floor(x);
        };
        return Array.from({ length: count }, (_, i) => ({
            x: rnd(i + 1) * width,
            size: 2 + rnd(i + 7) * 5,
            speed: 0.5 + rnd(i + 13) * 0.9,
            phase: rnd(i + 21),
            drift: (rnd(i + 29) - 0.5) * 60,
            baseOp: 0.12 + rnd(i + 33) * 0.22,
        }));
    }, [count, width]);
    return (
        <AbsoluteFill style={{ pointerEvents: 'none' }}>
            {motes.map((m, i) => {
                const p = ((frame * m.speed) / loop + m.phase) % 1; // 0..1 rising
                const y = height * (1.05 - p * 1.15);
                const x = m.x + Math.sin(p * Math.PI * 2) * m.drift;
                // fade in/out at the ends so wrap is invisible
                const op = m.baseOp * Math.sin(p * Math.PI);
                return (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            left: x,
                            top: y,
                            width: m.size,
                            height: m.size,
                            borderRadius: 999,
                            background: color,
                            opacity: op,
                            filter: 'blur(1.2px)',
                            boxShadow: `0 0 ${m.size * 2}px ${withAlpha(color, 0.5)}`,
                        }}
                    />
                );
            })}
        </AbsoluteFill>
    );
}

/** A thin brand rule with brown dot terminators (echoes the logo's dividers). */
export function Rule({ width = 240, color = CC.brown, opacity = 1 }: { width?: number; color?: string; opacity?: number }) {
    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, opacity }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
            <span style={{ width, height: 2, background: color }} />
            <span style={{ width: 6, height: 6, borderRadius: 999, background: color }} />
        </div>
    );
}
