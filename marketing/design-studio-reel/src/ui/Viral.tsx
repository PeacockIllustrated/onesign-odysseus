import React from 'react';
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
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
 * A real fabricated sign board: the client's actual logo SVG mounted on a
 * painted/brushed panel, raised off the wall on visible stand-off fixings, lit
 * where the real sign is illuminated. Sells signage quality + the fixing method.
 */
export function SignBoard({
    logo,
    face,
    accent,
    lit,
    width = 860,
    height = 470,
}: {
    logo: string;
    face: string;
    accent: string;
    lit: boolean;
    width?: number;
    height?: number;
}) {
    const isDark = luminance(face) < 0.4;
    const facePaint = `linear-gradient(160deg, ${shade(face, 0.06)}, ${face} 55%, ${shade(face, -0.08)})`;
    const stud = 26;
    const inset = 34;
    const studPositions = [
        { top: inset, left: inset },
        { top: inset, right: inset },
        { bottom: inset, left: inset },
        { bottom: inset, right: inset },
    ];
    return (
        <div style={{ perspective: 1600 }}>
            <div
                style={{
                    position: 'relative',
                    width,
                    height,
                    transform: 'rotateX(6deg) rotateY(-11deg)',
                    transformStyle: 'preserve-3d',
                }}
            >
                {/* wall shadow behind (stand-off depth) */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 16,
                        transform: 'translate(26px, 34px) translateZ(-40px)',
                        background: 'rgba(0,0,0,0.55)',
                        filter: 'blur(26px)',
                    }}
                />
                {/* the panel */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        borderRadius: 16,
                        background: facePaint,
                        boxShadow: lit
                            ? `0 0 70px ${withAlpha(accent, 0.6)}, inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -30px 60px rgba(0,0,0,0.12)`
                            : 'inset 0 2px 0 rgba(255,255,255,0.5), inset 0 -30px 60px rgba(0,0,0,0.14)',
                        overflow: 'hidden',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    {/* brushed sheen */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                                'linear-gradient(105deg, transparent 34%, rgba(255,255,255,0.16) 48%, transparent 62%)',
                            mixBlendMode: isDark ? 'screen' : 'soft-light',
                        }}
                    />
                    {/* the real client logo */}
                    <Img
                        src={staticFile(logo)}
                        style={{
                            width: '72%',
                            height: '68%',
                            objectFit: 'contain',
                            filter: lit
                                ? `drop-shadow(0 0 18px ${withAlpha(accent, 0.55)})`
                                : 'drop-shadow(2px 5px 5px rgba(0,0,0,0.28))',
                        }}
                    />
                </div>
                {/* stand-off fixing studs */}
                {studPositions.map((p, i) => (
                    <div
                        key={i}
                        style={{
                            position: 'absolute',
                            ...p,
                            width: stud,
                            height: stud,
                            borderRadius: 999,
                            transform: 'translateZ(6px)',
                            background:
                                'radial-gradient(circle at 35% 30%, #ffffff, #c7ccd0 45%, #7c848a 80%)',
                            boxShadow: '0 3px 6px rgba(0,0,0,0.5)',
                        }}
                    />
                ))}
            </div>
        </div>
    );
}

/**
 * The client's actual logo mounted on a folded-aluminium fascia panel — the
 * exact tray-sign construction Onesign fabricates for a shopfront. Real face
 * colour, folded returns reading as brushed metal edges, and a soft halo behind
 * the lit brands so illuminated signs glow on the dark presentation stage while
 * the face colour stays true.
 */
