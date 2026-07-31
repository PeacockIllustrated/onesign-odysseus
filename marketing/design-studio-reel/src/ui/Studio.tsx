import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BRAND, FONT, MONO, stageBackground } from '../theme';
import { OnesignWordmark } from './Logo';
import { ArrowRight, Check, HelpCircle, Moon, Send, Sun } from './Icons';

/** Full-bleed cinematic stage. `nightGlow` (0–1) blooms an ice ambient behind
 *  the sign for the night beat, so the stage reads as lit BY the sign. */
export function Stage({
    night,
    nightGlow = 0,
    children,
}: {
    night: boolean;
    nightGlow?: number;
    children?: React.ReactNode;
}) {
    return (
        <AbsoluteFill style={{ background: stageBackground(night) }}>
            {nightGlow > 0 && (
                <AbsoluteFill
                    style={{
                        background: `radial-gradient(46% 34% at 50% 46%, ${BRAND.accentGlow} 0%, transparent 70%)`,
                        opacity: 0.18 * nightGlow,
                        filter: 'blur(20px)',
                    }}
                />
            )}
            {children}
            {/* soft vignette */}
            <AbsoluteFill
                style={{
                    boxShadow: 'inset 0 0 340px 60px rgba(0,0,0,0.55)',
                    pointerEvents: 'none',
                }}
            />
        </AbsoluteFill>
    );
}

/** Top bar: Onesign mark + eyebrow/title (left), view + day/night (right). */
export function TopBar({
    title,
    night,
    view = '3D',
    showHelp = true,
    dayNightT,
    opacity = 1,
}: {
    title: string;
    night: boolean;
    view?: '3D' | 'Unfold';
    showHelp?: boolean;
    /** 0 day → 1 night, for animating the flick. Defaults from `night`. */
    dayNightT?: number;
    opacity?: number;
}) {
    return (
        <div
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                padding: '46px 44px 0',
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                opacity,
            }}
        >
            <div>
                <OnesignWordmark height={30} color="white" />
                <p
                    style={{
                        margin: '26px 0 0',
                        fontFamily: FONT,
                        fontSize: 20,
                        fontWeight: 600,
                        letterSpacing: '0.3em',
                        textTransform: 'uppercase',
                        color: 'rgba(255,255,255,0.45)',
                    }}
                >
                    Design your sign
                </p>
                <h1
                    style={{
                        margin: '8px 0 0',
                        fontFamily: FONT,
                        fontSize: 40,
                        fontWeight: 600,
                        letterSpacing: '-0.01em',
                        color: '#fff',
                    }}
                >
                    {title}
                </h1>
                {showHelp && (
                    <span
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 8,
                            marginTop: 14,
                            fontFamily: FONT,
                            fontSize: 20,
                            color: 'rgba(255,255,255,0.55)',
                        }}
                    >
                        <HelpCircle size={20} color="rgba(255,255,255,0.55)" /> Show me how
                    </span>
                )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <ViewSwitch view={view} />
                <DayNightSwitch t={dayNightT ?? (night ? 1 : 0)} />
            </div>
        </div>
    );
}

export function ViewSwitch({ view }: { view: '3D' | 'Unfold' }) {
    return (
        <div
            style={{
                display: 'flex',
                gap: 6,
                padding: 6,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.25)',
                background: 'rgba(12,17,20,0.6)',
                backdropFilter: 'blur(10px)',
            }}
        >
            {(['3D', 'Unfold'] as const).map((k) => {
                const active = k === view;
                return (
                    <span
                        key={k}
                        style={{
                            padding: '10px 20px',
                            borderRadius: 999,
                            fontFamily: FONT,
                            fontSize: 20,
                            fontWeight: 600,
                            letterSpacing: '0.02em',
                            color: active ? BRAND.onAccent : 'rgba(255,255,255,0.75)',
                            background: active ? BRAND.accentGlow : 'transparent',
                        }}
                    >
                        {k}
                    </span>
                );
            })}
        </div>
    );
}

