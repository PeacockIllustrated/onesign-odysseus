import React from 'react';
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEBAS, CC, withAlpha } from './theme';
import { ensureFonts } from './fonts';
import { Grain, Motes, Rule, Stage } from './ui/atoms';
import { Badge } from './ui/Badge';
import { CoffeeCup, Sando, ToGo } from './ui/icons';

const PROMO = 160; // 5.33s per card
const OVER = 22; // cross-dissolve overlap
const STEAM_LOOP = 90;

type Motif = 'coffee' | 'sando' | 'togo' | 'badge';
interface Promo {
    motif: Motif;
    head: string[]; // 1–2 lines
    sub: string;
}

const PROMOS: Promo[] = [
    { motif: 'coffee', head: ['SINGLE-ORIGIN', 'ESPRESSO'], sub: 'PULLED FRESH · ALL DAY' },
    { motif: 'sando', head: ['SOURDOUGH', 'SANDOS'], sub: 'MADE TO ORDER' },
    { motif: 'togo', head: ['GRAB & GO', 'BREAKFAST'], sub: 'OPEN FROM 7AM' },
    { motif: 'badge', head: ['CRAFT & CRUMB'], sub: 'COFFEE BAR · SANDO DELI' },
];

/** Render a headline string, tinting brand punctuation (& and .) warm brown. */
function Head({ text, size }: { text: string; size: number }) {
    const parts = text.split(/(&|\.)/g).filter((s) => s !== '');
    return (
        <span
            style={{
                fontFamily: BEBAS,
                fontSize: size,
                lineHeight: 0.92,
                letterSpacing: '0.01em',
                color: CC.cream,
                display: 'block',
                textShadow: `0 6px 40px rgba(0,0,0,0.5)`,
            }}
        >
            {parts.map((p, i) =>
                p === '&' || p === '.' ? (
                    <span key={i} style={{ color: CC.brown }}>
                        {p}
                    </span>
                ) : (
                    <span key={i}>{p}</span>
                ),
            )}
        </span>
    );
}

function Motif({ kind, phase, loop }: { kind: Motif; phase: number; loop: number }) {
    if (kind === 'coffee') return <CoffeeCup size={220} phase={phase} />;
    if (kind === 'sando') return <Sando size={220} />;
    if (kind === 'togo') return <ToGo size={220} phase={phase} />;
    return <Badge size={300} loop={loop} />;
}

const PromoCard: React.FC<{ promo: Promo }> = ({ promo }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const phase = (frame % STEAM_LOOP) / STEAM_LOOP;

    const fadeIn = interpolate(frame, [0, 16], [0, 1], { extrapolateRight: 'clamp' });
    const fadeOut = interpolate(frame, [PROMO - 16, PROMO], [1, 0], { extrapolateLeft: 'clamp' });
    const alpha = Math.min(fadeIn, fadeOut);

    const rise = (delay: number) => {
        const s = spring({ frame: frame - delay, fps, config: { damping: 18, stiffness: 120, mass: 0.9 } });
        return { opacity: s, transform: `translateY(${(1 - s) * 26}px)` };
    };

    const isBadge = promo.motif === 'badge';
    const float = Math.sin((frame / PROMO) * Math.PI) * 6;

    return (
        <AbsoluteFill style={{ opacity: alpha }}>
            <AbsoluteFill
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: isBadge ? 30 : 26,
                    transform: `translateY(${float}px)`,
                }}
            >
                <div style={{ ...rise(4) }}>
                    <Motif kind={promo.motif} phase={phase} loop={PROMO} />
                </div>

                {!isBadge && (
                    <div style={{ textAlign: 'center', ...rise(9) }}>
                        {promo.head.map((line, i) => (
                            <Head key={i} text={line} size={132} />
                        ))}
                    </div>
                )}
                {isBadge && (
                    <div style={{ textAlign: 'center', ...rise(9) }}>
                        {promo.head.map((line, i) => (
                            <Head key={i} text={line} size={92} />
                        ))}
                    </div>
                )}

                <div style={{ ...rise(15) }}>
                    <Rule width={200} />
                </div>

                <div
                    style={{
                        fontFamily: BEBAS,
                        fontSize: 40,
                        letterSpacing: '0.34em',
                        paddingLeft: '0.34em',
                        color: withAlpha(CC.cream, 0.92),
                        ...rise(19),
                    }}
                >
                    {promo.sub}
                </div>
            </AbsoluteFill>
        </AbsoluteFill>
    );
};

export const PROMOS_TOTAL = PROMOS.length * PROMO - (PROMOS.length - 1) * OVER;

export const CraftCrumbPromos: React.FC = () => {
    ensureFonts();
    return (
        <AbsoluteFill>
            <Stage loop={STEAM_LOOP * 4}>
                <Motes loop={STEAM_LOOP * 4} count={20} />
                {PROMOS.map((promo, i) => (
                    <Sequence key={i} from={i * (PROMO - OVER)} durationInFrames={PROMO}>
                        <PromoCard promo={promo} />
                    </Sequence>
                ))}
            </Stage>
            <Grain opacity={0.045} />
        </AbsoluteFill>
    );
};
