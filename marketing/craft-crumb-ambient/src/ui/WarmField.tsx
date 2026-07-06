import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { CC, withAlpha } from '../theme';

// The ad-set's ambient background — matched to the brand reference: a warm
// directional wash (cool jet-black upper-left → coffee-amber lower-right) with
// faint TOPOGRAPHIC / tree-ring contour lines nested around a point off the
// upper-left, slowly breathing. The contours share one angular wobble function
// so they nest cleanly (like elevation contours of a smooth height field) and
// never cross. Every fifth ring is an "index contour" (a touch heavier), the
// detail that sells the map look. Driven by the global frame so it flows
// continuously under the whole sequence.

const KY = 0.86; // vertical squash → contours read slightly elliptical, with depth

function ringPath(cx: number, cy: number, R: number, amp: number, g: (t: number) => number): string {
    const steps = 88;
    let d = '';
    for (let i = 0; i <= steps; i++) {
        const th = (i / steps) * Math.PI * 2;
        const rr = R + amp * g(th);
        const x = cx + Math.cos(th) * rr;
        const y = cy + Math.sin(th) * rr * KY;
        d += (i === 0 ? 'M' : 'L') + ` ${x.toFixed(1)} ${y.toFixed(1)}`;
    }
    return d + ' Z';
}

export function WarmField() {
    const frame = useCurrentFrame();
    const { width, height } = useVideoConfig();

    // slow breathing warm pool, lower-right
    const tp = frame / 340;
    const px = 78 + Math.sin(tp * Math.PI * 2) * 3;
    const py = 74 + Math.cos(tp * Math.PI * 2) * 3;

    // concentric contour field, centred just off the upper-left, drifting slowly
    const t = frame * 0.02;
    const cx = width * 0.15 + Math.sin(frame * 0.008) * 26;
    const cy = height * 0.04 + Math.cos(frame * 0.006) * 18;
    const g = (th: number) =>
        Math.sin(th * 2 + t * 0.6) * 0.55 +
        Math.sin(th * 3 - t * 0.42 + 1.3) * 0.3 +
        Math.sin(th * 5 + t * 0.3) * 0.18;

    const SP = 70; // ring spacing
    const N = Math.ceil(Math.hypot(width, height * 1.25) / SP) + 3;
    const rings = [];
    for (let i = 1; i <= N; i++) {
        const R = i * SP;
        const amp = Math.min(19, R * 0.22);
        const index = i % 5 === 0;
        rings.push({ d: ringPath(cx, cy, R, amp, g), index, i });
    }

    return (
        <AbsoluteFill>
            {/* base directional wash */}
            <AbsoluteFill
                style={{
                    background: `linear-gradient(122deg, #07080b 22%, #1a130c 52%, ${CC.brownDeep} 82%, #9a6029 100%)`,
                }}
            />
            {/* warm pool lower-right */}
            <AbsoluteFill
                style={{
                    background: `radial-gradient(56% 60% at ${px}% ${py}%, ${withAlpha(
                        CC.brownLit,
                        0.4,
                    )} 0%, ${withAlpha(CC.brown, 0.12)} 42%, rgba(0,0,0,0) 72%)`,
                }}
            />
            {/* topographic contour lines */}
            <AbsoluteFill style={{ pointerEvents: 'none' }}>
                <svg width="100%" height="100%" style={{ display: 'block' }}>
                    {rings.map((r) => (
                        <path
                            key={r.i}
                            d={r.d}
                            fill="none"
                            stroke={r.i % 7 === 0 ? CC.brownLit : CC.cream}
                            strokeWidth={r.index ? 1.9 : 1.1}
                            opacity={r.index ? 0.1 : 0.055}
                        />
                    ))}
                </svg>
            </AbsoluteFill>
            {/* vignette */}
            <AbsoluteFill
                style={{ boxShadow: 'inset 0 0 380px 130px rgba(0,0,0,0.58)', pointerEvents: 'none' }}
            />
        </AbsoluteFill>
    );
}