/** The marquee day/night switch. `t`: 0 day → 1 night. */
export function DayNightSwitch({ t }: { t: number }) {
    const trackW = 118;
    const knob = 46;
    const pad = 6;
    const x = pad + t * (trackW - knob - pad * 2);
    const dayCol = '#f4c56a';
    return (
        <div
            style={{
                position: 'relative',
                width: trackW,
                height: knob + pad * 2,
                borderRadius: 999,
                background: `linear-gradient(90deg, ${mix('#2a3a42', '#0a1014', t)}, ${mix('#22323a', '#050a0d', t)})`,
                border: '1px solid rgba(255,255,255,0.18)',
                boxShadow: 'inset 0 2px 8px rgba(0,0,0,0.5)',
            }}
        >
            <div style={{ position: 'absolute', top: 15, left: 16, opacity: 1 - t }}>
                <Sun size={26} color={dayCol} />
            </div>
            <div style={{ position: 'absolute', top: 15, right: 16, opacity: t }}>
                <Moon size={24} color={BRAND.accentGlow} />
            </div>
            <div
                style={{
                    position: 'absolute',
                    top: pad,
                    left: x,
                    width: knob,
                    height: knob,
                    borderRadius: 999,
                    background: mix('#ffffff', '#dbe9ee', t),
                    boxShadow: t > 0.5 ? `0 0 16px ${BRAND.accentGlow}` : '0 3px 8px rgba(0,0,0,0.4)',
                }}
            />
        </div>
    );
}

/** Spec HUD pill, bottom-right. */
export function SpecHud({
    w,
    h,
    d,
    material = 'Aluminium',
    opacity = 1,
}: {
    w: number;
    h: number;
    d: number;
    material?: string;
    opacity?: number;
}) {
    return (
        <div
            style={{
                position: 'absolute',
                right: 44,
                bottom: 44,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: 6,
                opacity,
            }}
        >
            <span
                style={{
                    padding: '10px 20px',
                    borderRadius: 999,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.3)',
                    backdropFilter: 'blur(10px)',
                    fontFamily: MONO,
                    fontSize: 24,
                    fontWeight: 600,
                    color: 'rgba(255,255,255,0.88)',
                    fontVariantNumeric: 'tabular-nums',
                }}
            >
                {w} × {h} × {d} mm
            </span>
            <span
                style={{
                    fontFamily: FONT,
                    fontSize: 18,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.4)',
                    paddingRight: 6,
                }}
            >
                {material}
            </span>
        </div>
    );
}

const STEPS = ['Size', 'Artwork', 'Light', 'Send'] as const;

export function Stepper({ current }: { current: number }) {
    return (
        <ol
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                listStyle: 'none',
                margin: 0,
                padding: 0,
            }}
        >
            {STEPS.map((label, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <li
                        key={label}
                        style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: 8,
                        }}
                    >
                        <span
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 44,
                                height: 44,
                                borderRadius: 999,
                                fontFamily: FONT,
                                fontSize: 20,
                                fontWeight: 700,
                                color: active || done ? '#fff' : '#8b9296',
                                background: active
                                    ? BRAND.accent
                                    : done
                                      ? BRAND.accentGlow
                                      : '#eef1f3',
                            }}
                        >
                            {done ? <Check size={22} color="#fff" /> : i + 1}
                        </span>
                        <span
                            style={{
                                fontFamily: FONT,
                                fontSize: 17,
                                fontWeight: 600,
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                color: active ? '#2b3236' : '#9aa1a5',
                            }}
                        >
                            {label}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}

/**
 * The frosted white wizard sheet anchored to the bottom. `slideT` (0→1) drives
 * the slide-up entrance. Fixed height; the footer holds the primary action.
 */
export function WizardDock({
    current,
    intro,
    children,
    footer,
    slideT = 1,
    height = 680,
}: {
    current: number;
    intro?: string;
    children?: React.ReactNode;
    footer?: React.ReactNode;
    slideT?: number;
    height?: number;
}) {
    return (
        <div
            style={{
                position: 'absolute',
                left: 18,
                right: 18,
                bottom: 18,
                height,
                borderRadius: 34,
                border: '1px solid rgba(255,255,255,0.6)',
                background: 'rgba(255,255,255,0.9)',
                backdropFilter: 'blur(28px)',
                boxShadow: '0 30px 80px rgba(0,0,0,0.5)',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                transform: `translateY(${(1 - slideT) * (height + 40)}px)`,
                opacity: slideT,
            }}
        >
            {/* stepper header + drag handle */}
            <div
                style={{
                    padding: '20px 26px 18px',
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                }}
            >
                <div
                    style={{
                        width: 66,
                        height: 8,
                        borderRadius: 999,
                        background: '#d4d4d4',
                        margin: '0 auto 18px',
                    }}
                />
                <Stepper current={current} />
            </div>
            {/* body */}
            <div style={{ flex: 1, padding: '22px 30px', overflow: 'hidden' }}>
                {intro && (
                    <p
                        style={{
                            margin: '0 0 20px',
                            fontFamily: FONT,
                            fontSize: 23,
                            lineHeight: 1.4,
                            color: '#71797d',
                        }}
                    >
                        {intro}
                    </p>
                )}
                {children}
            </div>
            {/* footer */}
            {footer && (
                <div
                    style={{
                        padding: '18px 26px',
                        borderTop: '1px solid rgba(0,0,0,0.06)',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                    }}
                >
                    {footer}
                </div>
            )}
        </div>
    );
}

