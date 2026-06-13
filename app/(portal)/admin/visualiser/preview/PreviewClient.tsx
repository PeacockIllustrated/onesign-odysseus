'use client';

import {
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    ArrowUpRight,
    ChevronDown,
    ImageUp,
    Lightbulb,
    Moon,
    Ruler,
    Send,
    Sun,
} from 'lucide-react';
import { useVisualiser } from '../store';
import { ControlsPanel } from '../ControlsPanel';
import { SvgDropzone } from '../SvgDropzone';
import { usePanelDerivation } from '../usePanelDerivation';

/**
 * ──────────────────────────────────────────────────────────────────────────
 * VISUALISER — CINEMATIC CONCEPT (test overhaul)
 * ──────────────────────────────────────────────────────────────────────────
 *
 * A throw-away-able UX/UI exploration of the panel visualiser, styled after
 * the award-winning 3D product configurators on Awwwards (Lusion, Demodern's
 * smart car configurator, iyO, COPENTEK, Modelec). It deliberately does NOT
 * fork the engine: it mounts the SAME zustand store, the SAME geometry
 * derivation, the SAME `Scene3D`, and the SAME `ControlsPanel` / `SvgDropzone`
 * the production tool uses — so it is a live, working visualiser, not a mockup.
 * Everything that changed is the *shell*: the flow and the skin.
 *
 * The four moves borrowed from the winners:
 *   1. The product is the hero — a full-bleed, edge-to-edge dark 3D stage.
 *      Controls float over it as glass surfaces instead of stealing a column.
 *   2. A guided journey — Size → Artwork → Light → Send — one step at a time,
 *      rather than every control shouting at once (the current tool's failing).
 *   3. A marquee day/night moment — the single most persuasive interaction for
 *      illuminated signage, promoted to a hero switch (drives `illuminationView`).
 *   4. Confident, editorial type + eased motion + a branded loader.
 *
 * Production-safety: this is a NEW admin-only route. It imports the real
 * components but mutates nothing about them. Because the store is a module
 * singleton, "Continue in the full tool" genuinely carries the design across.
 */

const Scene3D = dynamic(() => import('../Scene3D'), {
    ssr: false,
    loading: () => <StageLoader />,
});

const ACCENT = '#4e7e8c';
// Brightened teal — the brand accent reads muddy on a near-black stage, so the
// HUD glints/active states use this lifted variant.
const ACCENT_GLOW = '#9ed0dc';

/** Branded 3D loading state — a calm spinner, not a bare "Loading…". */
function StageLoader() {
    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
            <div className="relative h-12 w-12">
                <span className="absolute inset-0 rounded-full border-2 border-white/10" />
                <span
                    className="absolute inset-0 animate-spin rounded-full border-2 border-transparent"
                    style={{ borderTopColor: ACCENT_GLOW }}
                />
            </div>
            <p className="text-[10px] font-medium uppercase tracking-[0.35em] text-white/45">
                Building your sign
            </p>
        </div>
    );
}

/**
 * The marquee interaction: a tactile day / night switch. Sliding the knob to
 * the moon darkens the stage and lights any configured illumination — the
 * "wow" beat for an illuminated-signage product.
 */
function DayNightSwitch({
    night,
    onChange,
}: {
    night: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={night}
            aria-label="Toggle day / night preview"
            onClick={() => onChange(!night)}
            title="Day / night preview"
            className="relative flex h-10 w-[5.5rem] items-center rounded-full border border-white/15 bg-white/10 px-1 backdrop-blur-md transition-colors hover:border-white/30"
        >
            <Sun
                size={15}
                aria-hidden
                className={`absolute left-2.5 transition-opacity ${
                    night ? 'text-white/40 opacity-40' : 'text-amber-300 opacity-100'
                }`}
            />
            <Moon
                size={14}
                aria-hidden
                className={`absolute right-2.5 transition-opacity ${
                    night ? 'text-sky-200 opacity-100' : 'text-white/40 opacity-40'
                }`}
            />
            <span
                className="z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white shadow-md transition-transform duration-300 ease-out"
                style={{ transform: night ? 'translateX(46px)' : 'translateX(0)' }}
            >
                {night ? (
                    <Moon size={14} aria-hidden className="text-[#1a1f23]" />
                ) : (
                    <Sun size={15} aria-hidden className="text-amber-500" />
                )}
            </span>
        </button>
    );
}

