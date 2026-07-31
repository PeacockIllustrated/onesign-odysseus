import React from 'react';
import { BRAND } from '../theme';

export type ArtKind = 'none' | 'aperture' | 'standoff' | 'vinyl';

export interface GlowSpec {
    on: boolean;
    color: string;
    intensity: number; // 0.2 – 3
}

/**
 * A convincing folded-aluminium fascia sign, built as a real CSS 3D cuboid
 * (preserve-3d) so it renders identically in headless Chromium — no WebGL.
 * The face carries the artwork; the four returns read as folded metal edges.
 * Supports aperture (cut-out), stand-off (raised) and vinyl (flat) artwork,
 * a day/night paint response, edge keyline glow, and a fold 1→0 unfold.
 */
export function SignPanel({
    widthPx,
    heightPx,
    depthPx = 34,
    color,
    rotY = -24,
    rotX = 8,
    fold = 1,
    night = false,
    glow = { on: false, color: '#ffffff', intensity: 1 },
    art = 'none',
    artwork,
    scale = 1,
}: {
    widthPx: number;
    heightPx: number;
    depthPx?: number;
    color: string;
    rotY?: number;
    rotX?: number;
    fold?: number;
    night?: boolean;
    glow?: GlowSpec;
    art?: ArtKind;
    artwork?: React.ReactNode;
    scale?: number;
}) {
    const faceShade = shade(color, night ? -0.42 : 0);
    const returnShade = shade(color, night ? -0.66 : -0.34);

    // Face paint — a soft top-left sheen over the base coat.
    const facePaint = `linear-gradient(135deg, ${shade(faceShade, 0.14)} 0%, ${faceShade} 46%, ${shade(faceShade, -0.12)} 100%)`;
    const returnPaint = `linear-gradient(180deg, ${shade(returnShade, 0.08)} 0%, ${returnShade} 100%)`;

    const foldAngle = 90 * fold; // returns rotate from flat (0) to up (90)

    // Keyline glow around the panel edge at night.
    const glowActive = night && glow.on;
    const glowBlur = 18 + glow.intensity * 22;
    const edgeGlow = glowActive
        ? `0 0 ${glowBlur}px ${withAlpha(glow.color, 0.7)}, 0 0 ${glowBlur * 2}px ${withAlpha(glow.color, 0.35)}`
        : night
          ? '0 40px 80px rgba(0,0,0,0.6)'
          : '0 50px 90px rgba(0,0,0,0.55)';

    // Artwork treatment by material + time of day.
    const artStyle = artworkStyle(art, night, glow, color);

    const half = { w: widthPx / 2, h: heightPx / 2, d: depthPx / 2 };

    return (
        <div
            style={{
                perspective: 2200,
                transform: `scale(${scale})`,
                transformStyle: 'preserve-3d',
            }}
        >
            <div
                style={{
                    position: 'relative',
                    width: widthPx,
                    height: heightPx,
                    transformStyle: 'preserve-3d',
                    transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
                }}
            >
                {/* FRONT FACE */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        transform: `translateZ(${half.d}px)`,
                        background: facePaint,
                        borderRadius: 6,
                        // Edge glow / drop shadow lives HERE (box-shadow) rather
                        // than as a filter on the preserve-3d parent — a filter
                        // there collapses the 3D context and hides the artwork.
                        boxShadow: glowActive
                            ? `inset 0 0 60px ${withAlpha(glow.color, 0.12)}, inset 0 1px 0 rgba(255,255,255,0.18), ${edgeGlow}`
                            : `inset 0 1px 0 rgba(255,255,255,0.22), inset 0 -20px 40px rgba(0,0,0,0.18), ${edgeGlow}`,
                        overflow: 'hidden',
                        backfaceVisibility: 'hidden',
                    }}
                >
                    {/* brushed sheen sweep */}
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            background:
                                'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.10) 46%, rgba(255,255,255,0.02) 54%, transparent 70%)',
                            mixBlendMode: 'screen',
                        }}
                    />
                </div>

                {/* ARTWORK LAYER — its own face, pushed 2px in front of the
                    front face so it always paints on top. Critically, the 3D
                    layer itself carries NO `filter`: a filter on a
                    translateZ'd element flattens it to z=0 (behind the opaque
                    face). The colour + drop-shadow/glow (`artStyle`) live on an
                    inner, non-3D wrapper instead, so the flattening is harmless. */}
                {artwork && (
                    <div
                        style={{
                            position: 'absolute',
                            inset: 0,
                            transform: `translateZ(${half.d + 2}px)`,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            backfaceVisibility: 'hidden',
                        }}
                    >
                        <div style={{ ...artStyle }}>{artwork}</div>
                    </div>
                )}

                {/* BACK */}
                <div
                    style={{
                        position: 'absolute',
                        inset: 0,
                        transform: `rotateY(180deg) translateZ(${half.d}px)`,
                        background: shade(returnShade, -0.1),
                        borderRadius: 6,
                    }}
                />

                {/* TOP return (folds up) */}
                <Return
                    w={widthPx}
                    d={depthPx}
                    paint={returnPaint}
                    transform={`translateY(-${half.h}px) rotateX(${90 - foldAngle + 90}deg)`}
                    origin="bottom"
                />
                {/* BOTTOM return */}
                <Return
                    w={widthPx}
                    d={depthPx}
                    paint={returnPaint}
                    transform={`translateY(${half.h}px) rotateX(-${foldAngle}deg)`}
                    origin="top"
                />
                {/* LEFT return */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: depthPx,
                        height: heightPx,
                        background: returnPaint,
                        transformOrigin: 'right center',
                        transform: `translateX(-${depthPx}px) rotateY(${foldAngle}deg)`,
                        borderRadius: 4,
                    }}
                />
                {/* RIGHT return */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        right: 0,
                        width: depthPx,
                        height: heightPx,
                        background: returnPaint,
                        transformOrigin: 'left center',
                        transform: `translateX(${depthPx}px) rotateY(-${foldAngle}deg)`,
                        borderRadius: 4,
                    }}
                />
            </div>
        </div>
    );
}

