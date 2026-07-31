import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, CONDENSED } from '../theme';
import { ramp } from './anim';
import { EASE } from '../theme';

export interface CaptionLine {
    text: string;
    /** Words (case-insensitive) painted ice-glow. */
    accent?: string[];
    /** Words (case-insensitive) filled with the teal→ice gradient + edge light. */
    gradient?: string[];
}

/**
 * Bold Anton kinetic caption — words SLAM in one by one (spring: translateY +
 * scale + fade), the load-bearing word painted ice-glow or a teal→ice gradient
 * so the type itself reads as lit brushed aluminium. Uppercase, tight leading,
 * cropping toward the safe area. Auto-exits before the scene ends.
 */
export function Caption({
    lines,
    startF = 4,
    stagger = 2,
    size = 96,
    align = 'center',
    bottom = 470,
}: {
    lines: CaptionLine[];
    startF?: number;
    stagger?: number;
    size?: number;
    align?: 'center' | 'left';
    bottom?: number;
}) {
    const frame = useCurrentFrame();
    const { durationInFrames, fps } = useVideoConfig();
    const exitStart = durationInFrames - 9;
    const exit = ramp(frame, exitStart, durationInFrames, EASE.inOut);

    // global word index so the stagger flows across lines
    let wordIdx = 0;

    return (
        <div
            style={{
                position: 'absolute',
                left: align === 'center' ? 0 : 80,
                right: align === 'center' ? 0 : undefined,
                bottom,
                display: 'flex',
                flexDirection: 'column',
                alignItems: align === 'center' ? 'center' : 'flex-start',
                gap: size * 0.16,
                padding: '0 52px',
                opacity: 1 - exit,
                transform: `translateY(${exit * -14}px)`,
                pointerEvents: 'none',
            }}
        >
            {lines.map((ln, li) => {
                const accent = new Set((ln.accent ?? []).map(norm));
                const grad = new Set((ln.gradient ?? []).map(norm));
                const words = ln.text.split(/\s+/).filter(Boolean);
                return (
                    <div
                        key={li}
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            justifyContent:
                                align === 'center' ? 'center' : 'flex-start',
                            gap: `0 ${size * 0.3}px`,
                            lineHeight: 0.9,
                        }}
                    >
                        {words.map((w, wi) => {
                            const at = startF + wordIdx * stagger;
                            wordIdx += 1;
                            const s = spring({
                                frame: frame - at,
                                fps,
                                config: { damping: 12, stiffness: 200, mass: 0.7 },
                            });
                            const key = norm(w);
                            const isAccent = accent.has(key);
                            const isGrad = grad.has(key);
                            const over = isAccent || isGrad ? 1.06 : 1;
                            return (
                                <span
                                    key={wi}
                                    style={{
                                        display: 'inline-block',
                                        fontFamily: CONDENSED,
                                        fontWeight: 400,
                                        fontSize: size * 1.16,
                                        letterSpacing: '0.003em',
                                        textTransform: 'uppercase',
                                        transform: `translateY(${(1 - s) * 46}px) scale(${(0.9 + s * 0.1) * over})`,
                                        opacity: Math.min(1, s * 1.4),
                                        ...wordPaint(isAccent, isGrad),
                                    }}
                                >
                                    {w}
                                </span>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
}

function wordPaint(isAccent: boolean, isGrad: boolean): React.CSSProperties {
    if (isGrad) {
        return {
            background: `linear-gradient(180deg, ${BRAND.accent} 0%, ${BRAND.accentGlow} 92%)`,
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            filter: `drop-shadow(0 2px 0 rgba(255,255,255,0.25)) drop-shadow(0 12px 34px rgba(0,0,0,0.5))`,
        };
    }
    if (isAccent) {
        return {
            color: BRAND.accentGlow,
            textShadow: `0 0 30px ${BRAND.accentGlow}, 0 0 12px ${BRAND.accentGlow}, 0 8px 30px rgba(0,0,0,0.5)`,
        };
    }
    return {
        color: BRAND.light,
        textShadow: '0 10px 34px rgba(0,0,0,0.6)',
    };
}

function norm(w: string): string {
    return w.toLowerCase().replace(/[.,!?—·:→?]/g, '');
}