/** Minimal dark-glass segmented control for the two cinematic 3D views. */
function ViewSwitch({
    tab,
    onChange,
}: {
    tab: 'folded' | 'unfold';
    onChange: (t: 'folded' | 'unfold') => void;
}) {
    const items: Array<[typeof tab, string]> = [
        ['folded', '3D'],
        ['unfold', 'Unfold'],
    ];
    return (
        <div className="flex items-center gap-1 rounded-full border border-white/15 bg-white/10 p-1 backdrop-blur-md">
            {items.map(([key, label]) => {
                const active = tab === key;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        aria-pressed={active}
                        className={`rounded-full px-3.5 py-1.5 text-[11px] font-semibold tracking-wide transition-colors ${
                            active
                                ? 'text-[#0c1114]'
                                : 'text-white/60 hover:text-white'
                        }`}
                        style={active ? { background: ACCENT_GLOW } : undefined}
                    >
                        {label}
                    </button>
                );
            })}
        </div>
    );
}

type StepKey = 'shape' | 'artwork' | 'light' | 'send';

/** One numbered step in the guided journey dock. */
function StepRow({
    index,
    title,
    caption,
    Icon,
    open,
    onToggle,
    children,
}: {
    index: number;
    title: string;
    caption: string;
    Icon: typeof Ruler;
    open: boolean;
    onToggle: () => void;
    children: ReactNode;
}) {
    return (
        <div className="border-b border-neutral-200/70 last:border-b-0">
            <button
                type="button"
                onClick={onToggle}
                aria-expanded={open}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50/80"
            >
                <span
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-bold tabular-nums transition-colors"
                    style={
                        open
                            ? { background: ACCENT, color: '#fff' }
                            : { background: '#e8f0f3', color: ACCENT }
                    }
                >
                    {index}
                </span>
                <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-neutral-900">
                        <Icon size={13} aria-hidden style={{ color: ACCENT }} />
                        {title}
                    </span>
                    <span className="block truncate text-[11px] text-neutral-500">
                        {caption}
                    </span>
                </span>
                <ChevronDown
                    size={16}
                    aria-hidden
                    className={`shrink-0 text-neutral-400 transition-transform ${
                        open ? 'rotate-180' : ''
                    }`}
                />
            </button>
            {open && (
                <div className="px-4 pb-4 pt-1 motion-safe:animate-[fadeIn_0.25s_ease]">
                    {children}
                </div>
            )}
        </div>
    );
}

