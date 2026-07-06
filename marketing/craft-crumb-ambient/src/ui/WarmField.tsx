import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CC, withAlpha } from '../theme';

// The ad-set's ambient background: a warm directional wash (deep jet-black
// upper-left → warm coffee-amber lower-right, per the reference) with faint
// topographic contour lines drifting slowly across it, a soft warm pool that
// breathes, and a vignette. Driven by the global frame so it flows continuously
// under the whole sequence — the through-line that makes the ads feel like one
// living board rather than separate slides.

function contourPath(baseY: number, amp: number, freq: number, phase: number, width: number): string {
    const step = 24;
    let d = '';
    for (let x = -60; x <= width + 60; x += step) {
        const y = baseY + Math.sin(x * freq + phase) * amp;
        d += x === -60 ? `M ${x} ${y.toFixed(1)}` : ` L ${x} ${y.toFixed(1)}`;
    }
    return d;
}

export function WarmField() {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();

    // slow breathing warm pool (lower-right, as in the reference)
    const t = frame / 300;
    const px = 76 + Math.sin(t * Math.PI * 2) * 3;
    const py = 78 + Math.cos(t * Math.PI * 2) * 3;

    const lines = React.useMemo(() => {
        const rnd = (n: number) => {
            const x = Math.sin(n * 91.7 + 47.3) * 6151.7;
            return x - Math.floor(x);
        };
        return Array.from({ length: 16 }, (_, i) => ({
            baseY: -60 + (i / 15) * (height + 120),
            amp: 26 + rnd(i + 3) * 44,
            freq: 0.0016 + rnd(i + 9) * 0.0018,
            phase: rnd(i + 2) * Math.PI * 2,
            speed: (0.006 + rnd(i + 5) * 0.01) * (rnd(i + 7) > 0.5 ? 1 : -1),
            drift: 10 + rnd(i + 11) * 22,
            op: 0.05 + rnd(i + 13) * 0.06,
        }));
    }, [height]);

    return (
        <AbsoluteFill>
            {/* base directional gradient */}
            <AbsoluteFill
                style={{
                    background: `linear-gradient(118deg, ${CC.inkDeep} 26%, #241608 60%, ${CC.brownDeep} 86%, #8a5626 100%)`,
                }}
            />
            {/* warm pool lower-right */}
            <AbsoluteFill
                style={{
                    background: `radial-gradient(58% 62% at ${px}% ${py}%, ${withAlpha(
                        CC.brownLit,
                        0.42,
                    )} 0%, ${withAlpha(CC.brown, 0.14)} 40%, rgba(0,0,0,0) 72%)`,
                }}
            />
            {/* topographic contour lines */}
            <AbsoluteFill style={{ pointerEvents: 'none' }}>
                <svg width="100%" height="100%" style={{ display: 'block' }}>
                    {lines.map((l, i) => {
                        const yOff = Math.sin(frame * l.speed + l.phase) * l.drift;
                        return (
                            <path
                                key={i}
                                d={contourPath(l.baseY + yOff, l.amp, l.freq, l.phase + frame * l.speed, width)}
                                fill="none"
                                stroke={i % 3 === 0 ? CC.brownLit : CC.cream}
                                strokeWidth={1.4}
                                opacity={l.op}
                            />
                        );
                    })}
                </svg>
            </AbsoluteFill>
            {/* vignette */}
            <AbsoluteFill
                style={{
                    boxShadow: 'inset 0 0 360px 120px rgba(0,0,0,0.55)',
                    pointerEvents: 'none',
                }}
            />
        </AbsoluteFill>
    );
}
