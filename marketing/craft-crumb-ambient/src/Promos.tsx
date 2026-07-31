import React from 'react';
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from 'remotion';
import { BEBAS_BOLD, BEBAS_BOOK, CC, withAlpha } from './theme';
import { ensureFonts } from './fonts';
import { Grain } from './ui/atoms';
import { TexturedText } from './ui/TexturedText';
import { Badge } from './ui/Badge';

// ── timing ──────────────────────────────────────────────────────────────────
const N = 4; // four ads, matching the promotional starter pack
const SLOT = 150; // frames per ad (hold + its outgoing transition)
const TR = 34; // transition length
const TOTAL = N * SLOT; // 600f / 20s — everything below is periodic → seamless loop
const SPLIT = 220; // how far the two headline words part on the up/down split
const BADGE = 560;

// Logo rests LEFT on odd ads, RIGHT on even ads, sliding across between them.
const LOGO_L = 440;
const LOGO_R = 1480;
const logoX = (j: number) => (j % 2 === 0 ? LOGO_L : LOGO_R);
// Text sits on the side opposite the logo — always left-aligned in that zone.
const textLeft = (j: number) => (j % 2 === 0 ? 858 : 150);

interface Ad {
    light: string;
    heavy: string;
    subLight: string;
    subHeavy: string;
    bg: string;
}
const ADS: Ad[] = [
    { light: 'FRESHLY', heavy: 'GROUND', subLight: 'MADE TO ORDER', subHeavy: 'SINGLE ORIGIN', bg: 'bg/bg1.png' },
    { light: 'SOURDOUGH', heavy: 'SANDOS', subLight: 'MADE TO ORDER', subHeavy: 'SLICED FRESH', bg: 'bg/bg2.png' },
    { light: 'GRAB &', heavy: 'GO', subLight: 'READY TO GO', subHeavy: 'FROM 7AM', bg: 'bg/bg3.png' },
    { light: 'ALL-DAY', heavy: 'BRUNCH', subLight: 'SERVED FRESH', subHeavy: 'TILL 3PM', bg: 'bg/bg4.png' },
];

const smooth = (t: number) => t * t * (3 - 2 * t); // smoothstep
const ease = (t: number) => 1 - Math.pow(1 - t, 3); // easeOutCubic

/** Where are we in the cycle: current ad, and (if transitioning) progress + next. */
function nav(frame: number) {
    const cyc = ((frame % TOTAL) + TOTAL) % TOTAL;
    const adIdx = Math.floor(cyc / SLOT);
    const local = cyc - adIdx * SLOT;
    const inTrans = local >= SLOT - TR;
    const tp = inTrans ? (local - (SLOT - TR)) / TR : 0;
    return { cyc, adIdx, next: (adIdx + 1) % N, tp: smooth(tp), inTrans };
}

/** Per-ad text envelope: split-in on enter, hold, split-out (up & down) on exit. */
function envelope(cyc: number, j: number) {
    let d = cyc - j * SLOT;
    if (d > SLOT) d -= TOTAL; // low-index ads enter during the wrap
    if (d < -TR || d > SLOT) return null;
    if (d < 0) {
        const s = ease((d + TR) / TR); // entering: 0→1
        return { opacity: s, topY: (1 - s) * -SPLIT, botY: (1 - s) * SPLIT };
    }
    if (d < SLOT - TR) return { opacity: 1, topY: 0, botY: 0 }; // hold
    const s = smooth((d - (SLOT - TR)) / TR); // exiting: 0→1
    return { opacity: 1 - s, topY: s * -SPLIT, botY: s * SPLIT };
}

