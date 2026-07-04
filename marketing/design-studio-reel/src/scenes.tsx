import React from 'react';
import { AbsoluteFill, interpolate, Sequence, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, CONDENSED, DISPLAY, FONT, MONO } from './theme';
import { ramp, windowOpacity, countTo } from './ui/anim';
import { EASE } from './theme';
import { Stage, TopBar, SpecHud, WizardDock, NextButton, Cursor } from './ui/Studio';
import { OnesignWordmark, BrandMark } from './ui/Logo';
import { StageSign } from './ui/StageSign';
import { Caption } from './ui/Caption';
import { Check } from './ui/Icons';
import { EntryFlash, SparkBurst, ShockwaveRing } from './ui/Fx';
import { Kicker, StatSlab, MontageCard, WhipFlashCard, SnapIn, Iris } from './ui/Viral';
import { REAL_BRANDS } from './brands';
import {
    SizeFields,
    RalSwatches,
    FoldToggles,
    Dropzone,
    BuiltUpRow,
    GlowControls,
    ContactForm,
} from './ui/Controls';

// ── build-sign state (a real client: Ginger salon, 4400×650 illuminated) ────
const ALU = '#c8cccd';
const TEAL = '#3a5f6a';
const D0 = { w: 2400, h: 400, d: 50 };
const D1 = { w: 4400, h: 650, d: 50 };
const BUILD_NAME = 'GINGER';

type SceneProps = { start: number };
const useAbs = (start: number) => useCurrentFrame() + start;

function buildLogo(hMm: number) {
    return (
        <span
            style={{
                fontFamily: DISPLAY,
                fontWeight: 900,
                fontSize: hMm * 0.32 * 0.5,
                letterSpacing: '-0.01em',
                textTransform: 'uppercase',
                color: 'currentColor',
                whiteSpace: 'nowrap',
            }}
        >
            {BUILD_NAME}
        </span>
    );
}

function mixHex(a: string, b: string, t: number): string {
    const pa = hx(a);
    const pb = hx(b);
    return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(pa[1] + (pb[1] - pa[1]) * t)},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hx(h: string): [number, number, number] {
    const s = h.replace('#', '');
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
}

// ═══ SCENE 1 — HOOK: result first ══════════════════════════════════════════
export const Scene1: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const glowI = ramp(frame, 1, 10, EASE.out);
    return (
        <Stage night nightGlow={glowI}>
            <StageSign
                absFrame={abs}
                wMm={D1.w}
                hMm={D1.h}
                dMm={D1.d}
                color={TEAL}
                night
                glow={{ on: true, color: BRAND.accentGlow, intensity: 0.8 + glowI * 1.8 }}
                art="aperture"
                artwork={buildLogo(D1.h)}
                rotYBase={-16}
                centerY={560}
            />
            <EntryFlash at={1} dur={7} strength={0.7} />
            <SparkBurst x={540} y={560} startF={2} count={22} spread={560} dur={30} />
            <Caption
                startF={6}
                bottom={520}
                size={146}
                lines={[
                    { text: 'You just' },
                    { text: 'designed this', gradient: ['designed'] },
                ]}
            />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 360, textAlign: 'center', opacity: ramp(frame, 14, 24, EASE.out) }}>
                <Kicker text="Free · no sign-up · in your browser" size={32} color="rgba(255,255,255,0.6)" />
            </div>
        </Stage>
    );
};

// ═══ SCENE 2 — PIVOT: rewind to blank ══════════════════════════════════════
export const Scene2: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const slide = ramp(frame, 4, 20, EASE.out);
    return (
        <SnapIn>
            <Stage night={false}>
                <StageSign absFrame={abs} wMm={D0.w} hMm={D0.h} dMm={D0.d} color={ALU} centerY={520} />
                <TopBar title="Size & finish" night={false} opacity={slide} />
                <SpecHud w={D0.w} h={D0.h} d={D0.d} opacity={slide} />
                <Caption
                    startF={4}
                    bottom={905}
                    size={78}
                    align="left"
                    lines={[{ text: 'Build your own' }, { text: 'sign — 4 steps', accent: ['steps'] }]}
                />
                <WizardDock
                    current={0}
                    slideT={slide}
                    intro="Set the dimensions, choose a colour, and pick which edges fold back."
                    footer={<><div style={{ flex: 1 }} /><NextButton /></>}
                >
                    <SizeFields w={D0.w} h={D0.h} d={D0.d} />
                    <div style={{ height: 22 }} />
                    <RalSwatches selected={0} />
                </WizardDock>
            </Stage>
        </SnapIn>
    );
};

