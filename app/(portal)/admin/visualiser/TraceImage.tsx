'use client';

import { useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, ImageUp, Loader2, X } from 'lucide-react';
import { useVisualiser } from './store';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    luminanceField,
    otsuThreshold,
    traceToSvg,
} from '@/lib/visualiser/trace';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

// Cap the traced raster so segment counts stay sane on big uploads —
// a ballpark silhouette doesn't need full resolution, and ~480px keeps
// live slider re-traces instant.
const MAX_TRACE_PX = 480;

type LoadedImage = { rgba: Uint8ClampedArray; w: number; h: number };

/**
 * Image → rough SVG tracer panel. A concept aid for the sign builder:
 * drop a high-contrast PNG/JPG, threshold it, and get silhouette
 * vectors that feed the normal artwork pipeline. NOT a production cut
 * path — surfaced as "concept" so a messy trace never reaches the
 * cutter unreviewed.
 */
export function TraceImage({ onClose }: { onClose: () => void }) {
    const { addArtworkLayer } = useVisualiser();
    const inputRef = useRef<HTMLInputElement>(null);
    const [img, setImg] = useState<LoadedImage | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [threshold, setThreshold] = useState(128);
    const [smoothing, setSmoothing] = useState(40);
    const [blurRadius, setBlurRadius] = useState(1);
    const [invert, setInvert] = useState(false);

    // Otsu auto-threshold for the current image + invert — the cut that
    // best separates the two brightness populations.
    const autoThreshold = (image: LoadedImage, inv: boolean) =>
        otsuThreshold(luminanceField(image.rgba, image.w, image.h, inv));

    const handleImageFile = (file: File) => {
        setError(null);
        setBusy(true);
        const url = URL.createObjectURL(file);
        const image = new window.Image();
        image.onload = () => {
            try {
                const scale = Math.min(
                    1,
                    MAX_TRACE_PX / Math.max(image.width, image.height),
                );
                const cw = Math.max(1, Math.round(image.width * scale));
                const ch = Math.max(1, Math.round(image.height * scale));
                const canvas = document.createElement('canvas');
                canvas.width = cw;
                canvas.height = ch;
                const ctx = canvas.getContext('2d');
                if (!ctx) throw new Error('no 2d context');
                ctx.drawImage(image, 0, 0, cw, ch);
                const data = ctx.getImageData(0, 0, cw, ch);
                const loaded = { rgba: data.data, w: cw, h: ch };
                setImg(loaded);
                // Pick a sensible threshold automatically on load.
                setThreshold(autoThreshold(loaded, invert));
            } catch {
                setError('Could not read that image.');
            } finally {
                setBusy(false);
                URL.revokeObjectURL(url);
            }
        };
        image.onerror = () => {
            setError('Could not read that image.');
            setBusy(false);
            URL.revokeObjectURL(url);
        };
        image.src = url;
    };

    // Re-trace whenever the image or any control changes. Cheap at the
    // capped resolution, so no debounce needed.
    const trace = useMemo(() => {
        if (!img) return null;
        return traceToSvg(img.rgba, img.w, img.h, {
            threshold,
            invert,
            smoothing,
            blurRadius,
            smoothPasses: 2,
        });
    }, [img, threshold, invert, smoothing, blurRadius]);

    const previewSrc = useMemo(
        () =>
            trace
                ? 'data:image/svg+xml;utf8,' + encodeURIComponent(trace.svg)
                : null,
        [trace],
    );

    const commit = () => {
        if (!trace) return;
        try {
            const result = importSvg(trace.svg);
            if (result.paths.length === 0) {
                setError(
                    'Trace produced no usable shapes — try the threshold or invert.',
                );
                return;
            }
            // Add as an artwork layer so traced art composes alongside
            // any uploaded SVGs and can be moved independently.
            addArtworkLayer(trace.svg, 'Traced image');
            onClose();
        } catch {
            setError('Could not import the trace.');
        }
    };

    return (
        <div className="space-y-3 rounded-lg border border-neutral-200 bg-white p-3">
            <div className="flex items-center justify-between">
                <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-neutral-600">
                    <ImageUp size={13} aria-hidden style={{ color: ACCENT }} />
                    Trace an image
                </h3>
                <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close tracer"
                    className="flex min-h-[24px] min-w-[24px] items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                >
                    <X size={14} aria-hidden />
                </button>
            </div>

            <p className="text-[10px] text-neutral-500">
                Concept only — best with high-contrast logos / black-on-white.
                The result is a rough silhouette to ballpark ideas, not a
                production cut file.
            </p>
            <p className="text-[10px] text-neutral-500">
                Need colour or more control?{' '}
                <Link
                    href="/admin/visualiser/vectorise"
                    className="font-medium text-[#4e7e8c] hover:underline"
                >
                    Open the full Image&nbsp;→&nbsp;SVG converter
                </Link>
                .
            </p>

            {!img ? (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 px-4 py-6 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
                >
                    {busy ? (
                        <Loader2 size={20} className="animate-spin" />
                    ) : (
                        <ImageUp size={20} />
                    )}
                    <span className="text-xs">Upload a PNG or JPG</span>
                </button>
            ) : (
                <>
                    {/* Live trace preview on a light tile. */}
                    <div className="flex items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 p-2">
                        {previewSrc ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                                src={previewSrc}
                                alt="Traced preview"
                                className="max-h-40 w-full object-contain"
                            />
                        ) : (
                            <span className="py-8 text-[11px] text-neutral-400">
                                Nothing traced at this threshold — adjust
                                below.
                            </span>
                        )}
                    </div>

                    {trace && (
                        <p className="text-[10px] text-neutral-400">
                            {trace.loopCount} shape
                            {trace.loopCount === 1 ? '' : 's'} ·{' '}
                            {trace.pointCount} points · traced at {img.w}×
                            {img.h} (rescale on the panel)
                        </p>
                    )}

                    {/* Controls */}
                    <div className="space-y-2.5">
                        <label className="block">
                            <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-neutral-500">
                                    Threshold
                                </span>
                                <span className="flex items-center gap-1.5">
                                    {img && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setThreshold(
                                                    autoThreshold(img, invert),
                                                )
                                            }
                                            className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide text-[#4e7e8c] hover:underline"
                                        >
                                            Auto
                                        </button>
                                    )}
                                    <span className="text-[10px] tabular-nums text-neutral-400">
                                        {threshold}
                                    </span>
                                </span>
                            </div>
                            <input
                                type="range"
                                min={1}
                                max={254}
                                value={threshold}
                                onChange={(e) =>
                                    setThreshold(Number(e.target.value))
                                }
                                className="mt-1 h-1 w-full accent-black"
                                aria-label="Trace threshold"
                            />
                        </label>
                        <label className="block">
                            <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-neutral-500">
                                    Smoothing
                                </span>
                                <span className="text-[10px] tabular-nums text-neutral-400">
                                    {smoothing}%
                                </span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                value={smoothing}
                                onChange={(e) =>
                                    setSmoothing(Number(e.target.value))
                                }
                                className="mt-1 h-1 w-full accent-black"
                                aria-label="Trace smoothing"
                            />
                        </label>
                        <label className="block">
                            <div className="flex items-baseline justify-between">
                                <span className="text-[10px] text-neutral-500">
                                    Smooth edges
                                </span>
                                <span className="text-[10px] tabular-nums text-neutral-400">
                                    {blurRadius} px
                                </span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={3}
                                value={blurRadius}
                                onChange={(e) =>
                                    setBlurRadius(Number(e.target.value))
                                }
                                className="mt-1 h-1 w-full accent-black"
                                aria-label="Edge smoothing (blur)"
                            />
                        </label>
                        <div className="flex items-center justify-between">
                            <span className="text-[10px] text-neutral-500">
                                Trace light areas (invert)
                            </span>
                            <button
                                type="button"
                                onClick={() => setInvert((v) => !v)}
                                aria-pressed={invert}
                                className={`min-h-[24px] rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                                    invert
                                        ? 'text-white'
                                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                }`}
                                style={
                                    invert ? { background: ACCENT } : undefined
                                }
                            >
                                {invert ? 'On' : 'Off'}
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                        <button
                            type="button"
                            onClick={commit}
                            disabled={!trace}
                            className="flex min-h-[36px] flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-xs font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                            style={{ background: ACCENT }}
                            onMouseEnter={(e) => {
                                if (!e.currentTarget.disabled)
                                    e.currentTarget.style.background =
                                        ACCENT_DARK;
                            }}
                            onMouseLeave={(e) => {
                                e.currentTarget.style.background = ACCENT;
                            }}
                        >
                            <Check size={14} aria-hidden /> Use this trace
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setImg(null);
                                setError(null);
                            }}
                            className="min-h-[36px] rounded-md border border-neutral-300 px-3 py-2 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                            New image
                        </button>
                    </div>
                </>
            )}

            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageFile(f);
                    e.target.value = '';
                }}
            />

            {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
    );
}
