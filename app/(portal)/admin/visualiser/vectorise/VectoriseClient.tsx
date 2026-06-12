'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
    ArrowLeft,
    Check,
    Copy,
    Download,
    Eraser,
    ImageUp,
    Layers,
    Loader2,
    Palette,
    Pipette,
    X,
} from 'lucide-react';
import { luminanceField, otsuThreshold } from '@/lib/visualiser/trace';
import {
    computeVectorise,
    type VectoriseMode,
    type VectoriseOutput,
    type VectoriseParams,
} from '@/lib/visualiser/vectorise-run';
import {
    removeBackground,
    sampleColor,
    type RGB,
} from '@/lib/visualiser/bg-remove';

const ACCENT = '#4e7e8c';

// Cap the traced raster so live re-traces stay responsive on the main thread
// while keeping enough detail for fine artwork (thin script strokes need the
// resolution). The output SVG is resolution-independent; this only bounds the
// trace grid. Debounced + corner-preserving smoothing keep 1000px snappy.
const MAX_TRACE_PX = 1000;

type LoadedImage = {
    rgba: Uint8ClampedArray;
    w: number;
    h: number;
    /** Down-scaled raster as a data URL — the "original" compare view. */
    src: string;
};

const DEFAULT_PARAMS: VectoriseParams = {
    mode: 'color',
    smoothing: 40,
    minAreaPx: 24,
    smoothPasses: 2,
    threshold: 128,
    invert: false,
    blurRadius: 1,
    maxColors: 6,
};

type BgState = {
    enabled: boolean;
    color: RGB | null;
    tolerance: number;
    contiguous: boolean;
    seed: [number, number] | null;
};
const DEFAULT_BG: BgState = {
    enabled: false,
    color: null,
    tolerance: 30,
    contiguous: true,
    seed: null,
};
const rgbCss = ([r, g, b]: RGB) => `rgb(${r}, ${g}, ${b})`;

