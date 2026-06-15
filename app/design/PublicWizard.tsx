'use client';

// app/design/PublicWizard.tsx
//
// The public "Design your sign" studio, rebuilt as a cinematic, guided WIZARD —
// the customer-facing front door that turns a visitor into a qualified lead.
//
// It drives the REAL engine (the same store, geometry derivation, Scene3D and
// the full ControlsPanel / SvgDropzone the staff tool uses), so customers keep
// every building capability — but reframed as a structured four-step journey:
//
//     Size & finish  →  Artwork  →  Light it up  →  Your details (send)
//
// styled in the shared Studio language (full-bleed dark stage as the hero, a
// frosted glass dock, the marquee day/night switch). The final step captures
// their contact details and posts the design to our Design Requests inbox via
// the UNAUTHENTICATED service-role action (CLAUDE.md §2c/§3) — honeypot + rate
// limit intact, no getUser()/requireAuth() anywhere on this path.
//
// UX shaped by research into award-winning 3D configurators + B2C lead forms:
// labelled stepper, free back-navigation, Next never disabled (validate on
// click), on-blur inline validation, a lean form (name + email required, the
// rest optional and marked), an outcome-named CTA with trust cues beneath it,
// a mobile bottom-sheet dock with the primary action in the thumb zone, and
// reduced-motion fallbacks throughout.

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    CheckCircle2,
    HelpCircle,
    ImageUp,
    Lightbulb,
    Loader2,
    Ruler,
    Send,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { useVisualiser } from '../(portal)/admin/visualiser/store';
import { ControlsPanel } from '../(portal)/admin/visualiser/ControlsPanel';
import { SvgDropzone } from '../(portal)/admin/visualiser/SvgDropzone';
import { usePanelDerivation } from '../(portal)/admin/visualiser/usePanelDerivation';
import { useSceneInteraction } from '../(portal)/admin/visualiser/useSceneInteraction';
import { sceneCapture } from '../(portal)/admin/visualiser/Scene3D';
import { trimImageDataUrl } from '@/lib/visualiser/image';
import { PanelParamsSchema } from '@/lib/visualiser/types';
import { submitDesignRequest } from '@/lib/design-requests/actions';
import { assembleDesignPayload } from './assemble';
import { StudioStage } from '@/components/studio/StudioStage';
import { DayNightSwitch } from '@/components/studio/StudioChrome';
import { BuiltUpModal, type BuiltUpResult } from './BuiltUpModal';
import { finishSpec } from '@/lib/visualiser/returns-finish';

const ACCENT = '#4e7e8c';
const ACCENT_GLOW = '#9ed0dc';

const Scene3D = dynamic(
    () => import('../(portal)/admin/visualiser/Scene3D'),
    { ssr: false, loading: () => <StageLoader /> },
);

/** Branded 3D loading state — never a blank stage. */
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

type StepKey = 'size' | 'artwork' | 'light' | 'details';

