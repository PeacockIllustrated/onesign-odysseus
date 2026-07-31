import { FONT } from '../theme';

/**
 * The demo customer's logo — a boutique coffee house, "AURELIA". Emblem + a
 * let-spaced wordmark, all in `currentColor` so the SignPanel can render it as
 * a cut-out, a raised stand-off, backlit glow or flat vinyl without changes.
 */
export function AureliaLogo({ size = 120 }: { size?: number }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: size * 0.34,
                color: 'currentColor',
            }}
        >
            <AureliaEmblem size={size * 1.15} />
            <span
                style={{
                    fontFamily: FONT,
                    fontWeight: 600,
                    fontSize: size,
                    letterSpacing: size * 0.06,
                    lineHeight: 1,
                    // small-caps flavour without a special font
                    textTransform: 'uppercase',
                }}
            >
                Aurelia
            </span>
        </div>
    );
}

/** A sun-over-cup emblem — clean, geometric, reads at any size. */
export function AureliaEmblem({ size = 120 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
            {/* rising-sun rays */}
            {Array.from({ length: 7 }).map((_, i) => {
                const a = -60 + i * 20;
                return (
                    <rect
                        key={i}
                        x={49}
                        y={8}
                        width={2.4}
                        height={11}
                        rx={1.2}
                        fill="currentColor"
                        transform={`rotate(${a} 50 42)`}
                    />
                );
            })}
            {/* sun disc */}
            <circle cx={50} cy={42} r={13} fill="currentColor" />
            {/* cup */}
            <path
                d="M30 60h40l-3.5 20a10 10 0 0 1-9.9 8.4H43.4a10 10 0 0 1-9.9-8.4L30 60Z"
                fill="currentColor"
            />
        </svg>
    );
}

/** Just the wordmark, for the upload / drop-in beat. */
export function AureliaWordmark({ size = 120 }: { size?: number }) {
    return (
        <span
            style={{
                fontFamily: FONT,
                fontWeight: 600,
                fontSize: size,
                letterSpacing: size * 0.06,
                textTransform: 'uppercase',
                color: 'currentColor',
            }}
        >
            Aurelia
        </span>
    );
}
