'use client';

import { useRef, useState } from 'react';
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

const ACCENT = '#4e7e8c';

const NeonScene = dynamic(() => import('./NeonScene'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center bg-[#07090d] text-sm text-neutral-500">
            Lighting up…
        </div>
    ),
});

interface Loaded {
    name: string;
    elements: NeonElement[];
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
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

    const handleFile = async (file: File) => {
        setError(null);
        if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
            setError('Please choose an SVG file.');
            return;
        }
        try {
            const text = await file.text();
            const imported = importSvg(text);
            const elements = measureNeon(imported.paths);
            if (elements.length === 0) {
                setError(
                    'No measurable paths found in that SVG. Make sure strokes/shapes are expanded to outlines, not images.',
                );
                return;
            }
            setLoaded({
                name: file.name.replace(/\.svg$/i, ''),
                elements,
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

    const onDownload = async () => {
        if (!loaded) return;
        setBusy(true);
        try {
            const blob = await generateNeonPdfBlob(loaded);
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

    const total = loaded ? totalLengthMm(loaded.elements) : 0;
    const bbox = loaded?.bbox;
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

            {!loaded ? (
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
                            Expand strokes to outlines in Illustrator first. The
                            SVG must carry real dimensions (mm) for accurate
                            lengths.
                        </p>
                    </div>
                    {error && (
                        <p className="mt-2 max-w-md text-center text-xs text-red-600">
                            {error}
                        </p>
                    )}
                </button>
            ) : view === 'measure' ? (
                <div className="flex flex-1 min-h-0 gap-3">
                    {/* Annotated preview */}
                    <div className="flex-1 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3">
                        <svg
                            viewBox={`${bbox!.minX} ${bbox!.minY} ${w} ${h}`}
                            className="h-full w-full"
                            preserveAspectRatio="xMidYMid meet"
                        >
                            {loaded.elements.map((el) => {
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
                            {loaded.elements.map((el) => {
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
                                {loaded.elements.length} run
                                {loaded.elements.length === 1 ? '' : 's'}
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
                                    {loaded.elements.map((el) => (
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
                        elements={loaded.elements}
                        bbox={loaded.bbox}
                        backboard={{ enabled: boardOn, paddingMm }}
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
                        <p className="text-[10px] leading-snug text-white/40">
                            Drag to orbit. Colours come from each path&apos;s SVG
                            stroke (fill if no stroke).
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
