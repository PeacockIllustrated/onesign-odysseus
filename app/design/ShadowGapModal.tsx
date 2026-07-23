'use client';

// app/design/ShadowGapModal.tsx
//
// Customer-facing explainer for the shadow gap — opened from the canvas
// "+ Shadow gap" dimension chip on the PUBLIC studio (staff keep the instant
// inline add). A shadow gap is fabrication vocabulary a layman won't know, so
// before anything changes on their sign we show what it is, a diagram of when
// you'd want one above and/or below, and only then let them add it. The same
// modal edits or removes an existing gap.

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const ACCENT = '#4e7e8c';

const GAP_PRESETS_MM = [10, 15, 20];

/**
 * Side-on diagram: wall, a soffit above / sill below, and the sign tray
 * floating between them — the highlighted reveals above/below the tray are
 * the shadow gaps. Redraws live as the customer toggles the edges so the
 * picture always shows exactly what they're about to add.
 */
function GapDiagram({ top, bottom }: { top: boolean; bottom: boolean }) {
    const gap = 10; // drawing px per gap
    const signTop = 52 + (top ? gap : 0);
    const signBottom = 148 - (bottom ? gap : 0);
    return (
        <svg
            viewBox="0 0 260 200"
            className="h-auto w-full rounded-lg border border-neutral-200 bg-neutral-50"
            role="img"
            aria-label={`Diagram of a sign tray with ${
                top && bottom
                    ? 'shadow gaps above and below'
                    : top
                      ? 'a shadow gap above'
                      : bottom
                        ? 'a shadow gap below'
                        : 'no shadow gaps'
            }`}
        >
            {/* Wall behind */}
            <rect x="0" y="0" width="260" height="200" fill="#eceff1" />
            {/* Soffit / fascia band above and sill below */}
            <rect x="0" y="20" width="260" height="32" fill="#cfd8dc" />
            <rect x="0" y="148" width="260" height="32" fill="#cfd8dc" />
            <text x="10" y="40" fontSize="10" fill="#607d8b">
                soffit / canopy
            </text>
            <text x="10" y="168" fontSize="10" fill="#607d8b">
                ledge / fascia below
            </text>
            {/* Shadow gap reveals (dark slots that read as shadow lines) */}
            {top && (
                <rect x="30" y="52" width="200" height={gap} fill="#263238" />
            )}
            {bottom && (
                <rect
                    x="30"
                    y={148 - gap}
                    width="200"
                    height={gap}
                    fill="#263238"
                />
            )}
            {/* The sign tray */}
            <rect
                x="30"
                y={signTop}
                width="200"
                height={signBottom - signTop}
                rx="3"
                fill={ACCENT}
            />
            <text
                x="130"
                y={(signTop + signBottom) / 2 + 4}
                fontSize="12"
                fontWeight="600"
                fill="#ffffff"
                textAnchor="middle"
            >
                YOUR SIGN
            </text>
            {/* Gap labels in the wall margin so the dark slots are unmissable */}
            {top && (
                <text
                    x="234"
                    y={52 + gap / 2 + 3}
                    fontSize="9"
                    fontWeight="700"
                    fill="#e53935"
                >
                    ←gap
                </text>
            )}
            {bottom && (
                <text
                    x="234"
                    y={148 - gap / 2 + 3}
                    fontSize="9"
                    fontWeight="700"
                    fill="#e53935"
                >
                    ←gap
                </text>
            )}
        </svg>
    );
}

