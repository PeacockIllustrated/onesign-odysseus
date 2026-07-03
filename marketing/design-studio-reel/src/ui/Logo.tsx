import { Img, staticFile } from 'remotion';
import { BRAND } from '../theme';

/**
 * The real Onesign wordmark (public/onesign-wordmark.svg — a 1:1 copy of the
 * app asset). The source art is solid black, so `brightness(0) invert(1)`
 * recolours it crisply to white for the dark stage; left as-is for light.
 */
export function OnesignWordmark({
    height = 44,
    color = 'white',
}: {
    height?: number;
    color?: 'white' | 'black';
}) {
    return (
        <Img
            src={staticFile('onesign-wordmark.svg')}
            style={{
                height,
                width: 'auto',
                filter:
                    color === 'white'
                        ? 'brightness(0) invert(1)'
                        : 'none',
            }}
        />
    );
}

/**
 * The Onesign logomark — a ring with a geometric "1" cutout (per the brand
 * note). Drawn as an even-odd SVG so the "1" reads as a true hole.
 */
export function BrandMark({
    size = 72,
    fill = BRAND.white,
    glow = false,
}: {
    size?: number;
    fill?: string;
    glow?: boolean;
}) {
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 100 100"
            style={
                glow
                    ? { filter: `drop-shadow(0 0 14px ${BRAND.accentGlow})` }
                    : undefined
            }
        >
            <path
                fillRule="evenodd"
                clipRule="evenodd"
                fill={fill}
                d="M50 2a48 48 0 1 0 0 96 48 48 0 0 0 0-96Zm0 16a32 32 0 1 1 0 64 32 32 0 0 1 0-64Z"
            />
            {/* geometric "1" cut through the ring's inner disc */}
            <path
                fill={fill}
                d="M46 30h9v40h8v8H40v-8h8V40l-7 4v-9l11-5h-6Z"
            />
        </svg>
    );
}
