import React from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, CONDENSED, DISPLAY, FONT } from '../theme';
import { ramp } from './anim';
import { EASE } from '../theme';
import { SignPanel } from './SignPanel';
import type { RealBrand } from '../brands';

function withAlpha(hex: string, a: number): string {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return `rgba(${parseInt(v.slice(0, 2), 16)}, ${parseInt(v.slice(2, 4), 16)}, ${parseInt(v.slice(4, 6), 16)}, ${a})`;
}

/** Archivo-Black caps eyebrow / kicker. */
export function Kicker({
    text,
    color = 'rgba(255,255,255,0.62)',
    size = 30,
    style,
}: {
    text: string;
    color?: string;
    size?: number;
    style?: React.CSSProperties;
}) {
    return (
        <span
            style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: size,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color,
                ...style,
            }}
        >
            {text}
        </span>
    );
}

/** Big Archivo-Black stat slab (numbers / references). */
export function StatSlab({
    text,
    at = 0,
    size = 120,
    color = BRAND.light,
    style,
}: {
    text: string;
    at?: number;
    size?: number;
    color?: string;
    style?: React.CSSProperties;
}) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const s = spring({ frame: frame - at, fps, config: { damping: 13, stiffness: 220, mass: 0.6 } });
    return (
        <span
            style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: size,
                letterSpacing: '-0.02em',
                color,
                fontVariantNumeric: 'tabular-nums',
                opacity: Math.min(1, s * 1.4),
                transform: `translateY(${(1 - s) * 24}px)`,
                display: 'inline-block',
                textShadow: '0 10px 30px rgba(0,0,0,0.5)',
                ...style,
            }}
        >
            {text}
        </span>
    );
}

/** A 2–3 frame full-bleed solid strobe card — rhythm without a pulse. */
export function WhipFlashCard({
    at,
    dur = 3,
    color = BRAND.accentGlow,
    opacity = 0.9,
}: {
    at: number;
    dur?: number;
    color?: string;
    opacity?: number;
}) {
    const frame = useCurrentFrame();
    if (frame < at || frame >= at + dur) return null;
    return <AbsoluteFill style={{ background: color, opacity, pointerEvents: 'none' }} />;
}

/** Snap-zoom scene entrance: incoming starts scaled + blurred, settles hard. */
export function SnapIn({
    children,
    dur = 8,
    from = 1.12,
}: {
    children: React.ReactNode;
    dur?: number;
    from?: number;
}) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const s = spring({ frame, fps, config: { damping: 16, stiffness: 200, mass: 0.6 } });
    const scale = interpolate(s, [0, 1], [from, 1]);
    const blur = interpolate(frame, [0, dur], [7, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    return (
        <AbsoluteFill style={{ transform: `scale(${scale})`, filter: `blur(${blur}px)` }}>
            {children}
        </AbsoluteFill>
    );
}

/** CTA iris — close to near-black then open (mode). */
export function Iris({
    at,
    dur = 8,
    mode,
}: {
    at: number;
    dur: number;
    mode: 'close' | 'open';
}) {
    const frame = useCurrentFrame();
    const p = ramp(frame, at, at + dur, EASE.inOut);
    // close: the black fill shrinks to reveal (starts covering) — actually we
    // want close = black grows to cover. Represent the VISIBLE content radius:
    // close → content circle shrinks to 0; open → grows to full.
    const r = mode === 'close' ? interpolate(p, [0, 1], [130, 0]) : interpolate(p, [0, 1], [0, 130]);
    return (
        <AbsoluteFill
            style={{
                background: '#04070a',
                // black everywhere EXCEPT a circle of radius r (the visible hole)
                clipPath: `polygon(0 0,100% 0,100% 100%,0 100%)`,
                WebkitMaskImage: `radial-gradient(circle at 50% 46%, transparent ${r}%, #000 ${r + 0.5}%)`,
                maskImage: `radial-gradient(circle at 50% 46%, transparent ${r}%, #000 ${r + 0.5}%)`,
                pointerEvents: 'none',
            }}
        />
    );
}

/**
 * One real-brand montage card: a mini lit sign in the client's own colour with
 * the brand name on it, plus a nameplate strip (name · kind · spec chip).
 * Entrance varies by index so six cards never feel templated.
 */
export function MontageCard({
    brand,
    index,
    dur,
}: {
    brand: RealBrand;
    index: number;
    dur: number;
}) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const inS = spring({ frame, fps, config: { damping: 14, stiffness: 240, mass: 0.6 } });
    // snap-settle: overshoot then rest
    const settle = interpolate(frame, [0, 4, 9], [1, 0.965, 1], {
        extrapolateRight: 'clamp',
    });

    const variant = index % 4;
    let enter: React.CSSProperties = {};
    if (variant === 0) enter = { transform: `translateX(${(1 - inS) * -160}px)` }; // slide L
    else if (variant === 1) enter = { transform: `scale(${0.7 + inS * 0.3})` }; // bloom
    else if (variant === 2)
        enter = { transform: `perspective(1200px) rotateY(${(1 - inS) * 70}deg)` }; // flip
    else enter = { transform: `translateY(${(1 - inS) * 90}px)` }; // stamp up

    const w = 900;
    const h = 236;

    return (
        <AbsoluteFill
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 40,
                opacity: Math.min(1, inS * 1.6),
            }}
        >
            <div style={{ ...enter, transform: `${enter.transform ?? ''} scale(${settle})` }}>
                <SignPanel
                    widthPx={w}
                    heightPx={h}
                    depthPx={30}
                    color={brand.accent}
                    rotY={-14}
                    rotX={8}
                    night={brand.lit}
                    glow={{ on: brand.lit, color: brand.accent, intensity: 1.7 }}
                    art={brand.lit ? 'aperture' : 'vinyl'}
                    artwork={
                        <span
                            style={{
                                fontFamily: DISPLAY,
                                fontWeight: 900,
                                fontSize: h * 0.42,
                                letterSpacing: '-0.01em',
                                textTransform: 'uppercase',
                                color: 'currentColor',
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {brand.name}
                        </span>
                    }
                />
            </div>

            {/* nameplate strip */}
            <div style={{ textAlign: 'center', transform: `translateY(${(1 - inS) * 20}px)` }}>
                <div
                    style={{
                        fontFamily: DISPLAY,
                        fontWeight: 900,
                        fontSize: 64,
                        letterSpacing: '-0.01em',
                        color: brand.accent,
                        textTransform: 'uppercase',
                    }}
                >
                    {brand.name}
                </div>
                <div
                    style={{
                        marginTop: 8,
                        fontFamily: DISPLAY,
                        fontWeight: 900,
                        fontSize: 24,
                        letterSpacing: '0.16em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.55)',
                    }}
                >
                    {brand.kind}
                </div>
                <div
                    style={{
                        marginTop: 16,
                        display: 'inline-block',
                        padding: '9px 20px',
                        borderRadius: 999,
                        border: `1px solid ${withAlpha(brand.accent, 0.6)}`,
                        background: withAlpha(brand.accent, 0.12),
                        fontFamily: FONT,
                        fontWeight: 600,
                        fontSize: 22,
                        letterSpacing: '0.02em',
                        color: '#e8f0f3',
                    }}
                >
                    {brand.spec}
                </div>
            </div>
        </AbsoluteFill>
    );
}
