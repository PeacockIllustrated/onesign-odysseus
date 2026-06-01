'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    ArrowLeft,
    Download,
    Ruler,
    Sparkles,
    Upload,
    X,
} from 'lucide-react';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    measureNeon,
    totalLengthMm,
    formatMm,
    formatM,
    type NeonElement,
} from '@/lib/visualiser/neon';
import { generateNeonPdfBlob } from '@/lib/visualiser/neon-pdf';
import type { FlatPath } from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';

const NeonScene = dynamic(() => import('./NeonScene'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center bg-[#07090d] text-sm text-neutral-500">
            Lighting up…
        </div>
    ),
});

type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

interface Loaded {
    name: string;
    /** Raw flattened paths (mm as read from the SVG, before any calibration). */
    paths: FlatPath[];
    /** Raw bounding box, before calibration. */
    bbox: Bbox;
}

export function NeonMeasureClient() {
    const fileRef = useRef<HTMLInputElement>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [view, setView] = useState<'measure' | 'glow'>('measure');
    const [boardOn, setBoardOn] = useState(true);
    const [paddingMm, setPaddingMm] = useState(50);
    const [saturation, setSaturation] = useState(1);
    // Manual calibration: the real WIDTH or HEIGHT (mm) of the artwork — enter
    // either one (aspect ratio is fixed, so one dimension sets the scale).
    // Needed because Illustrator often exports without real-world units, which
    // makes the raw geometry read in points, not mm. Captured up front on
    // upload so the very first generation is already to scale.
    const [calWidth, setCalWidth] = useState('');
    const [calHeight, setCalHeight] = useState('');

    const handleFile = async (file: File) => {
        setError(null);
        if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
            setError('Please choose an SVG file.');
            return;
        }
        try {
            const text = await file.text();
            const imported = importSvg(text);
            if (measureNeon(imported.paths).length === 0) {
                setError(
                    'No measurable paths found in that SVG. Make sure strokes/shapes are expanded to outlines, not images.',
                );
                return;
            }
            setLoaded({
                name: file.name.replace(/\.svg$/i, ''),
                paths: imported.paths,
                bbox: {
                    minX: imported.bbox.x,
                    minY: imported.bbox.y,
                    maxX: imported.bbox.x + imported.bbox.w,
                    maxY: imported.bbox.y + imported.bbox.h,
                },
            });
        } catch {
            setError('Could not read that SVG. Is it a valid SVG export?');
        }
    };

    // Raw (uncalibrated) dimensions + the scale implied by a manual width OR
    // height (width wins if both are somehow set).
    const rawW = loaded ? Math.max(1, loaded.bbox.maxX - loaded.bbox.minX) : 1;
    const rawH = loaded ? Math.max(1, loaded.bbox.maxY - loaded.bbox.minY) : 1;
    const parsedW = parseFloat(calWidth);
    const parsedH = parseFloat(calHeight);
    const scale =
        parsedW > 0 ? parsedW / rawW : parsedH > 0 ? parsedH / rawH : 1;

    // Calibrated geometry: scale the raw paths, then measure. Memoised so it
    // only recomputes when the file or the calibration changes.
    const { elements, bbox } = useMemo(() => {
        if (!loaded) return { elements: [] as NeonElement[], bbox: null as Bbox | null };
        const paths =
            scale === 1
                ? loaded.paths
                : loaded.paths.map((p) => ({
                      ...p,
                      points: p.points.map(
                          ([x, y]) => [x * scale, y * scale] as [number, number],
                      ),
                  }));
        return {
            elements: measureNeon(paths),
            bbox: {
                minX: loaded.bbox.minX * scale,
                minY: loaded.bbox.minY * scale,
                maxX: loaded.bbox.maxX * scale,
                maxY: loaded.bbox.maxY * scale,
            },
        };
    }, [loaded, scale]);

    const total = totalLengthMm(elements);

    const onDownload = async () => {
        if (!loaded || !bbox) return;
        setBusy(true);
        try {
            const blob = await generateNeonPdfBlob({
                name: loaded.name,
                elements,
                bbox,
                backboard: { enabled: boardOn, paddingMm },
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${loaded.name}-neon-lengths.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            URL.revokeObjectURL(url);
        } finally {
            setBusy(false);
        }
    };

    const w = bbox ? Math.max(1, bbox.maxX - bbox.minX) : 1;
    const h = bbox ? Math.max(1, bbox.maxY - bbox.minY) : 1;
    const span = Math.max(w, h);
    const stroke = span / 320;
    const balloonR = span / 42;

    return (
        <div className="flex flex-col gap-3 h-[calc(100dvh-7rem)] md:min-h-[560px] overflow-hidden">
            <header className="shrink-0 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <Link
                        href="/admin/visualiser"
                        className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700"
                    >
                        <ArrowLeft size={14} /> Visualiser
                    </Link>
                    <div>
                        <h1 className="flex items-center gap-2 text-base md:text-lg font-bold tracking-tight text-neutral-900">
                            <Ruler size={18} style={{ color: ACCENT }} /> Neon length
                            tool
                        </h1>
                        <p className="hidden sm:block text-xs text-neutral-500">
                            Upload artwork → measure every path → annotated
                            run-length PDF for neon flex
                        </p>
                    </div>
                </div>
                {loaded && (
                    <div className="flex items-center gap-2">
                        <div className="flex rounded-md border border-neutral-300 p-0.5">
                            <button
                                type="button"
                                onClick={() => setView('measure')}
                                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                                    view === 'measure'
                                        ? 'text-white'
                                        : 'text-neutral-600 hover:bg-neutral-100'
                                }`}
                                style={
                                    view === 'measure'
                                        ? { background: ACCENT }
                                        : undefined
                                }
                            >
                                <Ruler size={13} /> Measure
                            </button>
                            <button
                                type="button"
                                onClick={() => setView('glow')}
                                className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                                    view === 'glow'
                                        ? 'text-white'
                                        : 'text-neutral-600 hover:bg-neutral-100'
                                }`}
                                style={
                                    view === 'glow'
                                        ? { background: ACCENT }
                                        : undefined
                                }
                            >
                                <Sparkles size={13} /> Neon preview
                            </button>
                        </div>
                        <button
                            type="button"
                            onClick={() => {
                                setLoaded(null);
                                setError(null);
                                if (fileRef.current) fileRef.current.value = '';
                            }}
                            className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                        >
                            <X size={14} /> Clear
                        </button>
                        <button
                            type="button"
                            onClick={onDownload}
                            disabled={busy}
                            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            style={{ background: ACCENT }}
                        >
                            <Download size={14} />
                            {busy ? 'Building…' : 'Download annotated PDF'}
                        </button>
                    </div>
                )}
            </header>

            <input
                ref={fileRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                }}
            />

            {loaded && (
                <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-900">
                    <span>
                        SVG reads{' '}
                        <b className="tabular-nums">
                            {Math.round(rawW)} × {Math.round(rawH)} mm
                        </b>
                        .
                    </span>
                    <span className="text-amber-700">
                        Real size (enter width OR height):
                    </span>
                    <label className="flex items-center gap-1 font-medium">
                        W
                        <input
                            type="number"
                            inputMode="decimal"
                            value={calWidth}
                            placeholder={String(Math.round(rawW * scale))}
                            onChange={(e) => {
                                setCalWidth(e.target.value);
                                setCalHeight('');
                            }}
                            className="w-20 rounded border border-amber-300 bg-white px-2 py-0.5 text-right tabular-nums focus:border-amber-500 focus:outline-none"
                        />
                    </label>
                    <span className="text-amber-500">or</span>
                    <label className="flex items-center gap-1 font-medium">
                        H
                        <input
                            type="number"
                            inputMode="decimal"
                            value={calHeight}
                            placeholder={String(Math.round(rawH * scale))}
                            onChange={(e) => {
                                setCalHeight(e.target.value);
                                setCalWidth('');
                            }}
                            className="w-20 rounded border border-amber-300 bg-white px-2 py-0.5 text-right tabular-nums focus:border-amber-500 focus:outline-none"
                        />
                        mm
                    </label>
                    {scale !== 1 && (
                        <span className="rounded bg-amber-200 px-1.5 py-0.5 font-semibold tabular-nums">
                            → {Math.round(rawW * scale)} × {Math.round(rawH * scale)} mm
                        </span>
                    )}
                </div>
            )}

            {!loaded ? (
                <div className="flex flex-1 min-h-0 flex-col gap-3">
                    {/* Real-world size prompt — captured BEFORE upload so the
                        first generation is already to scale. */}
                    <div className="shrink-0 rounded-xl border border-[#b8d0d8] bg-[#e8f0f3] p-3">
                        <p className="text-xs font-semibold text-[#3a5f6a]">
                            Real-world size
                            <span className="ml-1 font-normal text-[#4e7e8c]">
                                — enter the finished WIDTH or HEIGHT (mm). Either
                                one sets the scale, so the first run length is
                                exact.
                            </span>
                        </p>
                        <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[#3a5f6a]">
                            <label className="flex items-center gap-1.5 font-medium">
                                Width
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={calWidth}
                                    placeholder="e.g. 1200"
                                    onChange={(e) => {
                                        setCalWidth(e.target.value);
                                        setCalHeight('');
                                    }}
                                    className="w-28 rounded border border-[#b8d0d8] bg-white px-2 py-1 text-right tabular-nums focus:border-[#4e7e8c] focus:outline-none"
                                />
                                mm
                            </label>
                            <span className="text-[#4e7e8c]">or</span>
                            <label className="flex items-center gap-1.5 font-medium">
                                Height
                                <input
                                    type="number"
                                    inputMode="decimal"
                                    value={calHeight}
                                    placeholder="e.g. 300"
                                    onChange={(e) => {
                                        setCalHeight(e.target.value);
                                        setCalWidth('');
                                    }}
                                    className="w-28 rounded border border-[#b8d0d8] bg-white px-2 py-1 text-right tabular-nums focus:border-[#4e7e8c] focus:outline-none"
                                />
                                mm
                            </label>
                        </div>
                        <p className="mt-1.5 text-[11px] text-[#4e7e8c]">
                            Leave blank to trust the SVG&apos;s own dimensions
                            (only correct if it was exported with real mm units).
                            You can adjust after loading.
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={() => fileRef.current?.click()}
                        onDragOver={(e) => {
                            e.preventDefault();
                            setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                            e.preventDefault();
                            setDragOver(false);
                            const f = e.dataTransfer.files?.[0];
                            if (f) handleFile(f);
                        }}
                        className={`flex flex-1 flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
                            dragOver
                                ? 'border-[#4e7e8c] bg-[#e8f0f3]'
                                : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
                        }`}
                    >
                        <Upload size={32} className="text-neutral-400" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-neutral-700">
                                Drop an SVG here, or click to choose
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                                Expand strokes to outlines in Illustrator first.
                            </p>
                        </div>
                        {error && (
                            <p className="mt-2 max-w-md text-center text-xs text-red-600">
                                {error}
                            </p>
                        )}
                    </button>
                </div>
            ) : view === 'measure' ? (
                <div className="flex flex-1 min-h-0 gap-3">
                    {/* Annotated preview */}
                    <div className="flex-1 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3">
                        <svg
                            viewBox={`${bbox!.minX} ${bbox!.minY} ${w} ${h}`}
                            className="h-full w-full"
                            preserveAspectRatio="xMidYMid meet"
                        >
                            {elements.map((el) => {
                                const d =
                                    el.points
                                        .map(
                                            (p, i) =>
                                                `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`,
                                        )
                                        .join(' ') + (el.closed ? ' Z' : '');
                                return (
                                    <path
                                        key={`p${el.index}`}
                                        d={d}
                                        fill="none"
                                        stroke={ACCENT}
                                        strokeWidth={stroke}
                                        strokeLinejoin="round"
                                        strokeLinecap="round"
                                    />
                                );
                            })}
                            {elements.map((el) => {
                                const cx = el.centroid[0];
                                const cy = el.centroid[1];
                                const bx = cx - balloonR * 2;
                                const by = cy - balloonR * 2;
                                return (
                                    <g key={`b${el.index}`}>
                                        <line
                                            x1={cx}
                                            y1={cy}
                                            x2={bx}
                                            y2={by}
                                            stroke={ACCENT}
                                            strokeWidth={stroke * 0.6}
                                        />
                                        <circle
                                            cx={cx}
                                            cy={cy}
                                            r={stroke * 1.6}
                                            fill={ACCENT}
                                        />
                                        <circle
                                            cx={bx}
                                            cy={by}
                                            r={balloonR}
                                            fill={ACCENT}
                                        />
                                        <text
                                            x={bx}
                                            y={by + balloonR * 0.36}
                                            fontSize={balloonR * 1.1}
                                            fontWeight="bold"
                                            fill="#fff"
                                            textAnchor="middle"
                                        >
                                            {el.index}
                                        </text>
                                    </g>
                                );
                            })}
                        </svg>
                    </div>

                    {/* Length table */}
                    <div className="flex w-72 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                        <div
                            className="shrink-0 px-4 py-3 text-white"
                            style={{ background: ACCENT }}
                        >
                            <p className="text-[10px] font-semibold uppercase tracking-widest opacity-90">
                                Total neon flex
                            </p>
                            <p className="text-2xl font-bold tabular-nums">
                                {formatM(total)}
                            </p>
                            <p className="text-xs opacity-90">
                                {formatMm(total)} ·{' '}
                                {elements.length} run
                                {elements.length === 1 ? '' : 's'}
                            </p>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <table className="w-full text-sm">
                                <thead className="sticky top-0 bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500">
                                    <tr>
                                        <th className="px-3 py-2 text-left font-semibold">
                                            Run
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold">
                                            mm
                                        </th>
                                        <th className="px-3 py-2 text-right font-semibold">
                                            m
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {elements.map((el) => (
                                        <tr
                                            key={el.index}
                                            className="border-t border-neutral-100"
                                        >
                                            <td className="px-3 py-1.5">
                                                <span
                                                    className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                                                    style={{ background: ACCENT }}
                                                >
                                                    {el.index}
                                                </span>
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-neutral-700">
                                                {Math.round(
                                                    el.lengthMm,
                                                ).toLocaleString('en-GB')}
                                            </td>
                                            <td className="px-3 py-1.5 text-right tabular-nums text-neutral-500">
                                                {(el.lengthMm / 1000).toFixed(2)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="relative flex-1 min-h-0 overflow-hidden rounded-xl border border-neutral-800 bg-[#07090d]">
                    <NeonScene
                        elements={elements}
                        bbox={bbox!}
                        backboard={{ enabled: boardOn, paddingMm }}
                        saturation={saturation}
                    />
                    {/* Backboard controls */}
                    <div className="absolute left-3 top-3 flex w-52 flex-col gap-2 rounded-lg border border-white/10 bg-black/55 p-3 text-white shadow-lg backdrop-blur">
                        <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                            Clear acrylic backboard
                        </span>
                        <button
                            type="button"
                            onClick={() => setBoardOn((v) => !v)}
                            aria-pressed={boardOn}
                            className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors"
                            style={{
                                background: boardOn
                                    ? ACCENT
                                    : 'rgba(255,255,255,0.08)',
                            }}
                        >
                            <span>Backboard</span>
                            <span className="text-[10px] uppercase tracking-wide">
                                {boardOn ? 'On' : 'Off'}
                            </span>
                        </button>
                        <label
                            className={`flex flex-col gap-1 ${
                                boardOn ? '' : 'opacity-40'
                            }`}
                        >
                            <span className="flex items-center justify-between text-[11px] text-white/70">
                                <span>Padding</span>
                                <span className="tabular-nums">
                                    {paddingMm} mm
                                </span>
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={300}
                                step={5}
                                value={paddingMm}
                                disabled={!boardOn}
                                onChange={(e) =>
                                    setPaddingMm(parseInt(e.target.value, 10))
                                }
                                className="w-full accent-[#46e8ff]"
                            />
                        </label>
                        <div className="mt-1 border-t border-white/10 pt-2">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-white/60">
                                Glow
                            </span>
                            <label className="mt-1.5 flex flex-col gap-1">
                                <span className="flex items-center justify-between text-[11px] text-white/70">
                                    <span>Saturation</span>
                                    <span className="tabular-nums">
                                        {Math.round(saturation * 100)}%
                                    </span>
                                </span>
                                <input
                                    type="range"
                                    min={0}
                                    max={3}
                                    step={0.05}
                                    value={saturation}
                                    onChange={(e) =>
                                        setSaturation(parseFloat(e.target.value))
                                    }
                                    className="w-full accent-[#46e8ff]"
                                />
                            </label>
                        </div>
                        <p className="text-[10px] leading-snug text-white/40">
                            Drag to orbit. Colours come from each path&apos;s SVG
                            stroke (fill if no stroke); saturation pops them.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