function Return({
    w,
    d,
    paint,
    transform,
    origin,
}: {
    w: number;
    d: number;
    paint: string;
    transform: string;
    origin: 'top' | 'bottom';
}) {
    return (
        <div
            style={{
                position: 'absolute',
                left: 0,
                [origin]: 0,
                width: w,
                height: d,
                background: paint,
                transformOrigin: `center ${origin}`,
                transform,
                borderRadius: 4,
            }}
        />
    );
}

function artworkStyle(
    art: ArtKind,
    night: boolean,
    glow: GlowSpec,
    faceColor: string,
): React.CSSProperties {
    if (art === 'aperture') {
        // Cut-out: at night the aperture is backlit and glows; by day it's a
        // dark recess.
        if (night) {
            const c = glow.on ? glow.color : '#fff6da';
            return {
                color: c,
                filter: `drop-shadow(0 0 ${8 + glow.intensity * 10}px ${withAlpha(c, 0.9)}) drop-shadow(0 0 ${20 + glow.intensity * 18}px ${withAlpha(c, 0.5)})`,
            };
        }
        return {
            color: shade(faceColor, -0.7),
            filter: 'drop-shadow(0 1px 1px rgba(255,255,255,0.15))',
        };
    }
    if (art === 'standoff') {
        // Raised polished letters casting a soft drop shadow off the face. At
        // night with the keyline on, the built-up letters read as halo-lit.
        if (night && glow.on) {
            return {
                color: shade(glow.color, 0.25),
                filter: `drop-shadow(1px 3px 2px rgba(0,0,0,0.6)) drop-shadow(0 0 ${10 + glow.intensity * 10}px ${withAlpha(glow.color, 0.75)})`,
            };
        }
        return {
            color: night ? '#d9dee1' : '#f3f5f6',
            filter: night
                ? 'drop-shadow(2px 4px 3px rgba(0,0,0,0.55))'
                : 'drop-shadow(3px 6px 4px rgba(0,0,0,0.4))',
        };
    }
    if (art === 'vinyl') {
        return {
            color: night ? shade(BRAND.accentGlow, -0.1) : BRAND.accentDark,
        };
    }
    return {};
}

// ── small colour utilities ────────────────────────────────────────────────

function clamp(n: number) {
    return Math.max(0, Math.min(255, Math.round(n)));
}
function hexToRgb(color: string): [number, number, number] {
    // Accept both '#rrggbb' / '#rgb' and 'rgb(r, g, b)' — mixHex() returns the
    // latter, and these utils get called on that result.
    const m = color.match(/rgba?\(([^)]+)\)/i);
    if (m) {
        const [r, g, b] = m[1].split(',').map((n) => parseFloat(n.trim()));
        return [r, g, b];
    }
    const h = color.replace('#', '');
    const v =
        h.length === 3
            ? h
                  .split('')
                  .map((c) => c + c)
                  .join('')
            : h;
    return [
        parseInt(v.slice(0, 2), 16),
        parseInt(v.slice(2, 4), 16),
        parseInt(v.slice(4, 6), 16),
    ];
}
/** amt > 0 lightens, < 0 darkens. */
function shade(hex: string, amt: number): string {
    const [r, g, b] = hexToRgb(hex);
    const t = amt < 0 ? 0 : 255;
    const p = Math.abs(amt);
    return `rgb(${clamp(r + (t - r) * p)}, ${clamp(g + (t - g) * p)}, ${clamp(b + (t - b) * p)})`;
}
function withAlpha(hex: string, a: number): string {
    const [r, g, b] = hexToRgb(hex);
    return `rgba(${r}, ${g}, ${b}, ${a})`;
}