function SignPanelBrand({ brand }: { brand: RealBrand }) {
    const w = 820;
    const h = 470;
    return (
        <div style={{ position: 'relative', display: 'grid', placeItems: 'center' }}>
            {/* illuminated halo behind the panel (day-mode stage, so we add our
                own glow rather than SignPanel's night keyline) */}
            {brand.lit && (
                <div
                    style={{
                        position: 'absolute',
                        width: w * 1.02,
                        height: h * 1.02,
                        borderRadius: 40,
                        background: `radial-gradient(closest-side, ${withAlpha(brand.accent, 0.55)}, ${withAlpha(brand.accent, 0)} 72%)`,
                        filter: 'blur(46px)',
                        transform: 'translateY(10px)',
                    }}
                />
            )}
            <SignPanel
                widthPx={w}
                heightPx={h}
                depthPx={42}
                color={brand.face}
                rotY={-19}
                rotX={7}
                art="none"
                artwork={
                    <Img
                        src={staticFile(brand.logo)}
                        style={{
                            width: w * 0.72,
                            height: h * 0.64,
                            objectFit: 'contain',
                            filter: brand.lit
                                ? `drop-shadow(0 0 16px ${withAlpha(brand.accent, 0.5)})`
                                : 'drop-shadow(2px 5px 5px rgba(0,0,0,0.28))',
                        }}
                    />
                }
            />
        </div>
    );
}

/**
 * One real-brand case-study card: the client's actual sign (logo on a folded
 * aluminium fascia panel) + a Gilroy nameplate and two chips calling out the
 * MATERIAL and the FIXING method. Entrance varies by index.
 */
export function MontageCard({
    brand,
    index,
}: {
    brand: RealBrand;
    index: number;
    dur?: number;
}) {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const inS = spring({ frame, fps, config: { damping: 14, stiffness: 240, mass: 0.6 } });
    const settle = interpolate(frame, [0, 4, 9], [1, 0.965, 1], { extrapolateRight: 'clamp' });

    const variant = index % 3;
    let enter = '';
    if (variant === 0) enter = `translateX(${(1 - inS) * -170}px)`;
    else if (variant === 1) enter = `perspective(1400px) rotateY(${(1 - inS) * 55}deg)`;
    else enter = `translateY(${(1 - inS) * 90}px)`;

    return (
        <AbsoluteFill
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 52,
                opacity: Math.min(1, inS * 1.6),
            }}
        >
            <div style={{ transform: `${enter} scale(${settle})` }}>
                <SignPanelBrand brand={brand} />
            </div>

            <div style={{ textAlign: 'center', transform: `translateY(${(1 - inS) * 20}px)` }}>
                <div
                    style={{
                        fontFamily: DISPLAY,
                        fontWeight: 800,
                        fontSize: 60,
                        letterSpacing: '-0.01em',
                        color: brand.accent,
                    }}
                >
                    {brand.name}
                </div>
                <div
                    style={{
                        marginTop: 6,
                        fontFamily: DISPLAY,
                        fontWeight: 800,
                        fontSize: 22,
                        letterSpacing: '0.14em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.5)',
                    }}
                >
                    {brand.kind}
                </div>
                {/* material + fixing capability chips */}
                <div style={{ marginTop: 20, display: 'flex', gap: 14, justifyContent: 'center' }}>
                    <Chip label={brand.material} accent={brand.accent} />
                    <Chip label={brand.fixing} accent={brand.accent} pin />
                </div>
            </div>
        </AbsoluteFill>
    );
}

function Chip({ label, accent, pin = false }: { label: string; accent: string; pin?: boolean }) {
    return (
        <span
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 20px',
                borderRadius: 999,
                border: `1px solid ${withAlpha(accent, 0.55)}`,
                background: withAlpha(accent, 0.12),
                fontFamily: DISPLAY,
                fontWeight: 600,
                fontSize: 21,
                letterSpacing: '0.01em',
                color: '#eef4f5',
            }}
        >
            <span
                style={{
                    width: 12,
                    height: 12,
                    borderRadius: pin ? 999 : 3,
                    background: pin
                        ? 'radial-gradient(circle at 35% 30%, #fff, #b9bec2 60%, #7c848a)'
                        : accent,
                    boxShadow: pin ? '0 1px 2px rgba(0,0,0,0.5)' : 'none',
                }}
            />
            {label}
        </span>
    );
}

// small colour helpers
function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
}
function luminance(hex: string): number {
    const [r, g, b] = hexToRgb(hex);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
function shade(hex: string, amt: number): string {
    const [r, g, b] = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    const c = (x: number) => Math.round(x + (t - x) * p);
    return `rgb(${c(r)}, ${c(g)}, ${c(b)})`;
}
