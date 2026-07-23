'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, X } from 'lucide-react';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

export interface TourStep {
    /** CSS selector for the element to spotlight (e.g. `[data-tour="upload"]`). */
    selector: string;
    title: string;
    body: string;
    /**
     * Wizard step index this tour stop lives on. The host switches the wizard to
     * it (via `onStepChange`) so the spotlighted control is actually on screen —
     * turning the tour into a real walkthrough rather than a chrome-only intro.
     */
    wizardStep?: number;
    /**
     * Optional placement hint for the tooltip relative to the target. Defaults
     * to 'auto' (below if there's room, otherwise above; centred if the target
     * can't be found — e.g. hidden in a collapsed mobile pane).
     */
    placement?: 'auto' | 'top' | 'bottom' | 'center';
}

interface Rect {
    top: number;
    left: number;
    width: number;
    height: number;
}

const PAD = 8; // spotlight padding around the target
const CARD_W = 320; // tooltip width (clamped to viewport)
const GAP = 14; // gap between spotlight and tooltip

/**
 * Some anchors exist twice — once in the desktop dock, once in the mobile nav
 * bar — with one hidden per breakpoint. Return the first VISIBLE match so the
 * spotlight lands on the copy the visitor can actually see.
 */
function findVisible(selector: string): Element | null {
    for (const el of Array.from(document.querySelectorAll(selector))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) return el;
    }
    return null;
}

/**
 * A lightweight, dependency-free product tour. Spotlights real on-page elements
 * by selector and explains them one step at a time, so a first-time visitor is
 * walked across the studio (size → artwork → materials → 3D → send) instead of
 * facing a wall of controls.
 *
 * Tracks the target every frame while open, so the highlight follows scrolling
 * and the unfold animation. Degrades gracefully: if a step's element isn't on
 * screen (collapsed mobile pane, not yet rendered) it centres the card and
 * still shows the copy.
 */