export function PreviewClient() {
    const { params, setParam, svgSource, imported: storeImported } =
        useVisualiser();

    // The exact same pure-geometry pipeline the production visualiser runs.
    const deriv = usePanelDerivation(params, storeImported, svgSource);
    const {
        development,
        split,
        aperture,
        keyline,
        pushThroughKeyline,
        pushThroughIslands,
        autoFixings,
        manualFixings,
        reference,
        materialPieces,
        standoffPieces,
        pushThroughPieces,
        backlightPieces,
        vinylPrintDataUrl,
        placedClipByIndex,
    } = deriv;

    // ── View state (never persisted — pure presentation) ──────────────────
    const [tab, setTab] = useState<'folded' | 'unfold'>('folded');
    const [night, setNight] = useState(false);
    const [explodeT, setExplodeT] = useState(0);
    const [fold, setFold] = useState(1);
    const [unfoldKey, setUnfoldKey] = useState(0);
    const [activeStep, setActiveStep] = useState<StepKey>('shape');
    const [dockOpen, setDockOpen] = useState(true);
    const [mounted, setMounted] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReducedMotion(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    // First-paint reveal — the chrome eases in over the stage.
    useEffect(() => {
        const t = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(t);
    }, []);

    // Switch cinematic view. Resetting the explode here (an event handler,
    // not an effect) keeps the folded view re-entering assembled.
    const changeView = (t: 'folded' | 'unfold') => {
        setExplodeT(0);
        setTab(t);
    };

    // Auto-play the unfold the moment the view opens / is replayed. The first
    // value is written inside the rAF callback (next frame), so nothing sets
    // state synchronously in the effect body. Reduced motion snaps straight to
    // flat via a zero-duration run.
    useEffect(() => {
        if (tab !== 'unfold') return;
        let raf = 0;
        const dur = reducedMotion ? 0 : 1400;
        const t0 = performance.now();
        const tick = (now: number) => {
            const t = dur === 0 ? 1 : Math.min(1, (now - t0) / dur);
            const eased = 1 - Math.pow(1 - t, 3);
            setFold(1 - eased);
            if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, [tab, unfoldKey, reducedMotion]);

    // ── Illumination quick-controls (mirrors the production keyline glow) ──
    const glowOn = !!params.illumination?.keyline?.enabled;
    const glowIntensity = params.illumination?.keyline?.intensity ?? 1;
    const somethingGlows =
        glowOn || backlightPieces.length > 0 || pushThroughPieces.length > 0;

    const setGlow = (enabled: boolean) => {
        const kl = params.illumination?.keyline ?? {
            enabled: false,
            color: '#ffffff',
            intensity: 1,
        };
        setParam('illumination', {
            ...params.illumination,
            keyline: { ...kl, enabled },
        });
    };
    const setGlowIntensity = (intensity: number) => {
        const kl = params.illumination?.keyline ?? {
            enabled: true,
            color: '#ffffff',
            intensity: 1,
        };
        setParam('illumination', {
            ...params.illumination,
            keyline: { ...kl, enabled: true, intensity },
        });
    };

    const specLine = `${params.panelWidthMm} × ${params.panelHeightMm} × ${params.returnDepthMm} mm`;

    // The eased reveal, gated on reduced-motion.
    const revealStyle = useMemo(
        () =>
            reducedMotion
                ? undefined
                : ({
                      opacity: mounted ? 1 : 0,
                      transform: mounted ? 'translateY(0)' : 'translateY(8px)',
                      transition: 'opacity 0.6s ease, transform 0.6s ease',
                  } as const),
        [mounted, reducedMotion],
    );

    const steps: Array<{
        key: StepKey;
        title: string;
        caption: string;
        Icon: typeof Ruler;
        body: ReactNode;
    }> = [
        {
            key: 'shape',
            title: 'Shape & finish',
            caption: 'Dimensions, returns, colour & materials',
            Icon: Ruler,
            // The real, full-fidelity controls — every capability the staff
            // tool has, just reframed inside the journey.
            body: <ControlsPanel />,
        },
        {
            key: 'artwork',
            title: 'Artwork',
            caption: 'Upload a logo or lettering & group materials',
            Icon: ImageUp,
            body: <SvgDropzone />,
        },
        {
            key: 'light',
            title: 'Light it up',
            caption: 'Preview the sign glowing at night',
            Icon: Lightbulb,
            body: (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 rounded-lg bg-[#11171b] px-3 py-2.5">
                        <span className="text-[11px] font-medium text-white/80">
                            Day / night preview
                        </span>
                        <DayNightSwitch night={night} onChange={setNight} />
                    </div>
                    <label className="flex items-center justify-between gap-3">
                        <span className="text-[12px] font-medium text-neutral-700">
                            Edge / keyline glow
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={glowOn}
                            onClick={() => setGlow(!glowOn)}
                            className={`relative h-6 w-11 rounded-full transition-colors ${
                                glowOn ? '' : 'bg-neutral-300'
                            }`}
                            style={glowOn ? { background: ACCENT } : undefined}
                        >
                            <span
                                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform"
                                style={{
                                    transform: glowOn
                                        ? 'translateX(22px)'
                                        : 'translateX(2px)',
                                }}
                            />
                        </button>
                    </label>
                    {glowOn && (
                        <label className="block">
                            <span className="flex items-center justify-between text-[11px] font-medium text-neutral-600">
                                Glow intensity
                                <span className="tabular-nums text-neutral-400">
                                    {glowIntensity.toFixed(1)}
                                </span>
                            </span>
                            <input
                                type="range"
                                min={0.2}
                                max={3}
                                step={0.1}
                                value={glowIntensity}
                                onChange={(e) =>
                                    setGlowIntensity(Number(e.target.value))
                                }
                                className="mt-1.5 w-full"
                                style={{ accentColor: ACCENT }}
                            />
                        </label>
                    )}
                    {night && !somethingGlows && (
                        <p className="rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-800">
                            Nothing is lit yet — switch on the keyline glow above,
                            or add a push-through / backlit material under
                            <span className="font-medium"> Shape &amp; finish</span>.
                        </p>
                    )}
                </div>
            ),
        },
        {
            key: 'send',
            title: 'Review & send',
            caption: 'Hand the design to production',
            Icon: Send,
            body: (
                <div className="space-y-3">
                    <dl className="space-y-1.5 rounded-lg bg-neutral-50 px-3 py-2.5 text-[12px]">
                        <div className="flex justify-between gap-3">
                            <dt className="text-neutral-500">Panel</dt>
                            <dd className="font-medium tabular-nums text-neutral-800">
                                {specLine}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-neutral-500">Material</dt>
                            <dd className="font-medium text-neutral-800">
                                {params.materialLabel}
                            </dd>
                        </div>
                        <div className="flex justify-between gap-3">
                            <dt className="text-neutral-500">Artwork</dt>
                            <dd className="font-medium text-neutral-800">
                                {storeImported
                                    ? `${storeImported.paths.length} path${
                                          storeImported.paths.length === 1
                                              ? ''
                                              : 's'
                                      }`
                                    : 'None yet'}
                            </dd>
                        </div>
                    </dl>
                    <Link
                        href="/admin/visualiser"
                        className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors"
                        style={{ background: ACCENT }}
                    >
                        Continue in the full tool
                        <ArrowUpRight size={15} aria-hidden />
                    </Link>
                    <p className="text-center text-[11px] text-neutral-400">
                        Your design carries straight over — exports, save &amp;
                        production hand-off live there.
                    </p>
                </div>
            ),
        },
    ];

    return (
        <div className="flex flex-col gap-2 h-[calc(100dvh-7rem)] md:min-h-[600px]">
            {/* fadeIn keyframes for the step bodies (scoped, tiny). */}
            <style>{`@keyframes fadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}`}</style>

            {/* The cinematic stage — full-bleed dark, the sign as the hero. */}
            <div
                className="relative flex-1 min-h-0 overflow-hidden rounded-3xl border border-white/10 shadow-2xl"
                style={{
                    background: night
                        ? 'radial-gradient(120% 90% at 50% 0%, #0a1014 0%, #04070a 60%, #020405 100%)'
                        : 'radial-gradient(120% 90% at 50% 0%, #1a242a 0%, #0d1418 55%, #080c0f 100%)',
                    transition: 'background 0.7s ease',
                }}
            >
                {/* Soft accent halo for depth (muted at night). */}
                <div
                    aria-hidden
                    className="pointer-events-none absolute -top-1/3 left-1/2 h-[60%] w-[80%] -translate-x-1/2 rounded-full blur-3xl"
                    style={{
                        background: ACCENT_GLOW,
                        opacity: night ? 0.04 : 0.1,
                        transition: 'opacity 0.7s ease',
                    }}
                />

                {/* The real 3D engine. */}
                {development && split ? (
                    <div className="absolute inset-0">
                        <Scene3D
                            params={params}
                            development={development}
                            split={split}
                            aperture={aperture}
                            keyline={keyline}
                            pushThroughKeyline={pushThroughKeyline}
                            pushThroughIslands={pushThroughIslands}
                            autoFixings={autoFixings}
                            manualFixings={manualFixings}
                            reference={reference}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            solidPieces={materialPieces.solid}
                            standoffPieces={standoffPieces}
                            pushThroughPieces={pushThroughPieces}
                            backlightPieces={backlightPieces}
                            vinylPrintDataUrl={vinylPrintDataUrl}
                            placedPathsByIndex={placedClipByIndex}
                            fold={tab === 'folded' ? 1 : fold}
                            illuminationView={night}
                            illumination={params.illumination}
                            explodeT={tab === 'folded' ? explodeT : 0}
                            reducedMotion={reducedMotion}
                        />
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center text-sm text-white/50">
                        Set valid panel dimensions to begin.
                    </div>
                )}

                {/* ── Top bar ───────────────────────────────────────────── */}
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-4 md:p-5"
                    style={revealStyle}
                >
                    <div className="pointer-events-auto">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
                            Onesign Studio · concept
                        </p>
                        <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-white md:text-xl">
                            Design your sign
                        </h1>
                    </div>
                    <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
                        <ViewSwitch tab={tab} onChange={changeView} />
                        <DayNightSwitch night={night} onChange={setNight} />
                    </div>
                </div>

                {/* ── Guided journey dock (frosted light surface) ───────── */}
                <div
                    className="pointer-events-auto absolute inset-x-3 bottom-3 z-20 flex max-h-[58%] flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/85 shadow-2xl backdrop-blur-2xl md:inset-y-5 md:left-5 md:right-auto md:bottom-5 md:top-5 md:max-h-none md:w-[350px]"
                    style={revealStyle}
                >
                    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-neutral-200/70 px-4 py-3">
                        <span className="text-[10px] font-semibold uppercase tracking-[0.25em] text-neutral-500">
                            Build
                        </span>
                        <button
                            type="button"
                            onClick={() => setDockOpen((o) => !o)}
                            aria-expanded={dockOpen}
                            className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600 md:hidden"
                            aria-label={dockOpen ? 'Collapse' : 'Expand'}
                        >
                            <ChevronDown
                                size={16}
                                aria-hidden
                                className={`transition-transform ${
                                    dockOpen ? '' : 'rotate-180'
                                }`}
                            />
                        </button>
                    </div>
                    <div
                        className={`min-h-0 flex-1 overflow-y-auto ${
                            dockOpen ? 'block' : 'hidden md:block'
                        }`}
                    >
                        {steps.map((s, i) => (
                            <StepRow
                                key={s.key}
                                index={i + 1}
                                title={s.title}
                                caption={s.caption}
                                Icon={s.Icon}
                                open={activeStep === s.key}
                                onToggle={() =>
                                    setActiveStep((cur) =>
                                        cur === s.key ? cur : s.key,
                                    )
                                }
                            >
                                {s.body}
                            </StepRow>
                        ))}
                    </div>
                </div>

                {/* ── Bottom-centre motion dock (view-contextual) ───────── */}
                {(tab === 'folded' || tab === 'unfold') && (
                    <div
                        className="pointer-events-none absolute inset-x-0 bottom-4 z-10 hidden justify-center md:flex"
                        style={revealStyle}
                    >
                        <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/15 bg-black/30 px-4 py-2 backdrop-blur-md">
                            <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                                {tab === 'folded' ? 'Assembled' : 'Flat'}
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={
                                    tab === 'folded'
                                        ? Math.round(explodeT * 100)
                                        : Math.round(fold * 100)
                                }
                                onChange={(e) => {
                                    const v = Number(e.target.value) / 100;
                                    if (tab === 'folded') setExplodeT(v);
                                    else setFold(v);
                                }}
                                className="h-2 w-44"
                                style={{ accentColor: ACCENT_GLOW }}
                                aria-label={
                                    tab === 'folded'
                                        ? 'Explode amount'
                                        : 'Fold amount'
                                }
                            />
                            <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                                {tab === 'folded' ? 'Exploded' : 'Folded'}
                            </span>
                            {tab === 'unfold' && (
                                <button
                                    type="button"
                                    onClick={() => setUnfoldKey((k) => k + 1)}
                                    className="ml-1 rounded-full px-3 py-1 text-[11px] font-semibold text-[#0c1114]"
                                    style={{ background: ACCENT_GLOW }}
                                >
                                    Replay
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Spec HUD (bottom-right) ───────────────────────────── */}
                <div
                    className="pointer-events-none absolute bottom-4 right-4 z-10 hidden flex-col items-end gap-0.5 text-right md:flex"
                    style={revealStyle}
                >
                    <span className="rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] font-semibold tabular-nums text-white/85 backdrop-blur-md">
                        {specLine}
                    </span>
                    <span className="px-1 text-[10px] uppercase tracking-wide text-white/40">
                        {params.materialLabel}
                    </span>
                </div>
            </div>
        </div>
    );
}