// ═══ SCENE 3 — STEP 1: SIZE ════════════════════════════════════════════════
export const Scene3: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const w = countTo(frame, D0.w, D1.w, 12, 52);
    const h = countTo(frame, D0.h, D1.h, 54, 92);
    const focus: 'w' | 'h' = frame < 54 ? 'w' : 'h';
    const cx = interpolate(frame, [8, 30, 54, 74], [430, 300, 300, 520], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <SnapIn>
            <Stage night={false}>
                <StageSign absFrame={abs} wMm={w} hMm={h} dMm={D0.d} color={ALU} centerY={500} />
                <TopBar title="Size & finish" night={false} />
                <SpecHud w={w} h={h} d={D0.d} />
                <div style={{ position: 'absolute', left: 44, top: 300 }}>
                    <StatSlab text={`${w} × ${h}`} at={2} size={128} />
                    <div style={{ marginTop: 4 }}><Kicker text="millimetres · to order" size={26} /></div>
                </div>
                <Caption
                    startF={4}
                    bottom={905}
                    align="left"
                    size={74}
                    lines={[{ text: 'Size. Colour.' }, { text: 'Folded edges.', accent: ['edges.'] }]}
                />
                <WizardDock
                    current={0}
                    intro="Width, height and depth — in real millimetres."
                    footer={<><div style={{ flex: 1 }} /><NextButton /></>}
                >
                    <SizeFields w={w} h={h} d={D0.d} focus={focus} />
                    <div style={{ height: 22 }} />
                    <RalSwatches selected={frame > 70 ? 2 : 0} />
                </WizardDock>
                <Cursor x={cx} y={1330} />
            </Stage>
        </SnapIn>
    );
};

// ═══ SCENE 4 — STEP 2: ARTWORK ═════════════════════════════════════════════
export const Scene4: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const color = mixHex(ALU, TEAL, ramp(frame, 0, 16, EASE.inOut));
    // finish flip: aperture → standoff
    const art = frame >= 70 ? 'standoff' : 'aperture';
    const artIn = ramp(frame, 8, 26, EASE.out);
    const cutFlash = windowOpacity(frame, 8, 22, 4);
    return (
        <SnapIn>
            <Stage night={false}>
                <StageSign
                    absFrame={abs}
                    wMm={D1.w}
                    hMm={D1.h}
                    dMm={D1.d}
                    color={color}
                    art={art}
                    artwork={<div style={{ opacity: artIn }}>{buildLogo(D1.h)}</div>}
                    rotYBase={-20}
                    centerY={500}
                />
                <AbsoluteFill
                    style={{
                        background: 'radial-gradient(38% 22% at 50% 26%, rgba(158,208,220,0.5), transparent 70%)',
                        opacity: cutFlash * 0.8,
                        mixBlendMode: 'screen',
                    }}
                />
                <TopBar title="Add your artwork" night={false} />
                <SpecHud w={D1.w} h={D1.h} d={D1.d} />
                <Caption
                    startF={4}
                    bottom={905}
                    align="left"
                    size={70}
                    lines={[{ text: 'Drop your logo.' }, { text: 'We cut it in metal.', accent: ['metal.'] }]}
                />
                <WizardDock
                    current={1}
                    intro="Upload your logo — cut it in, stand it off, or built-up metal."
                    footer={<><div style={{ flex: 1 }} /><NextButton /></>}
                >
                    <BuiltUpRow highlight={frame > 60} />
                    <div style={{ height: 18 }} />
                    <Dropzone dropped />
                </WizardDock>
            </Stage>
        </SnapIn>
    );
};

// ═══ SCENE 5 — STEP 3: LIGHT (presets rip) ═════════════════════════════════
const PRESET_SEQ: Array<[number, string]> = [
    [0, '#ffffff'], [1, '#ffd9a0'], [2, '#9ed0dc'], [3, '#ff5d5d'], [4, '#5db4ff'], [5, '#7CFC8A'],
];
export const Scene5: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const idx = Math.min(PRESET_SEQ.length - 1, Math.floor(frame / 11));
    const [sel, gcol] = PRESET_SEQ[idx];
    return (
        <SnapIn>
            <Stage night nightGlow={0.8}>
                <StageSign
                    absFrame={abs}
                    wMm={D1.w}
                    hMm={D1.h}
                    dMm={D1.d}
                    color={TEAL}
                    night
                    glow={{ on: true, color: gcol, intensity: 1.7 }}
                    art="standoff"
                    artwork={buildLogo(D1.h)}
                    centerY={500}
                />
                {/* strobe on each preset flick */}
                {PRESET_SEQ.map(([, c], i) => (
                    <WhipFlashCard key={i} at={i * 11} dur={2} color={c} opacity={0.35} />
                ))}
                <TopBar title="Light it up" night />
                <Caption startF={4} bottom={905} align="left" size={74} lines={[{ text: 'Now flick' }, { text: 'the lights…', accent: ['lights…'] }]} />
                <WizardDock current={2} intro="Choose your glow colour and how bright it burns." footer={<><div style={{ flex: 1 }} /><NextButton /></>}>
                    <GlowControls selected={sel} intensity={0.85} />
                </WizardDock>
            </Stage>
        </SnapIn>
    );
};

