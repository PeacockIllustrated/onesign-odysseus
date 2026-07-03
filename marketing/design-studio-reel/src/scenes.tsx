import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import { BRAND, FONT, MONO, stageBackground } from './theme';
import { ramp, enter, windowOpacity, countTo } from './ui/anim';
import { EASE } from './theme';
import { Stage, TopBar, SpecHud, WizardDock, NextButton, Cursor, Nudge } from './ui/Studio';
import { OnesignWordmark } from './ui/Logo';
import { StageSign } from './ui/StageSign';
import { Caption } from './ui/Caption';
import { AureliaLogo } from './ui/BrandArt';
import { Check } from './ui/Icons';
import {
    SizeFields,
    RalSwatches,
    FoldToggles,
    Dropzone,
    FileChip,
    BuiltUpRow,
    GlowControls,
    ContactForm,
} from './ui/Controls';

// ── Shared demo design state ───────────────────────────────────────────────
const ALU = '#c8cccd';
const TEAL = '#3a5f6a';
const D0 = { w: 2400, h: 400, d: 50 };
const D1 = { w: 2800, h: 620, d: 50 };
const CUSTOMER = 'Sam';

type SceneProps = { start: number };
const useAbs = (start: number) => useCurrentFrame() + start;

function logo(hMm: number) {
    return <AureliaLogo size={hMm * 0.32 * 0.44} />;
}