const AdText: React.FC<{ ad: Ad; j: number; cyc: number }> = ({ ad, j, cyc }) => {
    const env = envelope(cyc, j);
    if (!env) return null;
    const left = textLeft(j);
    const AVAIL = j % 2 === 0 ? 1000 : 1010;
    const lightSize = Math.min(178, Math.floor(AVAIL / (ad.light.length * 0.7)));
    const heavySize = Math.min(196, Math.floor(AVAIL / (ad.heavy.length * 0.72)));

    return (
        <AbsoluteFill
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-start',
                justifyContent: 'center',
                paddingLeft: left,
                paddingRight: 60,
                opacity: env.opacity,
            }}
        >
            {/* light (top) word — splits UP */}
            <div style={{ transform: `translateY(${env.topY}px)` }}>
                <TexturedText text={ad.light} family={BEBAS_BOOK} size={lightSize} letterSpacing="0.006em" textureOpacity={0.4} />
            </div>
            {/* heavy word + rule + sub — split DOWN together */}
            <div style={{ transform: `translateY(${env.botY}px)` }}>
                <div style={{ marginTop: -4 }}>
                    <TexturedText text={ad.heavy} family={BEBAS_BOLD} size={heavySize} letterSpacing="0.004em" textureOpacity={0.5} />
                </div>
                <div
                    style={{
                        marginTop: 24,
                        marginBottom: 22,
                        width: 470,
                        height: 7,
                        borderRadius: 2,
                        background: `linear-gradient(90deg, ${CC.brownDeep}, ${CC.brown} 45%, ${CC.brownLit})`,
                        boxShadow: `0 2px 14px ${withAlpha(CC.brown, 0.5)}`,
                    }}
                />
                <TexturedText text={ad.subLight} family={BEBAS_BOOK} size={58} letterSpacing="0.13em" textureOpacity={0.3} color={withAlpha(CC.cream, 0.88)} />
                <div style={{ marginTop: 4 }}>
                    <TexturedText text={ad.subHeavy} family={BEBAS_BOLD} size={74} letterSpacing="0.02em" textureOpacity={0.42} />
                </div>
            </div>
        </AbsoluteFill>
    );
};

/** The reference 4-point / accented-edges gradients, crossfading to the opposite
 *  corner as the logo slides — this is the "gradient shift". */
const BgLayer: React.FC<{ adIdx: number; next: number; tp: number; inTrans: boolean }> = ({ adIdx, next, tp, inTrans }) => {
    const dir = adIdx % 2 === 0 ? -1 : 1; // amber moving toward the incoming logo side
    return (
        <AbsoluteFill style={{ background: CC.inkDeep }}>
            <Img
                src={staticFile(ADS[adIdx].bg)}
                style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: inTrans ? `translateX(${tp * 34 * dir}px) scale(1.03)` : 'scale(1.0)',
                }}
            />
            {inTrans && (
                <Img
                    src={staticFile(ADS[next].bg)}
                    style={{
                        position: 'absolute',
                        inset: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        opacity: tp,
                        transform: `translateX(${(tp - 1) * 34 * -dir}px) scale(1.03)`,
                    }}
                />
            )}
        </AbsoluteFill>
    );
};

export const PROMOS_TOTAL = TOTAL;

export const CraftCrumbPromos: React.FC = () => {
    ensureFonts();
    const frame = useCurrentFrame();
    const { cyc, adIdx, next, tp, inTrans } = nav(frame);

    // logo slides between rest positions during the transition
    const lx = inTrans ? interpolate(tp, [0, 1], [logoX(adIdx), logoX(next)]) : logoX(adIdx);
    const badgeFloat = Math.sin((frame / (TOTAL / 2)) * Math.PI * 2) * 6;

    return (
        <AbsoluteFill style={{ background: CC.inkDeep }}>
            <BgLayer adIdx={adIdx} next={next} tp={tp} inTrans={inTrans} />

            {ADS.map((ad, j) => (
                <AdText key={j} ad={ad} j={j} cyc={cyc} />
            ))}

            {/* the logo slides OVER the composition as the gradient shifts */}
            <div
                style={{
                    position: 'absolute',
                    left: lx,
                    top: '50%',
                    transform: `translate(-50%, calc(-50% + ${badgeFloat}px))`,
                }}
            >
                <Badge size={BADGE} loop={TOTAL / 2} />
            </div>

            <Grain opacity={0.04} />
        </AbsoluteFill>
    );
};