/** Footer "Next" primary button (teal). */
export function NextButton({
    label = 'Next',
    withArrow = true,
    full = false,
    icon,
}: {
    label?: string;
    withArrow?: boolean;
    full?: boolean;
    icon?: 'send' | null;
}) {
    return (
        <button
            style={{
                minHeight: 64,
                flex: full ? 1 : undefined,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 10,
                padding: '0 30px',
                borderRadius: 16,
                border: 'none',
                background: BRAND.accent,
                color: '#fff',
                fontFamily: FONT,
                fontSize: 24,
                fontWeight: 600,
                boxShadow: '0 6px 16px rgba(78,126,140,0.4)',
            }}
        >
            {icon === 'send' && <Send size={24} color="#fff" />}
            {label}
            {withArrow && <ArrowRight size={24} color="#fff" />}
        </button>
    );
}

export function BackButton() {
    return (
        <button
            style={{
                minHeight: 64,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 26px',
                borderRadius: 16,
                border: '1px solid #d4d4d4',
                background: 'transparent',
                color: '#525a5e',
                fontFamily: FONT,
                fontSize: 23,
                fontWeight: 500,
            }}
        >
            <ArrowRight size={22} color="#525a5e" strokeWidth={2.2} /> Back
        </button>
    );
}

/** An on-screen pointer that mimics a real interaction. */
export function Cursor({
    x,
    y,
    press = 0,
}: {
    x: number;
    y: number;
    press?: number;
}) {
    return (
        <div
            style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: `scale(${1 - press * 0.16})`,
                transformOrigin: '4px 4px',
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.5))',
                pointerEvents: 'none',
                zIndex: 60,
            }}
        >
            {press > 0 && (
                <div
                    style={{
                        position: 'absolute',
                        left: -20,
                        top: -20,
                        width: 52,
                        height: 52,
                        borderRadius: 999,
                        border: `3px solid ${BRAND.accentGlow}`,
                        opacity: press * (1 - press) * 4,
                        transform: `scale(${0.5 + press})`,
                    }}
                />
            )}
            <svg width="42" height="42" viewBox="0 0 24 24" fill="none">
                <path
                    d="M5 3l14 8-6 1.4L9.6 18 5 3Z"
                    fill="#fff"
                    stroke="#0c1114"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                />
            </svg>
        </div>
    );
}

/** A small floating hint chip over the stage. */
export function Nudge({
    children,
    opacity = 1,
    top = 360,
}: {
    children: React.ReactNode;
    opacity?: number;
    top?: number;
}) {
    return (
        <div
            style={{
                position: 'absolute',
                top,
                left: 0,
                right: 0,
                display: 'flex',
                justifyContent: 'center',
                opacity,
            }}
        >
            <div
                style={{
                    maxWidth: 620,
                    padding: '16px 26px',
                    borderRadius: 18,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(0,0,0,0.4)',
                    backdropFilter: 'blur(12px)',
                    fontFamily: FONT,
                    fontSize: 24,
                    color: 'rgba(255,255,255,0.8)',
                    textAlign: 'center',
                }}
            >
                {children}
            </div>
        </div>
    );
}

// tiny colour mixer for the switch
function mix(a: string, b: string, t: number): string {
    const pa = hx(a);
    const pb = hx(b);
    const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
    const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
    const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
    return `rgb(${r},${g},${bl})`;
}
function hx(h: string): [number, number, number] {
    const s = h.replace('#', '');
    return [
        parseInt(s.slice(0, 2), 16),
        parseInt(s.slice(2, 4), 16),
        parseInt(s.slice(4, 6), 16),
    ];
}