function download(text: string, filename: string, type: string) {
    const blob = new Blob([text], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function VectoriseClient() {
    const inputRef = useRef<HTMLInputElement>(null);
    const [img, setImg] = useState<LoadedImage | null>(null);
    const [name, setName] = useState('image');
    const [params, setParams] = useState<VectoriseParams>(DEFAULT_PARAMS);
    const [output, setOutput] = useState<VectoriseOutput | null>(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [showOriginal, setShowOriginal] = useState(false);
    const [copied, setCopied] = useState(false);
    const [bg, setBg] = useState<BgState>(DEFAULT_BG);

    const set = <K extends keyof VectoriseParams>(k: K, v: VectoriseParams[K]) =>
        setParams((p) => ({ ...p, [k]: v }));

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
                const loaded: LoadedImage = {
                    rgba: data.data,
                    w: cw,
                    h: ch,
                    src: canvas.toDataURL('image/png'),
                };
                setImg(loaded);
                setName(file.name.replace(/\.[^.]+$/, '') || 'image');
                setShowOriginal(false);
                setBg(DEFAULT_BG);
                // Seed a sensible silhouette threshold from the image.
                setParams((p) => ({
                    ...p,
                    threshold: autoThreshold(loaded, p.invert),
                }));
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

    // Debounced re-trace. computeVectorise is synchronous; the timeout both
    // coalesces rapid slider moves and lets the "Tracing…" state paint first.
    useEffect(() => {
        if (!img) {
            setOutput(null);
            return;
        }
        setBusy(true);
        const t = setTimeout(() => {
            try {
                // Knock the background out (to transparent) before tracing, so a
                // logo lands on a clean ground.
                const src =
                    bg.enabled && bg.color
                        ? removeBackground(img.rgba, img.w, img.h, {
                              color: bg.color,
                              tolerance: bg.tolerance,
                              contiguous: bg.contiguous,
                              seed: bg.seed,
                          })
                        : img.rgba;
                const out = computeVectorise(src, img.w, img.h, params);
                setOutput(out);
                setError(
                    out ? null : 'Nothing traced at these settings — adjust below.',
                );
            } catch {
                setOutput(null);
                setError('Trace failed on that image.');
            } finally {
                setBusy(false);
            }
        }, 140);
        return () => clearTimeout(t);
    }, [img, params, bg]);

    const resultSrc = useMemo(
        () =>
            output
                ? 'data:image/svg+xml;utf8,' + encodeURIComponent(output.svg)
                : null,
        [output],
    );

    const clear = () => {
        setImg(null);
        setOutput(null);
        setError(null);
        setParams(DEFAULT_PARAMS);
        setBg(DEFAULT_BG);
        if (inputRef.current) inputRef.current.value = '';
    };

    // Sample the pixel under the click (object-contain → trace-grid coords) as
    // the background colour to clear. Only active while picking on the original.
    const pickBackground = (e: React.MouseEvent<HTMLImageElement>) => {
        if (!img || !bg.enabled || !showOriginal) return;
        const rect = e.currentTarget.getBoundingClientRect();
        const scale = Math.min(rect.width / img.w, rect.height / img.h);
        if (scale <= 0) return;
        const px = (e.clientX - rect.left - (rect.width - img.w * scale) / 2) / scale;
        const py = (e.clientY - rect.top - (rect.height - img.h * scale) / 2) / scale;
        if (px < 0 || py < 0 || px >= img.w || py >= img.h) return;
        setBg((b) => ({
            ...b,
            color: sampleColor(img.rgba, img.w, img.h, px, py),
            seed: [px, py],
        }));
        setShowOriginal(false);
    };

    const onCopy = async () => {
        if (!output) return;
        try {
            await navigator.clipboard.writeText(output.svg);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
        } catch {
            setError('Clipboard blocked — use Download instead.');
        }
    };

    return (
        <div className="flex flex-col gap-3 md:h-[calc(100dvh-7rem)] md:min-h-[560px] md:overflow-hidden">
            <header className="shrink-0 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/visualiser"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <ArrowLeft size={14} /> Visualiser
                    </Link>
                    <div>
                        <h1 className="flex items-center gap-2 text-base md:text-lg font-bold tracking-tight text-neutral-900">
                            <ImageUp size={18} style={{ color: ACCENT }} /> Image →
                            SVG converter
                        </h1>
                        <p className="hidden sm:block text-xs text-neutral-500">
                            Vectorise a PNG / JPG — clean cut silhouette or a
                            full-colour layered trace
                        </p>
                    </div>
                </div>
                {img && (
                    <div className="flex flex-wrap items-center gap-2">
                        <button
                            type="button"
                            onClick={clear}
                            className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                            <X size={14} /> Clear
                        </button>
                        <button
                            type="button"
                            onClick={onCopy}
                            disabled={!output}
                            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                        >
                            {copied ? <Check size={14} /> : <Copy size={14} />}
                            {copied ? 'Copied' : 'Copy SVG'}
                        </button>
                        <button
                            type="button"
                            onClick={() =>
                                output &&
                                download(
                                    output.svg,
                                    `${name}.svg`,
                                    'image/svg+xml',
                                )
                            }
                            disabled={!output}
                            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            style={{ background: ACCENT }}
                        >
                            <Download size={14} /> Download SVG
                        </button>
                    </div>
                )}
            </header>

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

            <div className="flex flex-1 min-h-0 flex-col md:flex-row gap-3">
                {!img ? (
                    <button
                        type="button"
                        onClick={() => inputRef.current?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const f = e.dataTransfer.files?.[0];
                            if (f) handleImageFile(f);
                        }}
                        className={`flex flex-1 min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
                            dragOver
                                ? 'border-[#4e7e8c] bg-[#e8f0f3]'
                                : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
                        }`}
                    >
                        {busy ? (
                            <Loader2 size={32} className="animate-spin text-neutral-400" />
                        ) : (
                            <ImageUp size={32} className="text-neutral-400" />
                        )}
                        <div className="text-center">
                            <p className="text-sm font-medium text-neutral-700">
                                Drop a PNG / JPG here, or click to choose
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                                High-contrast logos vectorise cleanest. Colour mode
                                traces a layer per colour.
                            </p>
                        </div>
                        {error && (
                            <p className="mt-2 max-w-md text-center text-xs text-red-600">
                                {error}
                            </p>
                        )}
                    </button>
                ) : (
                    <>
                        {/* Preview */}
                        <div className="relative flex flex-1 min-w-0 min-h-[320px] md:min-h-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                            <div className="absolute left-3 top-3 z-10 flex rounded-md border border-neutral-200 bg-white/90 p-0.5 shadow-sm backdrop-blur">
                                {(
                                    [
                                        ['result', 'Result'],
                                        ['original', 'Original'],
                                    ] as const
                                ).map(([v, label]) => {
                                    const active =
                                        (v === 'original') === showOriginal;
                                    return (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() =>
                                                setShowOriginal(v === 'original')
                                            }
                                            className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                                                active
                                                    ? 'text-white'
                                                    : 'text-neutral-600 hover:bg-neutral-100'
                                            }`}
                                            style={
                                                active
                                                    ? { background: ACCENT }
                                                    : undefined
                                            }
                                        >
                                            {label}
                                        </button>
                                    );
                                })}
                            </div>
                            {busy && (
                                <div className="absolute right-3 top-3 z-10 flex items-center gap-1.5 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
                                    <Loader2 size={11} className="animate-spin" />
                                    Tracing…
                                </div>
                            )}
                            {showOriginal && bg.enabled && (
                                <div className="pointer-events-none absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1.5 rounded-md bg-black/60 px-2.5 py-1 text-[10px] font-medium text-white">
                                    <Pipette size={11} /> Click the background to
                                    pick its colour
                                </div>
                            )}
                            {/* Checkerboard so transparency + light colours read */}
                            <div
                                className="flex flex-1 items-center justify-center p-4"
                                style={{
                                    backgroundColor: '#fff',
                                    backgroundImage:
                                        'linear-gradient(45deg,#f1f1f1 25%,transparent 25%),linear-gradient(-45deg,#f1f1f1 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#f1f1f1 75%),linear-gradient(-45deg,transparent 75%,#f1f1f1 75%)',
                                    backgroundSize: '18px 18px',
                                    backgroundPosition:
                                        '0 0,0 9px,9px -9px,-9px 0',
                                }}
                            >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={
                                        (showOriginal
                                            ? img.src
                                            : resultSrc) ?? img.src
                                    }
                                    alt={showOriginal ? 'Original' : 'Vectorised'}
                                    onClick={pickBackground}
                                    className={`max-h-full max-w-full object-contain ${
                                        showOriginal && bg.enabled
                                            ? 'cursor-crosshair'
                                            : ''
                                    }`}
                                />
                            </div>
                        </div>

                        {/* Controls + stats */}
                        <div className="flex w-full md:w-80 shrink-0 flex-col gap-3 md:overflow-y-auto">
                            {/* Background removal (pre-trace) */}
                            <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-3">
                                <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                    <Eraser size={12} /> Background
                                </h3>
                                <Toggle
                                    label="Remove background"
                                    on={bg.enabled}
                                    onChange={(on) => {
                                        setBg((b) => ({ ...b, enabled: on }));
                                        if (on && !bg.color) setShowOriginal(true);
                                    }}
                                />
                                {bg.enabled && (
                                    <div className="mt-3 space-y-3">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-neutral-500">
                                                Colour
                                            </span>
                                            <span
                                                className="h-5 w-5 rounded border border-neutral-300"
                                                style={{
                                                    background: bg.color
                                                        ? rgbCss(bg.color)
                                                        : '#fff',
                                                }}
                                            />
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setShowOriginal(true)
                                                }
                                                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#4e7e8c] hover:bg-[#e8f0f3]"
                                            >
                                                <Pipette size={12} /> Pick
                                            </button>
                                            {!bg.color && (
                                                <span className="text-[10px] text-neutral-400">
                                                    click the original
                                                </span>
                                            )}
                                        </div>
                                        <Slider
                                            label="Tolerance"
                                            value={bg.tolerance}
                                            min={0}
                                            max={100}
                                            step={1}
                                            suffix="%"
                                            onChange={(v) =>
                                                setBg((b) => ({
                                                    ...b,
                                                    tolerance: v,
                                                }))
                                            }
                                        />
                                        <Toggle
                                            label="Contiguous (flood from click)"
                                            on={bg.contiguous}
                                            onChange={(on) =>
                                                setBg((b) => ({
                                                    ...b,
                                                    contiguous: on,
                                                }))
                                            }
                                        />
                                    </div>
                                )}
                            </div>

                            {/* Mode */}
                            <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-3">
                                <div className="flex rounded-md border border-neutral-300 p-0.5">
                                    {(
                                        [
                                            ['color', 'Colour', Palette],
                                            ['silhouette', 'Silhouette', Layers],
                                        ] as const
                                    ).map(([v, label, Icon]) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() =>
                                                set('mode', v as VectoriseMode)
                                            }
                                            className={`flex flex-1 items-center justify-center gap-1.5 rounded px-2 py-1.5 text-xs font-medium ${
                                                params.mode === v
                                                    ? 'text-white'
                                                    : 'text-neutral-600 hover:bg-neutral-100'
                                            }`}
                                            style={
                                                params.mode === v
                                                    ? { background: ACCENT }
                                                    : undefined
                                            }
                                        >
                                            <Icon size={13} />
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                <div className="mt-3 space-y-3">
                                    {params.mode === 'color' ? (
                                        <Slider
                                            label="Colours"
                                            value={params.maxColors}
                                            min={2}
                                            max={16}
                                            step={1}
                                            suffix=""
                                            onChange={(v) => set('maxColors', v)}
                                        />
                                    ) : (
                                        <>
                                            <Slider
                                                label="Threshold"
                                                value={params.threshold}
                                                min={1}
                                                max={254}
                                                step={1}
                                                suffix=""
                                                onChange={(v) =>
                                                    set('threshold', v)
                                                }
                                                action={
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            img &&
                                                            set(
                                                                'threshold',
                                                                autoThreshold(
                                                                    img,
                                                                    params.invert,
                                                                ),
                                                            )
                                                        }
                                                        className="rounded px-1 text-[9px] font-semibold uppercase tracking-wide text-[#4e7e8c] hover:underline"
                                                    >
                                                        Auto
                                                    </button>
                                                }
                                            />
                                            <Slider
                                                label="Smooth edges"
                                                value={params.blurRadius}
                                                min={0}
                                                max={3}
                                                step={1}
                                                suffix=" px"
                                                onChange={(v) =>
                                                    set('blurRadius', v)
                                                }
                                            />
                                            <Toggle
                                                label="Trace light areas (invert)"
                                                on={params.invert}
                                                onChange={(on) =>
                                                    set('invert', on)
                                                }
                                            />
                                        </>
                                    )}
                                    <Slider
                                        label="Curve smoothing"
                                        value={params.smoothPasses}
                                        min={0}
                                        max={4}
                                        step={1}
                                        suffix=""
                                        onChange={(v) => set('smoothPasses', v)}
                                    />
                                    <Slider
                                        label="Simplify"
                                        value={params.smoothing}
                                        min={0}
                                        max={100}
                                        step={1}
                                        suffix="%"
                                        onChange={(v) => set('smoothing', v)}
                                    />
                                    <Slider
                                        label="Despeckle"
                                        value={params.minAreaPx}
                                        min={0}
                                        max={200}
                                        step={2}
                                        suffix=" px²"
                                        onChange={(v) => set('minAreaPx', v)}
                                    />
                                </div>
                            </div>

                            {/* Stats + palette */}
                            <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-3">
                                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                    Output
                                </h3>
                                {output ? (
                                    <>
                                        <div className="grid grid-cols-3 gap-2 text-center">
                                            <Stat
                                                label="Colours"
                                                value={output.colorCount}
                                            />
                                            <Stat
                                                label="Shapes"
                                                value={output.shapeCount}
                                            />
                                            <Stat
                                                label="Points"
                                                value={output.pointCount}
                                            />
                                        </div>
                                        {params.mode === 'color' && (
                                            <div className="mt-3 flex flex-wrap gap-1">
                                                {output.palette.map((c, i) => (
                                                    <span
                                                        key={`${c}-${i}`}
                                                        title={c}
                                                        className="h-5 w-5 rounded border border-neutral-200"
                                                        style={{
                                                            background: c,
                                                        }}
                                                    />
                                                ))}
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <p className="text-xs text-neutral-400">
                                        {busy
                                            ? 'Tracing…'
                                            : 'Nothing traced — adjust the controls.'}
                                    </p>
                                )}
                            </div>

                            <p className="px-1 text-[10px] leading-relaxed text-neutral-400">
                                Colour traces a stacked layer per colour (great for
                                vinyl &amp; concept). Silhouette gives one clean cut
                                path with counters as holes. Download, then drop the
                                SVG into the visualiser or nesting tool.
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

function Slider({
    label,
    value,
    min,
    max,
    step,
    suffix,
    onChange,
    action,
}: {
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    suffix: string;
    onChange: (v: number) => void;
    action?: React.ReactNode;
}) {
    return (
        <label className="block">
            <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-neutral-500">{label}</span>
                <span className="flex items-center gap-1.5">
                    {action}
                    <span className="text-[10px] tabular-nums text-neutral-400">
                        {value}
                        {suffix}
                    </span>
                </span>
            </div>
            <input
                type="range"
                min={min}
                max={max}
                step={step}
                value={value}
                onChange={(e) => onChange(Number(e.target.value))}
                className="mt-1 h-1 w-full accent-[#4e7e8c]"
                aria-label={label}
            />
        </label>
    );
}

function Toggle({
    label,
    on,
    onChange,
}: {
    label: string;
    on: boolean;
    onChange: (on: boolean) => void;
}) {
    return (
        <div className="flex items-center justify-between">
            <span className="text-[10px] text-neutral-500">{label}</span>
            <button
                type="button"
                onClick={() => onChange(!on)}
                aria-pressed={on}
                className={`min-h-[22px] rounded-full px-2.5 py-0.5 text-[10px] font-medium transition-colors ${
                    on
                        ? 'text-white'
                        : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                }`}
                style={on ? { background: ACCENT } : undefined}
            >
                {on ? 'On' : 'Off'}
            </button>
        </div>
    );
}

function Stat({ label, value }: { label: string; value: number }) {
    return (
        <div className="rounded-md bg-neutral-50 py-2">
            <div className="text-base font-bold tabular-nums text-neutral-800">
                {value.toLocaleString('en-GB')}
            </div>
            <div className="text-[9px] uppercase tracking-wide text-neutral-400">
                {label}
            </div>
        </div>
    );
}
