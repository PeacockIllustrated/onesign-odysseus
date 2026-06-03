'use client';

import { useState } from 'react';
import { HelpCircle, Loader2, Send } from 'lucide-react';
import { useVisualiser, splitPanels } from '../(portal)/admin/visualiser/store';
import { sceneCapture } from '../(portal)/admin/visualiser/Scene3D';
import { trimImageDataUrl } from '@/lib/visualiser/image';
import { composeLayersSvg } from '@/lib/visualiser/compose';
import { PanelParamsSchema, type PanelParams } from '@/lib/visualiser/types';
import { SubmitModal, type DesignPayload } from './SubmitModal';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

/** Flatten a panel's artwork layers into one SVG (or its raw uploaded SVG). */
function flattenSvg(
    p: {
        artworkLayers?: PanelParams['artworkLayers'];
        panelWidthMm: number;
        panelHeightMm: number;
    },
    raw: string | null,
): string | null {
    const layers = p.artworkLayers ?? [];
    return layers.length
        ? composeLayersSvg(layers, p.panelWidthMm, p.panelHeightMm)
        : raw;
}

/** A plain-English summary of what the customer built, for the lead + inbox. */
function describeSign(params: PanelParams, projectingEnabled: boolean): string {
    const groups = params.materialGroups ?? [];
    const has = (m: string) => groups.some((g) => g.material === m);
    let base: string;
    if (has('standoff') || params.apertureMode === 'standoff') {
        base = 'Stand-off lettering';
    } else if (has('pushthrough')) {
        base = 'Push-through sign';
    } else if (params.apertureMode === 'aperture' && (params.artworkLayers?.length || params.aperturePlacement)) {
        base = 'Aperture (cut-out) sign';
    } else {
        base = 'Folded aluminium panel';
    }
    const extras: string[] = [];
    if (params.illumination?.keyline?.enabled) extras.push('illuminated');
    if (has('vinyl')) extras.push('vinyl');
    let label = extras.length ? `${base} · ${extras.join(', ')}` : base;
    if (projectingEnabled) label += ' + projecting sign';
    return label;
}

/**
 * The public studio's footer: a single clear "Send my design to Onesign" call
 * to action (plus a "Show me how" re-trigger for the tour). On click it
 * assembles the full design exactly as the staff tool would save it — main
 * params with any projecting blade nested inside, each panel's artwork
 * flattened to an SVG — captures a face-on preview, and opens the contact form.
 */
export function PublicActionBar({ onStartTour }: { onStartTour: () => void }) {
    const {
        params,
        svgSource,
        imported,
        projectingEnabled,
        activeTab,
        inactive,
        mount,
    } = useVisualiser();

    const [preparing, setPreparing] = useState(false);
    const [modalOpen, setModalOpen] = useState(false);
    const [payload, setPayload] = useState<DesignPayload | null>(null);

    const valid = PanelParamsSchema.safeParse(params);

    const assemble = (): DesignPayload => {
        const { main, projecting } = splitPanels({
            activeTab,
            projectingEnabled,
            params,
            svgSource,
            imported,
            inactive,
        });
        const mainSvg = flattenSvg(main.params, main.svgSource);
        let projectingSign: PanelParams['projectingSign'];
        if (projecting) {
            const bladeCore = { ...projecting.params };
            delete (bladeCore as { projectingSign?: unknown }).projectingSign;
            projectingSign = {
                panel: bladeCore,
                mount,
                svgSource: flattenSvg(projecting.params, projecting.svgSource),
            };
        }
        return {
            params: { ...main.params, projectingSign },
            svgSource: mainSvg,
            signType: describeSign(main.params, projectingEnabled),
            thumbnail: null,
        };
    };

    const openSubmit = async () => {
        if (!valid.success || preparing) return;
        setPreparing(true);
        try {
            const base = assemble();
            // Face-on shot trimmed to the sign (falls back to the orbit shot).
            const faceThumb =
                sceneCapture.faceOn?.() ?? sceneCapture.fn?.() ?? null;
            const thumbnail = faceThumb
                ? await trimImageDataUrl(faceThumb).catch(() => faceThumb)
                : null;
            setPayload({ ...base, thumbnail });
            setModalOpen(true);
        } finally {
            setPreparing(false);
        }
    };

    return (
        <div className="flex flex-wrap items-center gap-3">
            <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-800">
                    Happy with your design?
                </p>
                <p className="text-xs text-neutral-500">
                    Send it to our team and we&apos;ll come back with a quote —
                    no obligation.
                </p>
            </div>

            <button
                type="button"
                onClick={onStartTour}
                className="flex min-h-[44px] items-center gap-1.5 rounded-lg border border-neutral-300 px-3.5 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
                <HelpCircle size={16} aria-hidden />
                Show me how
            </button>

            <button
                type="button"
                onClick={openSubmit}
                disabled={!valid.success || preparing}
                aria-busy={preparing}
                title={
                    valid.success
                        ? 'Send your design to Onesign for a quote'
                        : valid.error.issues[0]?.message
                }
                className="flex min-h-[44px] items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: ACCENT }}
                onMouseEnter={(e) => {
                    if (!e.currentTarget.disabled)
                        e.currentTarget.style.background = ACCENT_DARK;
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.background = ACCENT;
                }}
            >
                {preparing ? (
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                ) : (
                    <Send size={16} aria-hidden />
                )}
                {preparing ? 'Preparing…' : 'Send my design to Onesign'}
            </button>

            {/* Mounted fresh each open so its form/success state resets cleanly. */}
            {modalOpen && (
                <SubmitModal
                    open
                    onClose={() => setModalOpen(false)}
                    design={payload}
                />
            )}
        </div>
    );
}
