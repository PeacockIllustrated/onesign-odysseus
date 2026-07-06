import React from 'react';
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BEBAS_BOLD, BEBAS_BOOK, CC, withAlpha } from './theme';
import { ensureFonts } from './fonts';
import { Grain } from './ui/atoms';
import { WarmField } from './ui/WarmField';
import { TexturedText } from './ui/TexturedText';
import { Badge } from './ui/Badge';

const DUR = 150; // per ad
const OVER = 12; // brief cross-transition overlap (outgoing blurs away as incoming rises in)
const BADGE_LOOP = 300;

interface Ad {
    light: string; // thin headline line
    heavy: string; // bold headline line
    subLight: string;
    subHeavy: string;
}

// Impactful, on-brand ad copy in the reference's "FRESHLY / GROUND" mould.
// (Placeholder specifics — swap for the real menu / hours before going live.)
const ADS: Ad[] = [
    { light: 'FRESHLY', heavy: 'GROUND', subLight: 'MADE TO ORDER', subHeavy: 'SINGLE ORIGIN' },
    { light: 'SOURDOUGH', heavy: 'SANDOS', subLight: 'SLICED FRESH', subHeavy: 'MADE TO ORDER' },
    { light: 'GRAB &', heavy: 'GO', subLight: 'BREAKFAST', subHeavy: 'OPEN FROM 7AM' },
    { light: 'ALL-DAY', heavy: 'BRUNCH', subLight: 'SERVED FRESH', subHeavy: 'TILL 3PM' },
    { light: 'CRAFT &', heavy: 'CRUMB', subLight: 'COFFEE BAR', subHeavy: 'SANDO DELI' },
];

const AdContent: React.FC<{ ad: Ad }> = ({ ad }) => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();

    const appear = interpolate(frame, [0, 18], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    const exit = interpolate(frame, [DUR - 16, DUR], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    // Group envelope: incoming rises up sharp, outgoing rises further and blurs
    // away — so mid-transition the two headlines separate vertically and the
    // outgoing one reads as motion blur, never a muddy double-exposure.
    const groupOp = Math.min(appear, 1 - exit);
    const groupY = (1 - appear) * 74 + exit * -128;
    const groupBlur = (1 - appear) * 7 + exit * 12;

    const rise = (delay: number, dist = 40) => {
        const s = spring({ frame: frame - delay, fps, config: { damping: 20, stiffness: 130, mass: 0.9 } });
        return { opacity: s, transform: `translateX(${(1 - s) * -dist}px)` };
    };
    const wipe = spring({ frame: frame - 12, fps, config: { damping: 22, stiffness: 120, mass: 0.8 } });

    // Fit the headline lines to the available width — Bebas's wide round caps
    // (O/U/D/G) run long, so a word like SOURDOUGH scales down to stay on canvas.
    const AVAIL = 1010;
    const lightSize = Math.min(178, Math.floor(AVAIL / (ad.light.length * 0.7)));
    const heavySize = Math.min(196, Math.floor(AVAIL / (ad.heavy.length * 0.72)));

    return (
        <AbsoluteFill
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingLeft: 840,
                paddingRight: 90,
                opacity: groupOp,
                transform: `translateY(${groupY}px)`,
                filter: groupBlur > 0.05 ? `blur(${groupBlur}px)` : undefined,
            }}
        >
            {/* Bebas Neue Book (light) over Bebas Neue Bold (heavy) — the real
                Pro cuts, so weight contrast with matching letterforms. */}
            <div style={{ ...rise(2) }}>
                <TexturedText text={ad.light} family={BEBAS_BOOK} size={lightSize} letterSpacing="0.006em" textureOpacity={0.4} />
            </div>
            <div style={{ marginTop: -4, ...rise(7) }}>
                <TexturedText text={ad.heavy} family={BEBAS_BOLD} size={heavySize} letterSpacing="0.004em" textureOpacity={0.5} />
            </div>

            {/* brand rule — wipes in from the left */}
            <div
                style={{
                    marginTop: 24,
                    marginBottom: 22,
                    width: 470,
                    height: 7,
                    borderRadius: 2,
                    background: `linear-gradient(90deg, ${CC.brownDeep}, ${CC.brown} 45%, ${CC.brownLit})`,
                    transformOrigin: 'left center',
                    transform: `scaleX(${wipe})`,
                    boxShadow: `0 2px 14px ${withAlpha(CC.brown, 0.5)}`,
                }}
            />

            <div style={{ ...rise(15, 30) }}>
                <TexturedText text={ad.subLight} family={BEBAS_BOOK} size={58} letterSpacing="0.13em" textureOpacity={0.3} color={withAlpha(CC.cream, 0.88)} />
            </div>
            <div style={{ marginTop: 4, ...rise(19, 30) }}>
                <TexturedText text={ad.subHeavy} family={BEBAS_BOLD} size={74} letterSpacing="0.02em" textureOpacity={0.42} />
            </div>
        </AbsoluteFill>
    );
};

export const PROMOS_TOTAL = ADS.length * DUR - (ADS.length - 1) * OVER;

export const CraftCrumbPromos: React.FC = () => {
    ensureFonts();
    const frame = useCurrentFrame();
    const badgeFloat = Math.sin((frame / BADGE_LOOP) * Math.PI * 2) * 8;

    return (
        <AbsoluteFill>
            <WarmField />

            {/* persistent badge on the left — the message changes around it */}
            <div
                style={{
                    position: 'absolute',
                    left: 140,
                    top: '50%',
                    transform: `translateY(calc(-50% + ${badgeFloat}px))`,
                }}
            >
                <Badge size={600} loop={BADGE_LOOP} />
            </div>

            {/* the rotating message block, right side, fluid transitions */}
            {ADS.map((ad, i) => (
                <Sequence key={i} from={i * (DUR - OVER)} durationInFrames={DUR}>
                    <AdContent ad={ad} />
                </Sequence>
            ))}

            <Grain opacity={0.05} />
        </AbsoluteFill>
    );
};
