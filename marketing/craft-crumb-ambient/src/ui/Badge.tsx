import React from 'react';
import { useCurrentFrame } from 'remotion';
import { CC, withAlpha } from '../theme';
import { LOGO_SVG } from '../logoSvg';

// The circular Craft & Crumb badge (real logo, inlined so the loaded Bebas Neue
// applies to its live tagline). Powder-coated jet-black aluminium feel: a warm
// glow behind, a soft breathing scale, a specular light sweep that plays across
// the face, and a single warm glint orbiting the outer ring. Everything is
// driven by a loop phase so it runs forever with no seam.
//
// The original logo positions "COFFEE BAR" and "SANDO DELI" as two fixed-x text
// nodes tuned for the designer's exact font metrics; substituting Bebas Neue
// makes them overrun and collide. We drop both and inject one centred,
// self-fitting tagline (in viewBox space, so it scales with the badge) with the
// divider dot in the brand brown.
const TAGLINE = `<text x="170.08" y="265.2" text-anchor="middle" font-family="'Bebas Neue', sans-serif" font-weight="400" font-size="13.2" letter-spacing="2.15" fill="#fff">COFFEE BAR <tspan fill="#995c28" dx="1.5">·</tspan><tspan dx="1.5"> SANDO DELI</tspan></text>`;

const SVG_SIZED = LOGO_SVG.replace(
    '<svg ',
    '<svg style="width:100%;height:100%;display:block" ',
)
    .replace(/<text class="cls-3"[\s\S]*?<\/text>/, '')
    .replace(/<text class="cls-1"[\s\S]*?<\/text>/, '')
    .replace('</svg>', `${TAGLINE}</svg>`);

export function Badge({
    size,
    loop,
    breathe = true,
}: {
    size: number;
    loop: number;
    breathe?: boolean;
}) {
    const frame = useCurrentFrame();
    const t = (frame % loop) / loop; // 0..1
    const breath = breathe ? 1 + Math.sin(t * Math.PI * 2) * 0.012 : 1;

    // light sweep: a soft diagonal band that crosses the face and fades at both
    // ends of the loop so the wrap is invisible.
    const sweepPos = t; // 0..1 travel
    const sweepOpacity = Math.sin(t * Math.PI) * 0.5; // 0 at ends
    const sweepX = (sweepPos * 2 - 0.5) * size;

    // orbiting ring glint (continuous angle → seamless).
    const ang = t * Math.PI * 2 - Math.PI / 2;
    const ringR = size / 2 - size * 0.012;
    const gx = size / 2 + Math.cos(ang) * ringR;
    const gy = size / 2 + Math.sin(ang) * ringR;

    return (
        <div
            style={{
                position: 'relative',
                width: size,
                height: size,
                transform: `scale(${breath})`,
            }}
        >
            {/* warm ambient glow behind the disc */}
            <div
                style={{
                    position: 'absolute',
                    inset: -size * 0.28,
                    borderRadius: 999,
                    background: `radial-gradient(circle at 50% 50%, ${withAlpha(
                        CC.brownLit,
                        0.28,
                    )} 0%, ${withAlpha(CC.brown, 0.12)} 34%, rgba(0,0,0,0) 66%)`,
                    filter: 'blur(6px)',
                }}
            />
            {/* the disc, clipped so sweep + glint stay on the badge */}
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: 999,
                    overflow: 'hidden',
                    boxShadow: `0 30px 70px rgba(0,0,0,0.55), inset 0 2px 3px ${withAlpha(
                        CC.brownLit,
                        0.15,
                    )}`,
                }}
            >
                {/* the real logo */}
                <div
                    style={{ position: 'absolute', inset: 0 }}
                    dangerouslySetInnerHTML={{ __html: SVG_SIZED }}
                />
                {/* subtle top sheen (powder-coat catches light at the crown) */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        background:
                            'radial-gradient(70% 45% at 50% 0%, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0) 60%)',
                        mixBlendMode: 'screen',
                    }}
                />
                {/* specular light sweep */}
                <div
                    style={{
                        position: 'absolute',
                        top: -size * 0.3,
                        left: 0,
                        width: size * 0.55,
                        height: size * 1.6,
                        transform: `translateX(${sweepX}px) rotate(18deg)`,
                        background: `linear-gradient(90deg, rgba(255,255,255,0) 0%, ${withAlpha(
                            '#fff6ea',
                            0.5,
                        )} 50%, rgba(255,255,255,0) 100%)`,
                        opacity: sweepOpacity,
                        mixBlendMode: 'screen',
                        filter: 'blur(10px)',
                    }}
                />
            </div>
            {/* orbiting ring glint (outside overflow so it can bloom) */}
            <div
                style={{
                    position: 'absolute',
                    left: gx,
                    top: gy,
                    width: size * 0.03,
                    height: size * 0.03,
                    marginLeft: -size * 0.015,
                    marginTop: -size * 0.015,
                    borderRadius: 999,
                    background: '#fff7ec',
                    opacity: 0.9,
                    boxShadow: `0 0 ${size * 0.05}px ${size * 0.02}px ${withAlpha(
                        CC.brownLit,
                        0.8,
                    )}`,
                }}
            />
        </div>
    );
}
