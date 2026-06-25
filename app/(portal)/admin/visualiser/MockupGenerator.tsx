'use client';

/**
 * "Generate mockup" — turns the live visualiser sign into a photorealistic
 * in-situ render via Higgsfield. The captured 3D screenshot is sent as a
 * reference image (anchoring the real geometry/letterforms) alongside a
 * spec-derived prompt that drives the scene + lighting.
 *
 * Self-contained so the ExportBar only needs to mount it. The generation
 * itself lives behind the `generateInSituMockup` server action → the
 * Higgsfield seam (no-ops cleanly when the API key isn't configured).
 */

import { useState, useTransition } from 'react';
import { Download, ImageIcon, Loader2, RefreshCw, X } from 'lucide-react';
import type { PanelParams } from '@/lib/visualiser/types';
import { generateInSituMockup } from '@/lib/visuals/actions';
import { SCENES, TIMES_OF_DAY, type Scene, type TimeOfDay } from '@/lib/visuals';

const SCENE_LABELS: Record<Scene, string> = {
    modern_storefront: 'Modern storefront',
    traditional_highstreet: 'High-street shopfront',
    office_reception: 'Office reception',
    exterior_wall: 'Exterior wall',
    monument_forecourt: 'Forecourt / monument',
    industrial_unit: 'Industrial unit',
    plain_studio: 'Plain studio',
};

const TIME_LABELS: Record<TimeOfDay, string> = {
    day: 'Day',
    overcast: 'Overcast',
    dusk: 'Dusk',
    night: 'Night',
};

/** Strip the `data:image/png;base64,` prefix → bare base64. */
function stripDataUrl(dataUrl: string): string {
    const comma = dataUrl.indexOf(',');
    return comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
}

async function downloadImage(url: string, filename: string) {
    try {
        const res = await fetch(url);
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = objUrl;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(objUrl);
    } catch {
        window.open(url, '_blank', 'noopener');
    }
}

export function MockupGenerator({
    params,
    capture,
    disabled = false,
}: {
    params: PanelParams;
    /** Clean, annotation-free in-situ capture → trimmed PNG data URL (or null). */
    capture: () => Promise<string | null>;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [scene, setScene] = useState<Scene>('modern_storefront');
    const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [url, setUrl] = useState<string | null>(null);

    const run = () => {
        setError(null);
        startTransition(async () => {
            const shot = await capture();
            if (!shot) {
                setError('Could not capture the sign — make sure a design is loaded in the 3D view.');
                return;
            }
            const res = await generateInSituMockup({
                params,
                screenshotBase64: stripDataUrl(shot),
                scene,
                timeOfDay,
            });
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setUrl(res.data.url);
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                disabled={disabled}
                title="Generate a photorealistic in-situ mockup of this sign (AI), using the 3D render as a reference."
                className="flex min-h-[36px] items-center gap-1.5 rounded-md border border-[#4e7e8c]/40 bg-[#e8f0f3] px-3 py-2 text-xs font-medium text-[#3a5f6a] hover:bg-[#d8e6ec] disabled:cursor-not-allowed disabled:opacity-50"
            >
                <ImageIcon size={14} aria-hidden />
                Generate mockup
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
                    role="dialog"
                    aria-modal="true"
                    aria-label="Generate in-situ mockup"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !pending) setOpen(false);
                    }}
                >
                    <div className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
                        <div className="flex items-center justify-between border-b border-neutral-200 px-5 py-3">
                            <h2 className="text-sm font-semibold text-neutral-800">
                                In-situ mockup
                                <span className="ml-2 font-normal text-neutral-400">{params.name}</span>
                            </h2>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                disabled={pending}
                                className="rounded-md p-1 text-neutral-400 hover:bg-neutral-100 hover:text-neutral-700 disabled:opacity-50"
                                aria-label="Close"
                            >
                                <X size={18} aria-hidden />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto px-5 py-4">
                            {/* Scene picker */}
                            <fieldset className="mb-4">
                                <legend className="mb-1.5 text-xs font-medium text-neutral-600">Setting</legend>
                                <div className="flex flex-wrap gap-1.5">
                                    {SCENES.map((s) => (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() => setScene(s)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                                                scene === s
                                                    ? 'bg-[#4e7e8c] text-white ring-[#4e7e8c]'
                                                    : 'bg-white text-neutral-600 ring-neutral-300 hover:bg-neutral-50'
                                            }`}
                                        >
                                            {SCENE_LABELS[s]}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>

                            {/* Time-of-day picker */}
                            <fieldset className="mb-4">
                                <legend className="mb-1.5 text-xs font-medium text-neutral-600">Lighting</legend>
                                <div className="flex flex-wrap gap-1.5">
                                    {TIMES_OF_DAY.map((t) => (
                                        <button
                                            key={t}
                                            type="button"
                                            onClick={() => setTimeOfDay(t)}
                                            className={`rounded-full px-3 py-1 text-xs font-medium ring-1 transition ${
                                                timeOfDay === t
                                                    ? 'bg-[#4e7e8c] text-white ring-[#4e7e8c]'
                                                    : 'bg-white text-neutral-600 ring-neutral-300 hover:bg-neutral-50'
                                            }`}
                                        >
                                            {TIME_LABELS[t]}
                                        </button>
                                    ))}
                                </div>
                            </fieldset>

                            {/* Result / placeholder */}
                            <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg border border-neutral-200 bg-neutral-50">
                                {pending ? (
                                    <div className="flex flex-col items-center gap-2 text-neutral-500">
                                        <Loader2 size={24} className="animate-spin" aria-hidden />
                                        <span className="text-xs">Generating mockup…</span>
                                    </div>
                                ) : url ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={url} alt="Generated in-situ mockup" className="max-h-[50vh] w-full object-contain" />
                                ) : (
                                    <span className="px-6 text-center text-xs text-neutral-400">
                                        Pick a setting and lighting, then generate. The 3D render is used as a
                                        reference so the sign keeps its real shape.
                                    </span>
                                )}
                            </div>

                            {error && (
                                <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700 ring-1 ring-red-200">
                                    {error}
                                </p>
                            )}
                        </div>

                        <div className="flex items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
                            {url && !pending && (
                                <button
                                    type="button"
                                    onClick={() => downloadImage(url, `${params.name || 'mockup'}-insitu.png`)}
                                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                                >
                                    <Download size={14} aria-hidden /> Download
                                </button>
                            )}
                            <button
                                type="button"
                                onClick={run}
                                disabled={pending}
                                className="flex items-center gap-1.5 rounded-md bg-[#4e7e8c] px-4 py-2 text-xs font-semibold text-white hover:bg-[#3a5f6a] disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {pending ? (
                                    <Loader2 size={14} className="animate-spin" aria-hidden />
                                ) : url ? (
                                    <RefreshCw size={14} aria-hidden />
                                ) : (
                                    <ImageIcon size={14} aria-hidden />
                                )}
                                {pending ? 'Generating…' : url ? 'Regenerate' : 'Generate'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