function mixHex(a: string, b: string, t: number): string {
    const pa = hx(a);
    const pb = hx(b);
    return `rgb(${Math.round(pa[0] + (pb[0] - pa[0]) * t)},${Math.round(
        pa[1] + (pb[1] - pa[1]) * t,
    )},${Math.round(pa[2] + (pb[2] - pa[2]) * t)})`;
}
function hx(h: string): [number, number, number] {
    const s = h.replace('#', '');
    return [
        parseInt(s.slice(0, 2), 16),
        parseInt(s.slice(2, 4), 16),
        parseInt(s.slice(4, 6), 16),
    ];
}

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 1 — Cold open: the sign spins in the dark
// ═══════════════════════════════════════════════════════════════════════════
export const Scene1: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const intro = ramp(frame, 0, 22, EASE.out);
    const halo = 0.5 + 0.5 * Math.sin((2 * Math.PI * abs) / 90);
    return (
        <Stage night={false}>
            {/* top halo bleed */}
            <AbsoluteFill
                style={{
                    background:
                        'radial-gradient(60% 30% at 50% -6%, rgba(158,208,220,0.35), transparent 70%)',
                    opacity: 0.5 + 0.5 * halo,
                }}
            />
            <div style={{ opacity: intro, transform: `scale(${0.92 + intro * 0.08})` }}>
                <StageSign
                    absFrame={abs}
                    wMm={D0.w}
                    hMm={D0.h}
                    dMm={D0.d}
                    color={ALU}
                    centerY={760}
                    extraScale={1.05}
                />
            </div>
            <div style={{ position: 'absolute', top: 60, left: 48, opacity: intro }}>
                <OnesignWordmark height={34} color="white" />
            </div>
            <SpecHud w={D0.w} h={D0.h} d={D0.d} opacity={intro} />
            <Caption
                startF={20}
                bottom={520}
                lines={[
                    { text: 'Design your own sign.' },
                    { text: 'Right here. In 3D.', accent: ['3D'] },
                ]}
            />
        </Stage>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 2 — The hook: free, no login; the dock slides up
// ═══════════════════════════════════════════════════════════════════════════
export const Scene2: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const slide = ramp(frame, 6, 26, EASE.out);
    // a ghost flick of the sign
    const flick = interpolate(frame, [40, 58, 90], [0, -14, 0], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
        easing: (t) => t,
    });
    const nudge = windowOpacity(frame, 30, 92, 12);
    return (
        <Stage night={false}>
            <StageSign
                absFrame={abs}
                wMm={D0.w}
                hMm={D0.h}
                dMm={D0.d}
                color={ALU}
                rotYBase={-24 + flick}
                centerY={520}
            />
            <TopBar title="Size & finish" night={false} opacity={slide} />
            <SpecHud w={D0.w} h={D0.h} d={D0.d} opacity={slide} />
            <Nudge opacity={nudge} top={300}>
                👋 Drag to spin it — the preview is live
            </Nudge>
            <Caption
                startF={12}
                bottom={900}
                size={70}
                lines={[
                    { text: 'Free. No login.', accent: ['Free.'] },
                    { text: 'Build it in your browser.' },
                ]}
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
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 3 — Size it in millimetres, live
// ═══════════════════════════════════════════════════════════════════════════
export const Scene3: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const w = countTo(frame, D0.w, D1.w, 14, 54);
    const h = countTo(frame, D0.h, D1.h, 56, 92);
    const focus: 'w' | 'h' = frame < 55 ? 'w' : 'h';
    // cursor drags on the width field, then the height field
    const cy = interpolate(frame, [10, 55, 92], [1330, 1330, 1330]);
    const cx = interpolate(frame, [10, 30, 55, 75], [430, 300, 300, 520], {
        extrapolateLeft: 'clamp',
        extrapolateRight: 'clamp',
    });
    return (
        <Stage night={false}>
            <StageSign absFrame={abs} wMm={w} hMm={h} dMm={D0.d} color={ALU} centerY={520} />
            <TopBar title="Size & finish" night={false} />
            <SpecHud w={w} h={h} d={D0.d} />
            <Caption
                startF={6}
                bottom={905}
                size={82}
                lines={[
                    { text: 'Any size you like.' },
                    { text: 'Updates as you type.', accent: ['type.'] },
                ]}
            />
            <WizardDock
                current={0}
                intro="Width, height and depth — in real millimetres."
                footer={<><div style={{ flex: 1 }} /><NextButton /></>}
            >
                <SizeFields w={w} h={h} d={D0.d} focus={focus} />
                <div style={{ height: 22 }} />
                <RalSwatches selected={0} />
            </WizardDock>
            <Cursor x={cx} y={cy} press={0} />
        </Stage>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 4 — Colour + folded edges
// ═══════════════════════════════════════════════════════════════════════════
export const Scene4: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const paintT = ramp(frame, 18, 44, EASE.inOut);
    const color = mixHex(ALU, TEAL, paintT);
    const swatch = frame < 18 ? 0 : 2;
    const foldsOn: [boolean, boolean, boolean, boolean] =
        frame < 60 ? [false, false, true, true] : [true, true, true, true];
    // camera arc to catch the folded edge
    const arc = interpolate(frame, [0, 60, 120], [-24, -42, -30]);
    const rx = interpolate(frame, [0, 60, 120], [9, 13, 10]);
    const cPress = windowOpacity(frame, 12, 22, 4);
    return (
        <Stage night={false}>
            <StageSign
                absFrame={abs}
                wMm={D1.w}
                hMm={D1.h}
                dMm={D1.d}
                color={color}
                rotYBase={arc}
                rotX={rx}
                centerY={520}
            />
            <TopBar title="Size & finish" night={false} />
            <SpecHud w={D1.w} h={D1.h} d={D1.d} material="Aluminium · RAL" />
            <Caption
                startF={6}
                bottom={905}
                size={84}
                lines={[
                    { text: 'Your colour.', accent: ['colour.'] },
                    { text: 'Your folded edges.' },
                ]}
            />
            <WizardDock
                current={0}
                intro="Pick a RAL colour and choose which edges fold back."
                footer={<><div style={{ flex: 1 }} /><NextButton /></>}
            >
                <RalSwatches selected={swatch} />
                <div style={{ height: 26 }} />
                <FoldToggles on={foldsOn} />
            </WizardDock>
            <Cursor x={352} y={1250} press={cPress} />
        </Stage>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 5 — Drag your logo in (aperture cut-in → stand-off)
// ═══════════════════════════════════════════════════════════════════════════
export const Scene5: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const DROP = 44; // frame the file lands
    const dropped = frame >= DROP;
    const focus = frame >= 28 && frame < DROP + 10;
    // file chip flies from top-right down to the dropzone
    const chipT = ramp(frame, 10, DROP, EASE.inOut);
    const chipX = interpolate(chipT, [0, 1], [740, 250]);
    const chipY = interpolate(chipT, [0, 1], [520, 1420]);
    const chipO = windowOpacity(frame, 10, DROP + 4, 6);
    // artwork appears after drop; toggles to stand-off later
    const art = frame >= 98 ? 'standoff' : 'aperture';
    const artIn = ramp(frame, DROP + 2, DROP + 20, EASE.out);
    const cutFlash = windowOpacity(frame, DROP + 2, DROP + 16, 4);
    return (
        <Stage night={false}>
            <div style={{ opacity: dropped ? 1 : 0.001 }}>
                <StageSign
                    absFrame={abs}
                    wMm={D1.w}
                    hMm={D1.h}
                    dMm={D1.d}
                    color={TEAL}
                    art={art}
                    artwork={
                        <div style={{ opacity: artIn, transform: `scale(${0.96 + artIn * 0.04})` }}>
                            {logo(D1.h)}
                        </div>
                    }
                    centerY={520}
                />
            </div>
            {!dropped && (
                <StageSign absFrame={abs} wMm={D1.w} hMm={D1.h} dMm={D1.d} color={TEAL} centerY={520} />
            )}
            {/* rim-light flash on cut-through */}
            <AbsoluteFill
                style={{
                    background:
                        'radial-gradient(40% 22% at 50% 27%, rgba(158,208,220,0.5), transparent 70%)',
                    opacity: cutFlash * 0.8,
                    mixBlendMode: 'screen',
                }}
            />
            <TopBar title="Add your artwork" night={false} />
            <SpecHud w={D1.w} h={D1.h} d={D1.d} />
            <Caption
                startF={6}
                bottom={935}
                size={72}
                lines={[
                    { text: 'Drop in your logo.', accent: ['logo.'] },
                    { text: 'Cut it in — or stand it off.' },
                ]}
            />
            <WizardDock
                current={1}
                intro="Upload your logo or lettering as an SVG."
                footer={<><div style={{ flex: 1 }} /><NextButton /></>}
            >
                <BuiltUpRow />
                <div style={{ height: 18 }} />
                <Dropzone focus={focus} dropped={dropped} />
            </WizardDock>
            {frame < DROP + 6 && (
                <div style={{ position: 'absolute', left: chipX, top: chipY, opacity: chipO }}>
                    <FileChip />
                </div>
            )}
        </Stage>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 6 — Premium: built-up metal letters
// ═══════════════════════════════════════════════════════════════════════════
export const Scene6: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    // drop to a low raking angle so the letter depth reads
    const rx = interpolate(frame, [0, 40, 105], [10, 22, 18], {
        extrapolateRight: 'clamp',
    });
    const arc = interpolate(frame, [0, 40, 105], [-30, -34, -30]);
    const extrude = ramp(frame, 8, 44, EASE.out);
    return (
        <Stage night={false}>
            <StageSign
                absFrame={abs}
                wMm={D1.w}
                hMm={D1.h}
                dMm={D1.d}
                color={TEAL}
                art="standoff"
                artwork={
                    <div style={{ transform: `scale(${0.99 + extrude * 0.01})` }}>
                        {logo(D1.h)}
                    </div>
                }
                rotYBase={arc}
                rotX={rx}
                centerY={520}
            />
            <TopBar title="Add your artwork" night={false} />
            <SpecHud w={D1.w} h={D1.h} d={D1.d} />
            <Caption
                startF={6}
                bottom={905}
                size={66}
                lines={[
                    { text: 'Or go premium:', accent: ['premium:'] },
                    { text: 'real built-up metal letters.' },
                ]}
            />
            <WizardDock
                current={1}
                intro="Fabricated metal letters with real depth — built &amp; previewed in 3D."
                footer={<><div style={{ flex: 1 }} /><NextButton /></>}
            >
                <BuiltUpRow highlight />
                <div style={{ height: 18 }} />
                <Dropzone dropped />
            </WizardDock>
        </Stage>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 7 — The wow: flick to night (the money shot)
// ═══════════════════════════════════════════════════════════════════════════
export const Scene7: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const WIPE_A = 30;
    const WIPE_B = 58;
    const wipe = ramp(frame, WIPE_A, WIPE_B, EASE.inOut); // 0 day → 1 night
    const dayNightT = ramp(frame, 20, WIPE_B, EASE.pop);
    const glowI = ramp(frame, WIPE_A + 4, WIPE_B + 14, EASE.out);
    // white-hot core cools to brand ice
    const glowColor = mixHex('#c8e8ef', BRAND.accentGlow, ramp(frame, WIPE_B, WIPE_B + 20, EASE.out));
    const glow = { on: true, color: glowColor, intensity: 0.6 + glowI * 1.6 };

    return (
        <AbsoluteFill>
            {/* DAY base */}
            <Stage night={false}>
                <StageSign
                    absFrame={abs}
                    wMm={D1.w}
                    hMm={D1.h}
                    dMm={D1.d}
                    color={TEAL}
                    art="standoff"
                    artwork={logo(D1.h)}
                    centerY={520}
                />
            </Stage>
            {/* NIGHT reveal, wiping top→bottom */}
            <AbsoluteFill
                style={{
                    clipPath: `inset(0 0 ${(1 - wipe) * 100}% 0)`,
                }}
            >
                <Stage night nightGlow={glowI}>
                    <StageSign
                        absFrame={abs}
                        wMm={D1.w}
                        hMm={D1.h}
                        dMm={D1.d}
                        color={TEAL}
                        night
                        glow={glow}
                        art="standoff"
                        artwork={logo(D1.h)}
                        centerY={520}
                    />
                </Stage>
                {/* bright wipe front line */}
                <div
                    style={{
                        position: 'absolute',
                        left: 0,
                        right: 0,
                        top: `${wipe * 100}%`,
                        height: 6,
                        background: `linear-gradient(90deg, transparent, ${BRAND.accentGlow}, transparent)`,
                        filter: 'blur(3px)',
                        opacity: wipe > 0 && wipe < 1 ? 1 : 0,
                    }}
                />
            </AbsoluteFill>

            <TopBar title="Light it up" night={wipe > 0.5} dayNightT={dayNightT} />
            <SpecHud w={D1.w} h={D1.h} d={D1.d} opacity={0.5} />
            <Caption
                startF={6}
                bottom={930}
                size={58}
                lines={[
                    { text: 'Now light it up.', accent: ['light'], glow: ['light'] },
                    { text: 'Flick to night — watch it glow.', accent: ['glow.'], glow: ['glow.'] },
                ]}
            />
            <WizardDock
                current={2}
                slideT={1}
                intro="See how your sign looks glowing at night — flick the switch."
                footer={<><div style={{ flex: 1 }} /><NextButton /></>}
            >
                <GlowControls selected={2} intensity={0.55 + glowI * 0.35} />
            </WizardDock>
        </AbsoluteFill>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 8 — Choose the glow colour
// ═══════════════════════════════════════════════════════════════════════════
const GLOW_SEQ: Array<[number, string]> = [
    [1, '#ffd9a0'], // Warm
    [4, '#5db4ff'], // Blue
    [3, '#ff5d5d'], // Red
    [2, '#9ed0dc'], // Ice (settle)
];
export const Scene8: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const idx = Math.min(GLOW_SEQ.length - 1, Math.floor(frame / 22));
    const [sel, gcol] = GLOW_SEQ[idx];
    const intensity = 1.4;
    const glow = { on: true, color: gcol, intensity };
    return (
        <Stage night nightGlow={1}>
            <StageSign
                absFrame={abs}
                wMm={D1.w}
                hMm={D1.h}
                dMm={D1.d}
                color={TEAL}
                night
                glow={glow}
                art="standoff"
                artwork={logo(D1.h)}
                centerY={520}
            />
            <TopBar title="Light it up" night />
            <Caption
                startF={6}
                bottom={945}
                size={46}
                lines={[
                    { text: 'White · Warm · Ice · Red · Blue · Green' },
                    { text: 'Your glow, your way.', accent: ['glow,'], glow: ['glow,'] },
                ]}
            />
            <WizardDock
                current={2}
                intro="Choose your glow colour and how bright it burns."
                footer={<><div style={{ flex: 1 }} /><NextButton /></>}
            >
                <GlowControls selected={sel} intensity={0.8} />
            </WizardDock>
        </Stage>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 9 — Send it, in seconds
// ═══════════════════════════════════════════════════════════════════════════
export const Scene9: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const nameV = frame > 26;
    const emailV = frame > 52;
    const press = windowOpacity(frame, 82, 96, 6);
    return (
        <Stage night nightGlow={0.7}>
            <div style={{ filter: 'blur(6px)', opacity: 0.7 }}>
                <StageSign
                    absFrame={abs}
                    wMm={D1.w}
                    hMm={D1.h}
                    dMm={D1.d}
                    color={TEAL}
                    night
                    glow={{ on: true, color: BRAND.accentGlow, intensity: 1.3 }}
                    art="standoff"
                    artwork={logo(D1.h)}
                    centerY={470}
                />
            </div>
            <TopBar title="Your details" night showHelp={false} />
            <Caption
                startF={6}
                bottom={980}
                size={64}
                lines={[
                    { text: 'Name + email. That’s it.' },
                    { text: 'Reply within 1 working day.', accent: ['1'] },
                ]}
            />
            <WizardDock
                current={3}
                height={820}
                intro="Happy with it? Tell us where to send your quote."
                footer={
                    <NextButton label={frame > 88 ? 'Sending…' : 'Send my design'} withArrow={false} full icon="send" />
                }
            >
                <ContactForm
                    name={nameV ? 'Sam Rivera' : ''}
                    email={emailV ? 'sam@aurelia.coffee' : ''}
                    nameValid={nameV}
                    emailValid={emailV}
                />
            </WizardDock>
            <Cursor x={540} y={1710} press={press} />
        </Stage>
    );
};

// ═══════════════════════════════════════════════════════════════════════════
// SCENE 10 — Success + CTA
// ═══════════════════════════════════════════════════════════════════════════
export const Scene10: React.FC<SceneProps> = ({ start }) => {
    const frame = useCurrentFrame();
    const abs = useAbs(start);
    const bloom = ramp(frame, 0, 16, EASE.out);
    const cardIn = ramp(frame, 8, 26, EASE.out);
    const ref = countTo(frame, 0, 123, 20, 42);
    const refStr = `DSR-2026-${String(ref).padStart(6, '0')}`;
    const steps = [
        'We review your design',
        'We email your quote — within 1 working day',
        'We make the real thing',
    ];
    return (
        <Stage night nightGlow={0.5}>
            <div style={{ filter: 'blur(10px)', opacity: 0.45 * (1 - bloom * 0.4) }}>
                <StageSign
                    absFrame={abs}
                    wMm={D1.w}
                    hMm={D1.h}
                    dMm={D1.d}
                    color={TEAL}
                    night
                    glow={{ on: true, color: BRAND.accentGlow, intensity: 1.2 }}
                    art="standoff"
                    artwork={logo(D1.h)}
                    centerY={470}
                />
            </div>
            <AbsoluteFill style={{ background: 'rgba(4,7,10,0.55)', opacity: cardIn }} />
            {/* success card */}
            <div
                style={{
                    position: 'absolute',
                    left: 90,
                    right: 90,
                    top: 470,
                    borderRadius: 40,
                    background: 'rgba(255,255,255,0.96)',
                    boxShadow: '0 40px 100px rgba(0,0,0,0.6)',
                    padding: '52px 54px',
                    textAlign: 'center',
                    opacity: cardIn,
                    transform: `translateY(${(1 - cardIn) * 30}px) scale(${0.96 + cardIn * 0.04})`,
                }}
            >
                <div
                    style={{
                        width: 92,
                        height: 92,
                        borderRadius: 999,
                        margin: '0 auto 8px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        background: BRAND.light,
                    }}
                >
                    <Check size={54} color={BRAND.accent} />
                </div>
                <h2
                    style={{
                        margin: '18px 0 0',
                        fontFamily: FONT,
                        fontSize: 46,
                        fontWeight: 800,
                        letterSpacing: '-0.01em',
                        color: '#161b1e',
                    }}
                >
                    Your design’s on its way, {CUSTOMER}!
                </h2>
                <div
                    style={{
                        display: 'inline-block',
                        margin: '22px 0 6px',
                        padding: '14px 28px',
                        borderRadius: 14,
                        border: `2px dashed ${BRAND.accent}`,
                        fontFamily: MONO,
                        fontSize: 32,
                        fontWeight: 700,
                        color: BRAND.accentDark,
                    }}
                >
                    {refStr}
                </div>
                <ol
                    style={{
                        listStyle: 'none',
                        margin: '26px auto 0',
                        padding: 0,
                        maxWidth: 620,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 14,
                        textAlign: 'left',
                    }}
                >
                    {steps.map((s, i) => {
                        const o = ramp(frame, 30 + i * 6, 42 + i * 6, EASE.out);
                        return (
                            <li
                                key={i}
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: 16,
                                    opacity: o,
                                    transform: `translateX(${(1 - o) * 14}px)`,
                                    fontFamily: FONT,
                                    fontSize: 26,
                                    color: '#3f474b',
                                }}
                            >
                                <span
                                    style={{
                                        display: 'flex',
                                        flexShrink: 0,
                                        width: 40,
                                        height: 40,
                                        borderRadius: 999,
                                        background: BRAND.accent,
                                        color: '#fff',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontWeight: 800,
                                        fontSize: 22,
                                    }}
                                >
                                    {i + 1}
                                </span>
                                {s}
                            </li>
                        );
                    })}
                </ol>
            </div>
            {/* CTA footer */}
            <div
                style={{
                    position: 'absolute',
                    left: 0,
                    right: 0,
                    bottom: 150,
                    textAlign: 'center',
                    opacity: ramp(frame, 34, 48, EASE.out),
                }}
            >
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22 }}>
                    <OnesignWordmark height={38} color="white" />
                </div>
                <p
                    style={{
                        margin: 0,
                        fontFamily: FONT,
                        fontSize: 40,
                        fontWeight: 700,
                        color: '#fff',
                    }}
                >
                    Design your sign —{' '}
                    <span style={{ color: BRAND.accentGlow }}>free</span>
                </p>
                <p
                    style={{
                        margin: '10px 0 0',
                        fontFamily: MONO,
                        fontSize: 30,
                        color: BRAND.accentGlow,
                    }}
                >
                    onesignanddigital.com/design
                </p>
            </div>
        </Stage>
    );
};