const STEPS: {
    key: StepKey;
    label: string;
    title: string;
    intro: string;
    Icon: typeof Ruler;
}[] = [
    {
        key: 'size',
        label: 'Size',
        title: 'Size & finish',
        intro: 'Set the dimensions, choose a colour or RAL match, and pick which edges fold back.',
        Icon: Ruler,
    },
    {
        key: 'artwork',
        label: 'Artwork',
        title: 'Add your artwork',
        intro: 'Upload your logo or lettering as an SVG — cut it into the face, raise it as stand-off letters, or mix materials.',
        Icon: ImageUp,
    },
    {
        key: 'light',
        label: 'Light',
        title: 'Light it up',
        intro: 'See how your sign looks glowing at night — flick the switch and add illumination.',
        Icon: Lightbulb,
    },
    {
        key: 'details',
        label: 'Send',
        title: 'Your details',
        intro: "Happy with it? Tell us where to send your quote and we'll take it from there.",
        Icon: Send,
    },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PublicWizard({ onShowHelp }: { onShowHelp?: () => void }) {
    const {
        params,
        setParam,
        addArtworkLayer,
        svgSource,
        imported: storeImported,
        projectingEnabled,
        activeTab,
        inactive,
        mount,
    } = useVisualiser();

    // Same pure-geometry pipeline as the staff tool — this is a live engine.
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
        reference: refPaths,
        materialPieces,
        standoffPieces,
        pushThroughPieces,
        backlightPieces,
        vinylPrintDataUrl,
        placedClipByIndex,
    } = deriv;

    // 3D interactivity — path-picking + fixing / cable placement. The public
    // studio has no flat tab to fall back to, so clicks must land in 3D.
    const interaction = useSceneInteraction(deriv);

    // ── View state (never persisted) ──────────────────────────────────────
    const [stepIdx, setStepIdx] = useState(0);
    const [night, setNight] = useState(false);
    const [view, setView] = useState<'folded' | 'unfold'>('folded');
    const [explodeT, setExplodeT] = useState(0);
    const [fold, setFold] = useState(1);
    const [unfoldKey, setUnfoldKey] = useState(0);
    const [dockOpen, setDockOpen] = useState(true);
    const [builtUpOpen, setBuiltUpOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [reducedMotion, setReducedMotion] = useState(false);

    // ── Contact / submission state ────────────────────────────────────────
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [company, setCompany] = useState('');
    const [postcode, setPostcode] = useState('');
    const [notes, setNotes] = useState('');
    const [honeypot, setHoneypot] = useState('');
    const [nameTouched, setNameTouched] = useState(false);
    const [emailTouched, setEmailTouched] = useState(false);
    const [preparing, setPreparing] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [reference, setReference] = useState<string | null>(null);
    const [sentThumb, setSentThumb] = useState<string | null>(null);
    // Synchronous in-flight latch — async pending flags can't guard a fast
    // double Enter before they commit.
    const inFlightRef = useRef(false);

    const step = STEPS[stepIdx];

    useEffect(() => {
        const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
        const sync = () => setReducedMotion(mq.matches);
        sync();
        mq.addEventListener('change', sync);
        return () => mq.removeEventListener('change', sync);
    }, []);

    useEffect(() => {
        const t = requestAnimationFrame(() => setMounted(true));
        return () => cancelAnimationFrame(t);
    }, []);

    // Auto-play the unfold (first value written inside the rAF callback, so no
    // synchronous setState in the effect body). Reduced motion snaps to flat.
    useEffect(() => {
        if (view !== 'unfold') return;
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
    }, [view, unfoldKey, reducedMotion]);

    const changeView = (v: 'folded' | 'unfold') => {
        setExplodeT(0);
        setView(v);
    };

    const goToStep = (i: number) => {
        setStepIdx(i);
        setDockOpen(true);
    };

    // ── Illumination quick-controls (mirrors the staff keyline glow) ───────
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

    const valid = PanelParamsSchema.safeParse(params);
    const specLine = `${params.panelWidthMm} × ${params.panelHeightMm} × ${params.returnDepthMm} mm`;
    const nameValid = name.trim().length > 0;
    const emailValid = EMAIL_RE.test(email.trim());

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

    // ── Submit ────────────────────────────────────────────────────────────
    const doSend = async () => {
        if (inFlightRef.current) return;
        inFlightRef.current = true;
        setPreparing(true);
        setError(null);
        try {
            const base = assembleDesignPayload({
                params,
                svgSource,
                imported: storeImported,
                projectingEnabled,
                activeTab,
                inactive,
                mount,
            });
            // Face-on shot trimmed to the sign (falls back to the orbit shot).
            const faceThumb =
                sceneCapture.faceOn?.() ?? sceneCapture.fn?.() ?? null;
            const thumbnail = faceThumb
                ? await trimImageDataUrl(faceThumb).catch(() => faceThumb)
                : null;
            setPreparing(false);
            setSubmitting(true);
            const res = await submitDesignRequest({
                customerName: name.trim(),
                customerEmail: email.trim(),
                customerPhone: phone.trim(),
                company: company.trim(),
                postcode: postcode.trim(),
                projectNotes: notes.trim(),
                signType: base.signType,
                params: base.params,
                svgSource: base.svgSource,
                thumbnail,
                companyWebsite: honeypot,
            });
            if (res.ok) {
                setSentThumb(thumbnail);
                setReference(res.data.reference);
            } else {
                setError(res.error);
            }
        } catch {
            setError(
                'Something went wrong sending your design — please try again.',
            );
        } finally {
            setPreparing(false);
            setSubmitting(false);
            inFlightRef.current = false;
        }
    };

    const handleSend = (e: React.FormEvent) => {
        e.preventDefault();
        if (preparing || submitting) return;
        // Validate on click (Next/Send are never disabled): reveal inline
        // errors and focus the first offending field instead of a dead button.
        setNameTouched(true);
        setEmailTouched(true);
        if (!nameValid || !emailValid) {
            document
                .getElementById(!nameValid ? 'cust-name' : 'cust-email')
                ?.focus();
            return;
        }
        if (!valid.success) {
            setError(
                valid.error.issues[0]?.message ??
                    'Please finish your design before sending.',
            );
            return;
        }
        void doSend();
    };

    const resetSuccess = () => {
        setReference(null);
        setSentThumb(null);
        setError(null);
        setNameTouched(false);
        setEmailTouched(false);
    };

    const firstName = name.trim().split(' ')[0] || 'there';

    // Premium built-up lettering placed from the modal: add the lettering as a
    // stand-off layer (the built-up look in 3D) and stash the full fabrication
    // spec on the design so it reaches the enquiry for production.
    const handleBuiltUp = (r: BuiltUpResult) => {
        addArtworkLayer(r.svgText, r.name);
        setParam('apertureMode', 'standoff');
        // The build-up depth is the letter's extrusion depth. Clamp to the
        // schema bound so a deep letter can't invalidate params (the true depth
        // is always preserved in `builtUp.returnDepthMm` for production).
        setParam('letterThicknessMm', Math.min(r.config.returnDepthMm, 200));
        setParam('letterColor', finishSpec(r.finish).face);
        setParam('builtUp', {
            finish: r.finish,
            returnDepthMm: r.config.returnDepthMm,
            materialThicknessMm: r.config.materialThicknessMm,
            breakAngleDeg: r.config.breakAngleDeg,
            stockLengthMm: r.config.stockLengthMm,
            realHeightMm: r.realHeightMm,
            totalReturnLengthMm: r.totalReturnLengthMm,
            weldCount: r.weldCount,
            faceCount: r.faceCount,
        });
        setBuiltUpOpen(false);
    };

    return (
        <div className="flex h-full flex-col">
            <StudioStage night={night} className="relative flex-1 min-h-0">
                {/* Accessible, non-visual description of the 3D preview (the
                    canvas itself is opaque to screen readers). Not aria-live —
                    it would announce on every dimension keystroke. */}
                <p className="sr-only">3D preview of your sign: {specLine}.</p>

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
                            reference={refPaths}
                            vinylPieces={materialPieces.vinyl}
                            acrylicPieces={materialPieces.acrylic}
                            solidPieces={materialPieces.solid}
                            standoffPieces={standoffPieces}
                            pushThroughPieces={pushThroughPieces}
                            backlightPieces={backlightPieces}
                            vinylPrintDataUrl={vinylPrintDataUrl}
                            placedPathsByIndex={placedClipByIndex}
                            pathGroupColors={interaction.pathGroupColors}
                            pendingPaths={interaction.pendingPathsSet}
                            isEditingGroup={interaction.isEditingGroup}
                            onPathToggle={interaction.handlePathPick}
                            fixingMode={interaction.fixingMode}
                            cableMode={interaction.cableMode}
                            cableHoles={interaction.cableHoles}
                            onFixingClick={interaction.handleFixingClick}
                            fold={view === 'folded' ? 1 : fold}
                            illuminationView={night}
                            illumination={params.illumination}
                            explodeT={view === 'folded' ? explodeT : 0}
                            reducedMotion={reducedMotion}
                        />
                    </div>
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-white/50">
                        Set valid panel dimensions to begin.
                    </div>
                )}

                {/* ── Top bar ───────────────────────────────────────────── */}
                <div
                    className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-3 p-3 md:p-5"
                    style={revealStyle}
                >
                    <div className="pointer-events-auto">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-white/45">
                            Design your sign
                        </p>
                        <h1 className="mt-0.5 text-base font-semibold tracking-tight text-white md:text-lg">
                            {step.title}
                        </h1>
                        {onShowHelp && !reference && (
                            <button
                                type="button"
                                onClick={onShowHelp}
                                className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-white/55 hover:text-white"
                            >
                                <HelpCircle size={12} aria-hidden /> Show me how
                            </button>
                        )}
                    </div>
                    {!reference && (
                        <div className="pointer-events-auto flex items-center gap-2 md:gap-3">
                            <ViewSwitch tab={view} onChange={changeView} />
                            <span data-tour="daynight">
                                <DayNightSwitch
                                    night={night}
                                    onChange={setNight}
                                />
                            </span>
                        </div>
                    )}
                </div>

                {/* ── Onboarding nudge (populated stage, gentle prompt) ──── */}
                {!storeImported && stepIdx === 0 && !reference && (
                    <div className="pointer-events-none absolute inset-x-3 top-20 z-10 flex justify-center md:top-24">
                        <div className="pointer-events-auto max-w-sm rounded-xl border border-white/10 bg-black/40 px-4 py-2.5 text-center text-[12px] text-white/70 backdrop-blur-md">
                            👋 Set your size below, then add your logo in step 2 —
                            the preview updates as you go. Drag to spin it.
                        </div>
                    </div>
                )}

                {/* ── The wizard dock ───────────────────────────────────── */}
                {!reference && (
                    <div
                        className="pointer-events-auto absolute inset-x-2 bottom-2 z-20 flex max-h-[62%] flex-col overflow-hidden rounded-2xl border border-white/60 bg-white/90 shadow-2xl backdrop-blur-2xl md:inset-y-5 md:left-5 md:right-auto md:bottom-5 md:top-5 md:max-h-none md:w-[360px]"
                        style={revealStyle}
                    >
                        {/* Stepper header (also the mobile sheet handle). */}
                        <div
                            data-tour="steps"
                            className="shrink-0 border-b border-neutral-200/70 px-3 py-3"
                        >
                            <div className="mb-2 flex items-center justify-center md:hidden">
                                <button
                                    type="button"
                                    onClick={() => setDockOpen((o) => !o)}
                                    aria-label={
                                        dockOpen
                                            ? 'Collapse panel'
                                            : 'Expand panel'
                                    }
                                    aria-expanded={dockOpen}
                                    className="flex h-6 items-center"
                                >
                                    <span className="h-1.5 w-10 rounded-full bg-neutral-300" />
                                </button>
                            </div>
                            <Stepper current={stepIdx} onJump={goToStep} />
                        </div>

                        <div
                            className={`min-h-0 flex-1 overflow-y-auto ${
                                dockOpen ? 'block' : 'hidden md:block'
                            }`}
                        >
                            <div className="px-4 py-3">
                                <p className="mb-3 text-[12px] leading-relaxed text-neutral-500">
                                    {step.intro}
                                </p>
                                {step.key === 'size' && (
                                    <ControlsPanel hideIllumination />
                                )}
                                {step.key === 'artwork' && (
                                    <div className="space-y-3">
                                        <button
                                            type="button"
                                            onClick={() => setBuiltUpOpen(true)}
                                            className="flex w-full items-center gap-3 rounded-lg border border-[#cfe0e6] bg-[#e8f0f3] px-3 py-2.5 text-left transition-colors hover:border-[#4e7e8c]"
                                        >
                                            <span
                                                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white"
                                                style={{ background: ACCENT }}
                                            >
                                                <Sparkles size={15} aria-hidden />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#3a5f6a]">
                                                    Built-up lettering
                                                    <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#3a5f6a]">
                                                        Premium
                                                    </span>
                                                </span>
                                                <span className="block text-[11px] text-[#3a5f6a]/80">
                                                    Fabricated metal letters with
                                                    real depth — build &amp;
                                                    preview in 3D.
                                                </span>
                                            </span>
                                            <ArrowRight
                                                size={15}
                                                aria-hidden
                                                className="shrink-0 text-[#4e7e8c]"
                                            />
                                        </button>
                                        <SvgDropzone />
                                    </div>
                                )}
                                {step.key === 'light' && (
                                    <LightStep
                                        night={night}
                                        onNight={setNight}
                                        glowOn={glowOn}
                                        onGlow={setGlow}
                                        glowIntensity={glowIntensity}
                                        onGlowIntensity={setGlowIntensity}
                                        somethingGlows={somethingGlows}
                                    />
                                )}
                                {step.key === 'details' && (
                                    <ContactForm
                                        name={name}
                                        setName={setName}
                                        email={email}
                                        setEmail={setEmail}
                                        phone={phone}
                                        setPhone={setPhone}
                                        company={company}
                                        setCompany={setCompany}
                                        postcode={postcode}
                                        setPostcode={setPostcode}
                                        notes={notes}
                                        setNotes={setNotes}
                                        honeypot={honeypot}
                                        setHoneypot={setHoneypot}
                                        nameTouched={nameTouched}
                                        setNameTouched={setNameTouched}
                                        emailTouched={emailTouched}
                                        setEmailTouched={setEmailTouched}
                                        nameValid={nameValid}
                                        emailValid={emailValid}
                                        error={error}
                                        onSubmit={handleSend}
                                    />
                                )}
                            </div>
                        </div>

                        {/* Footer nav — primary action sits in the thumb zone. */}
                        <div
                            className={`shrink-0 border-t border-neutral-200/70 px-3 py-2.5 ${
                                dockOpen ? 'flex' : 'hidden md:flex'
                            } items-center gap-2`}
                        >
                            {stepIdx > 0 ? (
                                <button
                                    type="button"
                                    onClick={() => goToStep(stepIdx - 1)}
                                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 px-3.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                                >
                                    <ArrowLeft size={15} aria-hidden /> Back
                                </button>
                            ) : (
                                <span />
                            )}
                            <div className="flex-1" />
                            {step.key !== 'details' ? (
                                <button
                                    type="button"
                                    onClick={() => goToStep(stepIdx + 1)}
                                    className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-colors"
                                    style={{ background: ACCENT }}
                                >
                                    Next <ArrowRight size={15} aria-hidden />
                                </button>
                            ) : (
                                <button
                                    type="submit"
                                    form="contact-form"
                                    disabled={preparing || submitting}
                                    aria-busy={preparing || submitting}
                                    className="flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:opacity-60 sm:flex-none"
                                    style={{ background: ACCENT }}
                                >
                                    {preparing || submitting ? (
                                        <Loader2
                                            size={16}
                                            className="animate-spin"
                                            aria-hidden
                                        />
                                    ) : (
                                        <Send size={16} aria-hidden />
                                    )}
                                    {preparing
                                        ? 'Preparing…'
                                        : submitting
                                          ? 'Sending…'
                                          : 'Send my design'}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {/* ── Bottom motion dock (3D views only) ────────────────── */}
                {!reference &&
                    step.key !== 'details' &&
                    (view === 'folded' || view === 'unfold') && (
                        <div
                            className="pointer-events-none absolute inset-x-0 bottom-4 z-10 hidden justify-center md:flex"
                            style={revealStyle}
                        >
                            <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-white/15 bg-black/30 px-4 py-2 backdrop-blur-md">
                                <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                                    {view === 'folded' ? 'Assembled' : 'Flat'}
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={100}
                                    value={
                                        view === 'folded'
                                            ? Math.round(explodeT * 100)
                                            : Math.round(fold * 100)
                                    }
                                    onChange={(e) => {
                                        const v = Number(e.target.value) / 100;
                                        if (view === 'folded') setExplodeT(v);
                                        else setFold(v);
                                    }}
                                    className="h-2 w-40"
                                    style={{ accentColor: ACCENT_GLOW }}
                                    aria-label={
                                        view === 'folded'
                                            ? 'Explode amount'
                                            : 'Fold amount'
                                    }
                                />
                                <span className="text-[10px] font-medium uppercase tracking-wide text-white/45">
                                    {view === 'folded' ? 'Exploded' : 'Folded'}
                                </span>
                                {view === 'unfold' && (
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setUnfoldKey((k) => k + 1)
                                        }
                                        className="ml-1 rounded-full px-3 py-1 text-[11px] font-semibold text-[#0c1114]"
                                        style={{ background: ACCENT_GLOW }}
                                    >
                                        Replay
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                {/* ── Spec HUD ──────────────────────────────────────────── */}
                {!reference && (
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
                )}

                {/* ── Success ───────────────────────────────────────────── */}
                {reference && (
                    <SuccessCard
                        firstName={firstName}
                        reference={reference}
                        thumbnail={sentThumb}
                        onBack={resetSuccess}
                    />
                )}
            </StudioStage>
            <BuiltUpModal
                open={builtUpOpen}
                onClose={() => setBuiltUpOpen(false)}
                onConfirm={handleBuiltUp}
            />
        </div>
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
    const items: Array<['folded' | 'unfold', string]> = [
        ['folded', '3D'],
        ['unfold', 'Unfold'],
    ];
    return (
        <div className="flex items-center gap-1 rounded-full border border-white/25 bg-[#0c1114]/60 p-1 shadow-lg backdrop-blur-md">
            {items.map(([key, label]) => {
                const active = tab === key;
                return (
                    <button
                        key={key}
                        type="button"
                        onClick={() => onChange(key)}
                        aria-pressed={active}
                        className={`min-h-[36px] rounded-full px-3.5 text-[11px] font-semibold tracking-wide transition-colors ${
                            active ? 'text-[#0c1114]' : 'text-white/75 hover:text-white'
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

/** Labelled, clickable stepper — current highlighted, past steps ticked. */
function Stepper({
    current,
    onJump,
}: {
    current: number;
    onJump: (i: number) => void;
}) {
    return (
        <ol className="flex items-center gap-1">
            {STEPS.map((s, i) => {
                const done = i < current;
                const active = i === current;
                return (
                    <li key={s.key} className="flex flex-1 items-center">
                        <button
                            type="button"
                            onClick={() => onJump(i)}
                            aria-current={active ? 'step' : undefined}
                            className="group flex flex-1 flex-col items-center gap-1"
                            title={s.title}
                        >
                            <span
                                className={`flex h-8 w-8 items-center justify-center rounded-full text-[12px] font-bold tabular-nums transition-colors ${
                                    active
                                        ? 'text-white'
                                        : done
                                          ? 'text-white'
                                          : 'text-neutral-500 group-hover:bg-neutral-100'
                                }`}
                                style={
                                    active
                                        ? { background: ACCENT }
                                        : done
                                          ? { background: ACCENT_GLOW }
                                          : { background: '#eef1f3' }
                                }
                            >
                                {done ? (
                                    <Check size={15} aria-hidden />
                                ) : (
                                    i + 1
                                )}
                            </span>
                            <span
                                className={`text-[10px] font-semibold uppercase tracking-wide ${
                                    active
                                        ? 'text-neutral-800'
                                        : 'text-neutral-400'
                                }`}
                            >
                                {s.label}
                            </span>
                        </button>
                    </li>
                );
            })}
        </ol>
    );
}

/** The "Light it up" step — the day/night wow, plus glow controls. */
function LightStep({
    night,
    onNight,
    glowOn,
    onGlow,
    glowIntensity,
    onGlowIntensity,
    somethingGlows,
}: {
    night: boolean;
    onNight: (v: boolean) => void;
    glowOn: boolean;
    onGlow: (v: boolean) => void;
    glowIntensity: number;
    onGlowIntensity: (v: number) => void;
    somethingGlows: boolean;
}) {
    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-lg bg-[#11171b] px-3 py-2.5">
                <span className="text-[12px] font-medium text-white/80">
                    Day / night preview
                </span>
                <DayNightSwitch night={night} onChange={onNight} />
            </div>
            <label className="flex min-h-[44px] items-center justify-between gap-3">
                <span className="text-[13px] font-medium text-neutral-700">
                    Edge / keyline glow
                </span>
                <button
                    type="button"
                    role="switch"
                    aria-checked={glowOn}
                    aria-label="Toggle edge glow"
                    onClick={() => onGlow(!glowOn)}
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
                            onGlowIntensity(Number(e.target.value))
                        }
                        className="mt-1.5 w-full"
                        style={{ accentColor: ACCENT }}
                    />
                </label>
            )}
            {night && !somethingGlows && (
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                    It&apos;s dark but nothing&apos;s lit yet — switch on the
                    keyline glow above, or add illuminated lettering back in
                    <span className="font-medium"> Artwork</span>.
                </p>
            )}
        </div>
    );
}

/** The lead-capture form (final step). Name + email required; the rest
 *  optional and marked. Validates on blur; the host validates again on send. */
function ContactForm(props: {
    name: string;
    setName: (v: string) => void;
    email: string;
    setEmail: (v: string) => void;
    phone: string;
    setPhone: (v: string) => void;
    company: string;
    setCompany: (v: string) => void;
    postcode: string;
    setPostcode: (v: string) => void;
    notes: string;
    setNotes: (v: string) => void;
    honeypot: string;
    setHoneypot: (v: string) => void;
    nameTouched: boolean;
    setNameTouched: (v: boolean) => void;
    emailTouched: boolean;
    setEmailTouched: (v: boolean) => void;
    nameValid: boolean;
    emailValid: boolean;
    error: string | null;
    onSubmit: (e: React.FormEvent) => void;
}) {
    const nameError = props.nameTouched && !props.nameValid;
    const emailError = props.emailTouched && !props.emailValid;
    return (
        <form id="contact-form" onSubmit={props.onSubmit} className="space-y-3">
            <Field
                id="cust-name"
                label="Your name"
                required
                value={props.name}
                onChange={props.setName}
                onBlur={() => props.setNameTouched(true)}
                error={nameError ? 'Please enter your name' : null}
                valid={props.nameTouched && props.nameValid}
                autoComplete="name"
            />
            <Field
                id="cust-email"
                label="Email"
                required
                type="email"
                value={props.email}
                onChange={props.setEmail}
                onBlur={() => props.setEmailTouched(true)}
                error={emailError ? 'Enter a valid email address' : null}
                valid={props.emailTouched && props.emailValid}
                autoComplete="email"
            />
            <Field
                id="cust-phone"
                label="Phone"
                optionalHint="if you'd rather we call you back"
                type="tel"
                value={props.phone}
                onChange={props.setPhone}
                autoComplete="tel"
            />
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field
                    id="cust-company"
                    label="Company"
                    optional
                    value={props.company}
                    onChange={props.setCompany}
                    autoComplete="organization"
                />
                <Field
                    id="cust-postcode"
                    label="Postcode"
                    optionalHint="so we can check we cover your area"
                    value={props.postcode}
                    onChange={props.setPostcode}
                    autoComplete="postal-code"
                />
            </div>
            <label className="block">
                <span className="text-[12px] font-medium text-neutral-600">
                    Tell us about your sign{' '}
                    <span className="text-neutral-400">(optional)</span>
                </span>
                <textarea
                    value={props.notes}
                    onChange={(e) => props.setNotes(e.target.value)}
                    rows={3}
                    placeholder="Timescales, quantity, where it's going, brand colours…"
                    className="mt-1 w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm outline-none focus:border-[#4e7e8c] focus:ring-1 focus:ring-[#4e7e8c]"
                />
            </label>

            {/* Honeypot — off-screen, not tabbable. A human never fills this. */}
            <div
                aria-hidden
                style={{
                    position: 'absolute',
                    left: '-9999px',
                    width: 1,
                    height: 1,
                    overflow: 'hidden',
                }}
            >
                <label>
                    Company website
                    <input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={props.honeypot}
                        onChange={(e) => props.setHoneypot(e.target.value)}
                    />
                </label>
            </div>

            {props.error && (
                <p
                    role="alert"
                    className="rounded-md bg-red-50 px-3 py-2 text-[12px] text-red-700"
                >
                    {props.error}
                </p>
            )}

            {/* Trust cues — beside the action (the Send button lives in the
                dock footer / thumb zone). */}
            <div className="space-y-1.5 pt-0.5">
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-neutral-600">
                    <ShieldCheck size={14} aria-hidden style={{ color: ACCENT }} />
                    Free, no-obligation quote — we usually reply within 1 working
                    day.
                </p>
                <p className="text-[11px] leading-relaxed text-neutral-400">
                    We&apos;ll only use your details to quote this job. No spam,
                    ever.
                </p>
            </div>
        </form>
    );
}

function Field({
    id,
    label,
    value,
    onChange,
    onBlur,
    type = 'text',
    required,
    optional,
    optionalHint,
    error,
    valid,
    autoComplete,
}: {
    id: string;
    label: string;
    value: string;
    onChange: (v: string) => void;
    onBlur?: () => void;
    type?: string;
    required?: boolean;
    optional?: boolean;
    optionalHint?: string;
    error?: string | null;
    valid?: boolean;
    autoComplete?: string;
}) {
    return (
        <label htmlFor={id} className="block">
            <span className="text-[12px] font-medium text-neutral-600">
                {label}
                {required && <span className="text-red-500"> *</span>}
                {(optional || optionalHint) && (
                    <span className="font-normal text-neutral-400">
                        {' '}
                        (optional{optionalHint ? ` — ${optionalHint}` : ''})
                    </span>
                )}
            </span>
            <div className="relative mt-1">
                <input
                    id={id}
                    type={type}
                    required={required}
                    value={value}
                    autoComplete={autoComplete}
                    aria-invalid={!!error}
                    onChange={(e) => onChange(e.target.value)}
                    onBlur={onBlur}
                    className={`min-h-[44px] w-full rounded-lg border px-3 py-2 text-sm outline-none transition-colors focus:ring-1 ${
                        error
                            ? 'border-red-400 focus:border-red-500 focus:ring-red-200'
                            : valid
                              ? 'border-emerald-400 focus:border-emerald-500 focus:ring-emerald-200'
                              : 'border-neutral-300 focus:border-[#4e7e8c] focus:ring-[#4e7e8c]'
                    }`}
                />
                {valid && !error && (
                    <Check
                        size={15}
                        aria-hidden
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500"
                    />
                )}
            </div>
            {error && (
                <span className="mt-0.5 block text-[11px] text-red-600">
                    {error}
                </span>
            )}
        </label>
    );
}

/** Celebratory confirmation over the (still-visible) sign. */
function SuccessCard({
    firstName,
    reference,
    thumbnail,
    onBack,
}: {
    firstName: string;
    reference: string;
    thumbnail: string | null;
    onBack: () => void;
}) {
    return (
        <div className="absolute inset-0 z-30 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" />
            <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/60 bg-white/95 p-6 text-center shadow-2xl">
                <CheckCircle2
                    size={44}
                    className="mx-auto"
                    style={{ color: ACCENT }}
                    aria-hidden
                />
                <h2 className="mt-3 text-xl font-bold tracking-tight text-neutral-900">
                    Your design&apos;s on its way, {firstName}!
                </h2>
                {thumbnail ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={thumbnail}
                        alt="Your sign design"
                        className="mx-auto mt-4 h-24 w-auto rounded-lg border border-neutral-200 object-contain"
                    />
                ) : null}
                <p className="mx-auto mt-3 max-w-sm text-sm text-neutral-600">
                    Our team will review it and email you a quote — quote this
                    reference if you get in touch:
                </p>
                <p
                    className="mt-3 inline-block rounded-lg border border-dashed px-4 py-2 font-mono text-sm font-semibold"
                    style={{ borderColor: ACCENT, color: '#3a5f6a' }}
                >
                    {reference}
                </p>
                <ol className="mx-auto mt-5 grid max-w-xs gap-2 text-left text-[12px] text-neutral-600">
                    {[
                        'We review your design',
                        'We email your quote — usually within 1 working day',
                        'We make the real thing',
                    ].map((s, i) => (
                        <li key={i} className="flex items-center gap-2.5">
                            <span
                                className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white"
                                style={{ background: ACCENT }}
                            >
                                {i + 1}
                            </span>
                            {s}
                        </li>
                    ))}
                </ol>
                <button
                    type="button"
                    onClick={onBack}
                    className="mt-6 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white shadow-sm"
                    style={{ background: ACCENT }}
                >
                    <ArrowLeft size={15} aria-hidden />
                    Back to my design
                </button>
            </div>
        </div>
    );
}