// ═══ SCENE 6 — THE GLOW: day→night pay-off ═════════════════════════════════
export const Scene6: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const A = 24, B = 50;
    const wipe = ramp(frame, A, B, EASE.inOut);
    const glowI = ramp(frame, A + 4, B + 14, EASE.out);
    const glowColor = mixHex('#c8f0fa', BRAND.accentGlow, ramp(frame, B, B + 18, EASE.out));
    const glow = { on: true, color: glowColor, intensity: 0.6 + glowI * 1.8 };
    const push = interpolate(frame, [B, 105], [1, 1.06], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
    return (
        <AbsoluteFill>
            <Stage night={false}>
                <StageSign absFrame={abs} wMm={D1.w} hMm={D1.h} dMm={D1.d} color={TEAL} art="standoff" artwork={buildLogo(D1.h)} centerY={500} />
            </Stage>
            <AbsoluteFill style={{ clipPath: `circle(${wipe * 130}% at 50% 46%)`, transform: `scale(${push})` }}>
                <Stage night nightGlow={glowI}>
                    <StageSign absFrame={abs} wMm={D1.w} hMm={D1.h} dMm={D1.d} color={TEAL} night glow={glow} art="standoff" artwork={buildLogo(D1.h)} centerY={500} />
                </Stage>
            </AbsoluteFill>
            <SparkBurst x={540} y={500} startF={B - 2} count={26} spread={640} dur={40} />
            <EntryFlash at={B - 4} dur={12} strength={0.5} />
            <Caption
                startF={6}
                bottom={430}
                size={168}
                lines={[{ text: 'Day.' }, { text: 'Night.', accent: ['night.'] }]}
            />
        </AbsoluteFill>
    );
};

// ═══ SCENE 7 — STEP 4: SEND + proof ════════════════════════════════════════
export const Scene7: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const sent = frame > 48;
    const ref = countTo(frame, 0, 123, 54, 78);
    const refStr = `DSR-2026-${String(ref).padStart(6, '0')}`;
    return (
        <SnapIn>
            <Stage night nightGlow={0.7}>
                <div style={{ filter: 'blur(7px)', opacity: 0.6 }}>
                    <StageSign absFrame={abs} wMm={D1.w} hMm={D1.h} dMm={D1.d} color={TEAL} night glow={{ on: true, color: BRAND.accentGlow, intensity: 1.4 }} art="standoff" artwork={buildLogo(D1.h)} centerY={440} />
                </div>
                <TopBar title="Your details" night showHelp={false} />
                <Caption startF={4} bottom={930} align="left" size={72} lines={[{ text: 'Send it →' }, { text: 'we quote it.', accent: ['quote'] }]} />
                {!sent ? (
                    <WizardDock current={3} height={720} intro="Happy with it? Tell us where to send your quote." footer={<NextButton label={frame > 40 ? 'Sending…' : 'Send my design'} withArrow={false} full icon="send" />}>
                        <ContactForm name={frame > 20 ? 'Sam Rivera' : ''} email={frame > 34 ? 'sam@ginger.salon' : ''} nameValid={frame > 20} emailValid={frame > 34} />
                    </WizardDock>
                ) : (
                    <div style={{ position: 'absolute', left: 60, right: 60, bottom: 120, borderRadius: 34, background: 'rgba(255,255,255,0.96)', padding: '46px 48px', textAlign: 'center', boxShadow: '0 40px 90px rgba(0,0,0,0.6)' }}>
                        <div style={{ width: 84, height: 84, borderRadius: 999, margin: '0 auto 6px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: BRAND.light }}>
                            <Check size={48} color={BRAND.accent} />
                        </div>
                        <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 40, color: '#161b1e', marginTop: 12 }}>ON ITS WAY!</div>
                        <div style={{ display: 'inline-block', marginTop: 18, padding: '14px 26px', borderRadius: 14, border: `2px dashed ${BRAND.accent}`, fontFamily: MONO, fontSize: 34, fontWeight: 700, color: BRAND.accentDark }}>{refStr}</div>
                        <div style={{ marginTop: 16, fontFamily: FONT, fontSize: 24, color: '#4a5155' }}>Quote back within 1 working day.</div>
                    </div>
                )}
            </Stage>
        </SnapIn>
    );
};

