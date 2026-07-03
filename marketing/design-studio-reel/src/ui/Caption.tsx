import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, FONT } from '../theme';
import { ramp } from './anim';
import { EASE } from '../theme';

export interface CaptionLine {
    text: string;
    /** Words (exact, case-insensitive) painted in the ice-glow accent. */
    accent?: string[];
    /** Accent words that also get a soft glow (use for words about light). */
    glow?: string[];
}

/**
 * The frontmost broadcast caption layer. Masked slot-machine line reveal,
 * bottom-third-safe, brand-accented key words. Auto-exits before the scene
 * ends (fade + lift). Timings in local scene frames.
 */
export function Caption({
    lines,
    startF = 4,
    stagger = 3,
    size = 92,
    align = 'center',
    bottom = 470,
}: {
    lines: CaptionLine[];
    startF?: number;
    stagger?: number;
    size?: number;
    align?: 'center' | 'left';
    /** Distance of the caption block's baseline from the canvas bottom (px). */
    bottom?: number;
}) {
    const frame = useCurrentFrame();
    const { durationInFrames } = useVideoConfig();
    const exitStart = durationInFrames - 10;
    const exit = ramp(frame, exitStart, durationInFrames, EASE.inOut);

    return (
        <div
            style={{
                position: 'absolute',
                left: align === 'center' ? 0 : 90,
                right: align === 'center' ? 0 : undefined,
                bottom,
                display: 'flex',
                flexDirection: 'column',
                alignItems: align === 'center' ? 'center' : 'flex-start',
                gap: size * 0.12,
                padding: '0 70px',
                opacity: 1 - exit,
                transform: `translateY(${exit * -12}px)`,
                pointerEvents: 'none',
            }}
        >
            {lines.map((ln, i) => {
                const at = startF + i * stagger;
                const t = ramp(frame, at, at + 12, EASE.out);
                return (
                    <div
                        key={i}
                        style={{
                            overflow: 'hidden',
                            paddingBottom: size * 0.06,
                        }}
                    >
                        <div
                            style={{
                                fontFamily: FONT,
                                fontWeight: 700,
                                fontSize: size,
                                lineHeight: 1.02,
                                letterSpacing: '-0.02em',
                                color: BRAND.light,
                                textAlign: align,
                                textShadow: '0 10px 40px rgba(0,0,0,0.55)',
                                transform: `translateY(${(1 - t) * (size * 0.34)}px)`,
                                opacity: t,
                                maxWidth: 940,
                                whiteSpace: 'normal',
                            }}
                        >
                            {renderWords(ln)}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function renderWords(ln: CaptionLine): React.ReactNode {
    const accent = new Set((ln.accent ?? []).map((w) => norm(w)));
    const glow = new Set((ln.glow ?? []).map((w) => norm(w)));
    const parts = ln.text.split(/(\s+)/);
    return parts.map((p, i) => {
        if (/^\s+$/.test(p)) return <span key={i}>{p}</span>;
        const key = norm(p);
        const isAccent = accent.has(key) || glow.has(key);
        const isGlow = glow.has(key);
        return (
            <span
                key={i}
                style={{
                    color: isAccent ? BRAND.accentGlow : undefined,
                    textShadow: isGlow
                        ? `0 0 18px ${BRAND.accentGlow}`
                        : undefined,
                }}
            >
                {p}
            </span>
        );
    });
}

function norm(w: string): string {
    return w.toLowerCase().replace(/[.,!?—·]/g, '');
}
