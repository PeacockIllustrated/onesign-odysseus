import React from 'react';
import { CC } from '../theme';

// A faint, desaturated fractal-noise tile — clipped to the glyphs it gives the
// type a subtle printed/inked texture instead of a glassy-clean fill. Kept low
// so it reads as "not too crisp", never as dirt.
const NOISE =
    'data:image/svg+xml,' +
    encodeURIComponent(
        "<svg xmlns='http://www.w3.org/2000/svg' width='200' height='200'>" +
            "<filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>" +
            "<feColorMatrix type='saturate' values='0'/></filter>" +
            "<rect width='100%' height='100%' filter='url(#n)'/></svg>",
    );

/** Split a string so brand punctuation (& and .) can be tinted brown. */
function tint(text: string, base: string) {
    return text.split(/(&|\.)/g).filter((s) => s !== '').map((p, i) =>
        p === '&' || p === '.' ? (
            <span key={i} style={{ color: CC.brown }}>
                {p}
            </span>
        ) : (
            <span key={i} style={{ color: base }}>
                {p}
            </span>
        ),
    );
}

export function TexturedText({
    text,
    family,
    weight = 400,
    size,
    color = CC.cream,
    letterSpacing = '0',
    lineHeight = 0.9,
    textureOpacity = 0.5,
    strokePx = 0,
    style,
}: {
    text: string;
    family: string;
    weight?: number | string;
    size: number;
    color?: string;
    letterSpacing?: string;
    lineHeight?: number;
    textureOpacity?: number;
    // Faux-bold: Bebas Neue ships one weight, so a heavier "Bold" cut is made by
    // stroking the same glyphs in their own colour — identical letterforms, real
    // weight. paintOrder keeps the crisp fill on top of the thickening stroke.
    strokePx?: number;
    style?: React.CSSProperties;
}) {
    const shared: React.CSSProperties = {
        fontFamily: family,
        fontWeight: weight,
        fontSize: size,
        letterSpacing,
        lineHeight,
        whiteSpace: 'nowrap',
        display: 'block',
    };
    const strokeStyle: React.CSSProperties =
        strokePx > 0
            ? ({ WebkitTextStroke: `${strokePx}px ${color}`, paintOrder: 'stroke' } as React.CSSProperties)
            : {};
    return (
        <span style={{ position: 'relative', display: 'inline-block', ...style }}>
            {/* base coloured text */}
            <span style={{ ...shared, ...strokeStyle, textShadow: '0 4px 26px rgba(0,0,0,0.4)' }}>{tint(text, color)}</span>
            {/* noise clipped to the same glyphs */}
            <span
                aria-hidden
                style={{
                    ...shared,
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    color: 'transparent',
                    backgroundImage: `url("${NOISE}")`,
                    backgroundSize: '200px 200px',
                    WebkitBackgroundClip: 'text',
                    backgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    mixBlendMode: 'overlay',
                    opacity: textureOpacity,
                    pointerEvents: 'none',
                }}
            >
                {text}
            </span>
        </span>
    );
}