// ═══ SCENE 8 — MONTAGE STINGER ═════════════════════════════════════════════
export const Scene8: React.FC<SceneProps> = () => {
    const frame = useCurrentFrame();
    return (
        <Stage night>
            <WhipFlashCard at={0} dur={3} color={BRAND.accentGlow} opacity={0.85} />
            <Caption startF={2} bottom={780} size={150} lines={[{ text: "These aren't" }, { text: 'demos.', accent: ['demos.'] }]} />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 640, textAlign: 'center', opacity: ramp(frame, 10, 20, EASE.out) }}>
                <Kicker text="Real signs we've actually made" size={34} color="rgba(255,255,255,0.7)" />
            </div>
        </Stage>
    );
};

// ═══ SCENE 9 — REAL-BRAND MONTAGE (6 cards) ════════════════════════════════
export const CARD = 32; // frames per card
export const Scene9: React.FC<SceneProps> = () => {
    return (
        <AbsoluteFill style={{ background: '#04070a' }}>
            {REAL_BRANDS.map((brand, k) => (
                <Sequence key={k} from={k * CARD} durationInFrames={CARD}>
                    <Stage night={brand.lit} nightGlow={brand.lit ? 0.7 : 0}>
                        <MontageCard brand={brand} index={k} dur={CARD} />
                        {k % 4 === 0 && (
                            <WhipFlashCard at={0} dur={2} color="#e8f0f3" opacity={0.9} />
                        )}
                        <div style={{ position: 'absolute', right: 40, bottom: 44, fontFamily: DISPLAY, fontWeight: 900, fontSize: 30, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }}>
                            {String(k + 1).padStart(2, '0')} / {String(REAL_BRANDS.length).padStart(2, '0')}
                        </div>
                    </Stage>
                </Sequence>
            ))}
        </AbsoluteFill>
    );
};

// ═══ SCENE 10 — SOCIAL-PROOF LINE ══════════════════════════════════════════
export const Scene10: React.FC<SceneProps> = ({ start }) => {
    const abs = useAbs(start);
    return (
        <Stage night nightGlow={0.4}>
            <div style={{ filter: 'blur(9px)', opacity: 0.3 }}>
                <StageSign absFrame={abs} wMm={D1.w} hMm={D1.h} dMm={D1.d} color={TEAL} night glow={{ on: true, color: BRAND.accentGlow, intensity: 1.2 }} art="standoff" artwork={buildLogo(D1.h)} centerY={520} />
            </div>
            <Caption
                startF={2}
                bottom={640}
                size={104}
                lines={[
                    { text: 'The signs' },
                    { text: "you've walked past?" },
                    { text: 'We made them.', accent: ['made'] },
                ]}
            />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 520, textAlign: 'center' }}>
                <Kicker text="North East · Built here" size={30} color="rgba(158,208,220,0.85)" />
            </div>
        </Stage>
    );
};

// ═══ SCENE 11 — CTA: hard URL lock ═════════════════════════════════════════
export const Scene11: React.FC<SceneProps> = () => {
    const frame = useCurrentFrame();
    const { fps } = useVideoConfig();
    const logoS = spring({ frame: frame - 10, fps, config: { damping: 12, stiffness: 200 } });
    const underline = ramp(frame, 30, 42, EASE.out);
    return (
        <Stage night>
            {/* logo lock-up, upper third */}
            <div style={{ position: 'absolute', left: 0, right: 0, top: 420, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 26, opacity: Math.min(1, logoS * 1.5), transform: `translateY(${(1 - logoS) * 24}px)` }}>
                <BrandMark size={112} glow />
                <OnesignWordmark height={50} color="white" />
            </div>
            {/* the slam, middle */}
            <Caption startF={14} bottom={640} size={104} lines={[{ text: 'Free. No sign-up.' }, { text: 'Go build one.', gradient: ['build'] }]} />
            {/* URL, lower third */}
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: 380, textAlign: 'center' }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 46, letterSpacing: '-0.01em', color: BRAND.accentGlow }}>
                    onesignanddigital.com/design
                </div>
                <div style={{ height: 5, marginTop: 14, marginLeft: 'auto', marginRight: 'auto', width: `${underline * 100}%`, maxWidth: 640, background: BRAND.accentGlow, borderRadius: 999, boxShadow: `0 0 18px ${BRAND.accentGlow}` }} />
            </div>
            {/* iris opens onto the lock-up */}
            <Iris at={0} dur={10} mode="open" />
        </Stage>
    );
};