export function ShadowGapModal({
    open,
    onClose,
    currentGapMm,
    currentEdges,
    onApply,
    onRemove,
}: {
    open: boolean;
    onClose: () => void;
    /** Existing gap (0 = adding fresh). */
    currentGapMm: number;
    currentEdges: { top: boolean; bottom: boolean };
    onApply: (gapMm: number, edges: { top: boolean; bottom: boolean }) => void;
    onRemove: () => void;
}) {
    const editing = currentGapMm > 0;
    const [gapMm, setGapMm] = useState(editing ? currentGapMm : 15);
    const [top, setTop] = useState(currentEdges.top);
    const [bottom, setBottom] = useState(currentEdges.bottom);

    // Re-seed from the live params each time the modal opens.
    useEffect(() => {
        if (!open) return;
        setGapMm(currentGapMm > 0 ? currentGapMm : 15);
        setTop(currentEdges.top);
        setBottom(currentEdges.bottom);
    }, [open, currentGapMm, currentEdges.top, currentEdges.bottom]);

    useEffect(() => {
        if (!open) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);

    if (!open) return null;

    const nothingSelected = !top && !bottom;

    return (
        <div
            className="fixed inset-0 z-[90] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-6"
            role="dialog"
            aria-modal="true"
            aria-label="About shadow gaps"
            onClick={onClose}
        >
            <div
                className="max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 shadow-2xl sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <h2 className="text-base font-bold text-neutral-900">
                        What&apos;s a shadow gap?
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="-mr-1 -mt-1 rounded-lg p-1.5 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    >
                        <X size={17} aria-hidden />
                    </button>
                </div>

                <p className="mt-2 text-[13px] leading-relaxed text-neutral-600">
                    A shadow gap is a small folded-back lip at the top or
                    bottom of the sign tray. It sets a crisp dark line between
                    your sign and whatever it sits against, so the sign looks
                    like it&apos;s floating instead of butting up hard — and it
                    hides the fixings behind it.
                </p>

                <div className="mt-3">
                    <GapDiagram top={top} bottom={bottom} />
                </div>

                <p className="mt-2 text-[12px] leading-relaxed text-neutral-500">
                    Add one <strong>above</strong> when your sign sits under a
                    soffit, canopy or beam; add one <strong>below</strong> when
                    it sits on a ledge or another fascia panel. Freestanding on
                    an open wall? You probably don&apos;t need one.
                </p>

                {/* Edge choice */}
                <div className="mt-4">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        Where do you need it?
                    </span>
                    <div className="mt-1.5 grid grid-cols-2 gap-2">
                        {(
                            [
                                ['Above the sign', top, setTop],
                                ['Below the sign', bottom, setBottom],
                            ] as const
                        ).map(([label, on, set]) => (
                            <button
                                key={label}
                                type="button"
                                role="checkbox"
                                aria-checked={on}
                                onClick={() => set(!on)}
                                className={`min-h-[44px] rounded-lg border px-3 text-[13px] font-medium transition-colors ${
                                    on
                                        ? 'border-transparent text-white'
                                        : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
                                }`}
                                style={on ? { background: ACCENT } : undefined}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Gap size */}
                <div className="mt-3">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">
                        Gap size
                    </span>
                    <div className="mt-1.5 flex gap-2">
                        {GAP_PRESETS_MM.map((mm) => (
                            <button
                                key={mm}
                                type="button"
                                aria-pressed={gapMm === mm}
                                onClick={() => setGapMm(mm)}
                                className={`min-h-[44px] flex-1 rounded-lg border text-[13px] font-semibold tabular-nums transition-colors ${
                                    gapMm === mm
                                        ? 'border-transparent text-white'
                                        : 'border-neutral-300 text-neutral-600 hover:border-neutral-400'
                                }`}
                                style={
                                    gapMm === mm
                                        ? { background: ACCENT }
                                        : undefined
                                }
                            >
                                {mm} mm
                            </button>
                        ))}
                    </div>
                    <p className="mt-1 text-[11px] text-neutral-400">
                        15 mm is the usual choice — not sure? Leave it as is.
                    </p>
                </div>

                {/* Actions */}
                <div className="mt-5 flex items-center gap-2">
                    {editing && (
                        <button
                            type="button"
                            onClick={() => {
                                onRemove();
                                onClose();
                            }}
                            className="min-h-[44px] rounded-lg border border-neutral-300 px-3.5 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                            Remove gap
                        </button>
                    )}
                    <div className="flex-1" />
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[44px] rounded-lg px-3.5 text-sm font-medium text-neutral-500 hover:bg-neutral-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        disabled={nothingSelected}
                        onClick={() => {
                            onApply(gapMm, { top, bottom });
                            onClose();
                        }}
                        className="min-h-[44px] rounded-lg px-5 text-sm font-semibold text-white shadow-sm disabled:opacity-40"
                        style={{ background: ACCENT }}
                    >
                        {editing ? 'Update gap' : 'Add shadow gap'}
                    </button>
                </div>
                {nothingSelected && (
                    <p className="mt-1.5 text-right text-[11px] text-neutral-400">
                        Pick above and/or below to add the gap.
                    </p>
                )}
            </div>
        </div>
    );
}