export function Tour({
    steps,
    open,
    onClose,
    onStepChange,
}: {
    steps: TourStep[];
    open: boolean;
    onClose: () => void;
    /** Fired when the active step changes (incl. on open). Lets the host react,
     *  e.g. switch a mobile pane so the target becomes visible. */
    onStepChange?: (index: number, step: TourStep) => void;
}) {
    const [index, setIndex] = useState(0);
    const [rect, setRect] = useState<Rect | null>(null);
    const rafRef = useRef<number>(0);

    const step = steps[index];

    // Reset to the first step each time the tour is (re)opened.
    useEffect(() => {
        if (open) setIndex(0);
    }, [open]);

    // Notify host + scroll the target into view on each step.
    useEffect(() => {
        if (!open || !step) return;
        onStepChange?.(index, step);
        const el = findVisible(step.selector);
        if (el) {
            el.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
                inline: 'center',
            });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, index]);

    // Track the target rect every frame while open (follows scroll/animation).
    useEffect(() => {
        if (!open || !step) return;
        const measure = () => {
            const el = findVisible(step.selector);
            if (el) {
                const r = el.getBoundingClientRect();
                // Treat a zero-size box (hidden pane) as "not found".
                setRect(
                    r.width > 0 && r.height > 0
                        ? {
                              top: r.top,
                              left: r.left,
                              width: r.width,
                              height: r.height,
                          }
                        : null,
                );
            } else {
                setRect(null);
            }
            rafRef.current = requestAnimationFrame(measure);
        };
        rafRef.current = requestAnimationFrame(measure);
        return () => cancelAnimationFrame(rafRef.current);
    }, [open, step]);

    const next = useCallback(() => {
        setIndex((i) => {
            if (i >= steps.length - 1) {
                onClose();
                return i;
            }
            return i + 1;
        });
    }, [steps.length, onClose]);

    const back = useCallback(() => setIndex((i) => Math.max(0, i - 1)), []);

    // Keyboard: → / Enter advance, ← back, Esc closes.
    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
            else if (e.key === 'ArrowRight' || e.key === 'Enter') next();
            else if (e.key === 'ArrowLeft') back();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, next, back, onClose]);

    if (!open || !step) return null;

    const vw = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const vh = typeof window !== 'undefined' ? window.innerHeight : 768;
    const cardW = Math.min(CARD_W, vw - 24);

    // Decide where the tooltip card sits.
    const placement = step.placement ?? 'auto';
    let cardTop: number;
    let cardLeft: number;
    let centred = false;

    if (!rect || placement === 'center') {
        centred = true;
        cardTop = vh / 2 - 90;
        cardLeft = vw / 2 - cardW / 2;
    } else {
        const spaceBelow = vh - (rect.top + rect.height);
        const below =
            placement === 'bottom'
                ? true
                : placement === 'top'
                  ? false
                  : spaceBelow > 200 || spaceBelow > rect.top;
        cardTop = below
            ? rect.top + rect.height + GAP
            : rect.top - GAP - 170;
        cardLeft = rect.left + rect.width / 2 - cardW / 2;
        // Clamp into the viewport with a small margin.
        cardLeft = Math.max(12, Math.min(cardLeft, vw - cardW - 12));
        cardTop = Math.max(12, Math.min(cardTop, vh - 200));
    }

    const isLast = index === steps.length - 1;

    return (
        <div className="fixed inset-0 z-[100]" aria-live="polite" role="dialog">
            {/* Dimmer + spotlight. When the target is found we use a single box
                with a huge box-shadow to darken everything except the cut-out;
                pointer-events stay off so the highlighted control is still
                usable. When not found we dim the whole screen. */}
            {rect && !centred ? (
                <div
                    aria-hidden
                    className="pointer-events-none absolute rounded-lg transition-all duration-200 ease-out"
                    style={{
                        top: rect.top - PAD,
                        left: rect.left - PAD,
                        width: rect.width + PAD * 2,
                        height: rect.height + PAD * 2,
                        boxShadow: `0 0 0 9999px rgba(15,23,28,0.55)`,
                        outline: `2px solid ${ACCENT}`,
                        outlineOffset: 2,
                    }}
                />
            ) : (
                <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{ background: 'rgba(15,23,28,0.55)' }}
                />
            )}

            {/* Tooltip card */}
            <div
                className="absolute rounded-xl border border-neutral-200 bg-white p-4 shadow-2xl transition-all duration-200 ease-out"
                style={{ top: cardTop, left: cardLeft, width: cardW }}
            >
                <div className="flex items-start justify-between gap-3">
                    <span
                        className="text-[10px] font-semibold uppercase tracking-widest"
                        style={{ color: ACCENT }}
                    >
                        Step {index + 1} of {steps.length}
                    </span>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close tour"
                        className="-mt-1 -mr-1 rounded p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    >
                        <X size={15} aria-hidden />
                    </button>
                </div>
                <h3 className="mt-1 text-sm font-bold text-neutral-900">
                    {step.title}
                </h3>
                <p className="mt-1 text-[13px] leading-relaxed text-neutral-600">
                    {step.body}
                </p>

                {/* Progress dots */}
                <div className="mt-3 flex items-center gap-1.5">
                    {steps.map((_, i) => (
                        <span
                            key={i}
                            className="h-1.5 rounded-full transition-all"
                            style={{
                                width: i === index ? 18 : 6,
                                background: i === index ? ACCENT : '#d4d4d4',
                            }}
                        />
                    ))}
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-[12px] font-medium text-neutral-400 hover:text-neutral-600"
                    >
                        Skip tour
                    </button>
                    <div className="flex items-center gap-2">
                        {index > 0 && (
                            <button
                                type="button"
                                onClick={back}
                                className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-[12px] font-medium text-neutral-700 hover:bg-neutral-100"
                            >
                                <ArrowLeft size={13} aria-hidden /> Back
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={next}
                            className="flex items-center gap-1 rounded-md px-3.5 py-1.5 text-[12px] font-semibold text-white shadow-sm"
                            style={{ background: ACCENT }}
                            onMouseEnter={(e) => {
                                e.currentTarget.style.background = ACCENT_DARK;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = ACCENT;
                            }}
                        >
                            {isLast ? 'Finish' : 'Next'}
                            {!isLast && <ArrowRight size={13} aria-hidden />}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
