'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    ArrowLeft,
    Bookmark,
    Box,
    FileText,
    Lightbulb,
    Ruler,
    Save,
    Trash2,
    X,
    Zap,
} from 'lucide-react';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    layoutLeds,
    formatW,
    defaultCascadeLimit,
    DEFAULT_LED_CONFIG,
    DEFAULT_DRIVER_LADDER,
    type LedLayoutConfig,
    type LedLayoutAnalysis,
    type LedDriverSpec,
    type CableSide,
    type LedStrategy,
    type LightingMode,
} from '@/lib/visualiser/led-layout';
import {
    LED_MODULE_CATALOG,
    FACE_LABELS,
    findModule,
    resolveSpacing,
    type FaceType,
} from '@/lib/visualiser/led-modules';
import { generateLedLayoutPdfBlob } from '@/lib/visualiser/led-layout-pdf';
import { ledCapture } from '@/lib/visualiser/led-capture';
import { trimImageDataUrl } from '@/lib/visualiser/image';
import {
    listLedLayouts,
    getLedLayout,
    saveLedLayout,
    deleteLedLayout,
    type LedLayoutSummary,
} from '@/lib/visualiser/led-layout-actions';
import { BinderButton } from '@/components/admin/BinderPicker';
import type { FlatPath } from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';
const FEED = '#d4661a';
const DRIVER_HEX = [
    '#4e7e8c',
    '#d4661a',
    '#228b57',
    '#7850aa',
    '#c83c5a',
    '#286eb4',
    '#aa8c1e',
    '#5a646e',
];
const driverHex = (i: number) => DRIVER_HEX[(i - 1 + DRIVER_HEX.length) % DRIVER_HEX.length];

const LedLayoutScene = dynamic(() => import('./LedLayoutScene'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center bg-[#0e131b] text-sm text-neutral-500">
            Lighting up…
        </div>
    ),
});

type Bbox = { minX: number; minY: number; maxX: number; maxY: number };
type View = 'measure' | '3d';

interface Loaded {
    name: string;
    svgText: string;
    paths: FlatPath[];
    bbox: Bbox;
}

function download(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
}

export function LedLayoutClient({
    initialJobs,
    driverSpecs,
}: {
    initialJobs: LedLayoutSummary[];
    driverSpecs: LedDriverSpec[];
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [view, setView] = useState<View>('measure');
    const [night, setNight] = useState(true);
    const [jobsOpen, setJobsOpen] = useState(false);

    const [calWidth, setCalWidth] = useState('');
    const [calHeight, setCalHeight] = useState('');
    const [cfg, setCfg] = useState<LedLayoutConfig>(DEFAULT_LED_CONFIG);

    const [jobs, setJobs] = useState<LedLayoutSummary[]>(initialJobs);
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobName, setJobName] = useState('');
    const [saveBusy, setSaveBusy] = useState(false);

    const specs = driverSpecs.length ? driverSpecs : DEFAULT_DRIVER_LADDER;
    const snapshotRef = useRef<string | null>(null);

    const loadSvgText = (text: string, name: string, id: string | null) => {
        try {
            const imported = importSvg(text);
            if (imported.paths.length === 0) {
                setError('No measurable paths found in that SVG. Expand strokes/shapes to outlines.');
                return false;
            }
            setLoaded({
                name,
                svgText: text,
                paths: imported.paths,
                bbox: {
                    minX: imported.bbox.x,
                    minY: imported.bbox.y,
                    maxX: imported.bbox.x + imported.bbox.w,
                    maxY: imported.bbox.y + imported.bbox.h,
                },
            });
            setJobId(id);
            setJobName(name);
            if (id === null) {
                setCalWidth('');
                setCalHeight('');
                setView('measure');
                snapshotRef.current = null;
            }
            return true;
        } catch {
            setError('Could not read that SVG. Is it a valid export?');
            return false;
        }
    };

    const handleFile = async (file: File) => {
        setError(null);
        if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
            setError('Please choose an SVG file.');
            return;
        }
        const text = await file.text();
        loadSvgText(text, file.name.replace(/\.svg$/i, ''), null);
    };

    const refreshJobs = async () => {
        const res = await listLedLayouts();
        if (res.ok) setJobs(res.data);
    };

    const openJob = async (id: string) => {
        setError(null);
        setJobsOpen(false);
        const res = await getLedLayout(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        const row = res.data;
        if (!loadSvgText(row.svg_source, row.name, row.id)) return;
        const c = row.config_json ?? { config: DEFAULT_LED_CONFIG };
        setCfg({ ...DEFAULT_LED_CONFIG, ...(c.config ?? {}) });
        setCalWidth(c.widthMm != null ? String(c.widthMm) : '');
        setCalHeight(c.heightMm != null ? String(c.heightMm) : '');
        setView('measure');
        snapshotRef.current = null;
    };

    const clear = () => {
        setLoaded(null);
        setError(null);
        setJobId(null);
        setJobName('');
        setCalWidth('');
        setCalHeight('');
        setCfg(DEFAULT_LED_CONFIG);
        setView('measure');
        snapshotRef.current = null;
        if (fileRef.current) fileRef.current.value = '';
    };

    const parsedW = parseFloat(calWidth);
    const parsedH = parseFloat(calHeight);
    const rawW = loaded ? Math.max(1, loaded.bbox.maxX - loaded.bbox.minX) : 1;
    const rawH = loaded ? Math.max(1, loaded.bbox.maxY - loaded.bbox.minY) : 1;
    const scale = parsedW > 0 ? parsedW / rawW : parsedH > 0 ? parsedH / rawH : 1;

    const { analysis, bbox } = useMemo((): {
        analysis: LedLayoutAnalysis | null;
        bbox: Bbox | null;
    } => {
        if (!loaded) return { analysis: null, bbox: null };
        const paths =
            scale === 1
                ? loaded.paths
                : loaded.paths.map((p) => ({
                      ...p,
                      points: p.points.map(([x, y]) => [x * scale, y * scale] as [number, number]),
                  }));
        return {
            analysis: layoutLeds(paths, cfg, specs),
            bbox: {
                minX: loaded.bbox.minX * scale,
                minY: loaded.bbox.minY * scale,
                maxX: loaded.bbox.maxX * scale,
                maxY: loaded.bbox.maxY * scale,
            },
        };
    }, [loaded, scale, cfg, specs]);

    // Keep a fresh 3D snapshot while in the 3D view, for the PDF.
    useEffect(() => {
        if (view !== '3d' || !analysis) return;
        const t = setTimeout(() => {
            const url = ledCapture.fn?.();
            if (url) snapshotRef.current = url;
        }, 650);
        return () => clearTimeout(t);
    }, [view, analysis, night]);

    const doSave = async (): Promise<string | null> => {
        if (!loaded) return null;
        const name = jobName.trim() || loaded.name;
        setSaveBusy(true);
        setError(null);
        try {
            const res = await saveLedLayout({
                id: jobId,
                name,
                svgSource: loaded.svgText,
                config: {
                    config: cfg,
                    widthMm: parsedW > 0 ? parsedW : null,
                    heightMm: parsedW > 0 ? null : parsedH > 0 ? parsedH : null,
                    fileName: loaded.name,
                },
            });
            if (!res.ok) {
                setError(res.error);
                return null;
            }
            setJobId(res.data.id);
            await refreshJobs();
            return res.data.id;
        } finally {
            setSaveBusy(false);
        }
    };

    const onDelete = async (id: string) => {
        const res = await deleteLedLayout(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        if (id === jobId) setJobId(null);
        await refreshJobs();
    };

    const onDownloadPdf = async () => {
        if (!loaded || !analysis) return;
        setBusy(true);
        try {
            const raw = view === '3d' ? (ledCapture.fn?.() ?? snapshotRef.current) : snapshotRef.current;
            const snapshotDataUrl = raw ? await trimImageDataUrl(raw) : null;
            const blob = await generateLedLayoutPdfBlob({
                name: jobName.trim() || loaded.name,
                analysis,
                config: cfg,
                driverSpecs: specs,
                snapshotDataUrl,
            });
            download(blob, `${loaded.name}-led-layout.pdf`);
        } finally {
            setBusy(false);
        }
    };

    const w = bbox ? Math.max(1, bbox.maxX - bbox.minX) : 1;
    const h = bbox ? Math.max(1, bbox.maxY - bbox.minY) : 1;
    const span = Math.max(w, h);
    const stroke = span / 360;
    const balloonR = span / 48;
    const dotR = Math.max(stroke * 1.1, span / 300);

    const setNum =
        (key: keyof LedLayoutConfig, min = 0) =>
        (v: string) => {
            const n = parseFloat(v);
            setCfg((c) => ({ ...c, [key]: Number.isFinite(n) && n >= min ? n : c[key] }));
        };

    // Pick a catalogue module (or Custom) → derive pitch / row / watts / cascade
    // / voltage from its depth × face spacing table. Manual edits below override.
    const applyLookup = (moduleId: string | null, depthMm: number, face: FaceType) => {
        const m = findModule(moduleId);
        if (!m) {
            setCfg((c) => ({ ...c, moduleId: null, canDepthMm: depthMm, faceType: face }));
            return;
        }
        const r = resolveSpacing(m, depthMm, face);
        setCfg((c) => ({
            ...c,
            moduleId: m.id,
            canDepthMm: depthMm,
            faceType: face,
            voltageV: r.voltageV,
            modulePitchMm: r.modulePitchMm,
            rowPitchMm: r.rowPitchMm,
            wattsPerModule: r.wattsPerModule,
            cascadeLimit: r.cascadeLimit,
        }));
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
                            <Lightbulb size={18} style={{ color: ACCENT }} /> LED layout &amp; wiring
                        </h1>
                        <p className="hidden sm:block text-xs text-neutral-500">
                            Upload letters → place LED modules → runs &amp; drivers → wiring PDF
                        </p>
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <BinderButton onPick={(a) => loadSvgText(a.svgSource, a.name, null)} />
                    <button
                        type="button"
                        onClick={() => setJobsOpen(true)}
                        className="md:hidden flex items-center gap-1 rounded-md border border-neutral-300 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                        <Bookmark size={14} /> Saved
                    </button>
                    {loaded && (
                        <>
                            <div className="flex rounded-md border border-neutral-300 p-0.5">
                                {(
                                    [
                                        ['measure', 'Measure', Ruler],
                                        ['3d', '3D', Box],
                                    ] as const
                                ).map(([v, label, Icon]) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() => setView(v as View)}
                                        className={`flex items-center gap-1 rounded px-2.5 py-1 text-xs font-medium ${
                                            view === v ? 'text-white' : 'text-neutral-600 hover:bg-neutral-100'
                                        }`}
                                        style={view === v ? { background: ACCENT } : undefined}
                                    >
                                        <Icon size={13} /> {label}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={jobName}
                                onChange={(e) => setJobName(e.target.value)}
                                placeholder="Job name"
                                className="w-32 md:w-36 rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:border-[#4e7e8c] focus:outline-none"
                            />
                            <button
                                type="button"
                                onClick={() => void doSave()}
                                disabled={saveBusy}
                                className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                            >
                                <Save size={14} />
                                {saveBusy ? 'Saving…' : jobId ? 'Update' : 'Save'}
                            </button>
                            <button
                                type="button"
                                onClick={clear}
                                className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-600 hover:bg-neutral-100"
                            >
                                <X size={14} /> Clear
                            </button>
                            <button
                                type="button"
                                onClick={onDownloadPdf}
                                disabled={busy}
                                className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                                style={{ background: ACCENT }}
                            >
                                <FileText size={14} />
                                {busy ? 'Building…' : 'Wiring PDF'}
                            </button>
                        </>
                    )}
                </div>
            </header>

            <input
                ref={fileRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
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
                    <span className="text-amber-700">Real size (W or H):</span>
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

            <div className="flex flex-1 min-h-0 flex-col md:flex-row gap-3">
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
                        className={`flex flex-1 min-h-[320px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed transition-colors ${
                            dragOver ? 'border-[#4e7e8c] bg-[#e8f0f3]' : 'border-neutral-300 bg-neutral-50 hover:border-neutral-400'
                        }`}
                    >
                        <Lightbulb size={32} className="text-neutral-400" />
                        <div className="text-center">
                            <p className="text-sm font-medium text-neutral-700">
                                Drop a letters / cabinet SVG, or click to choose
                            </p>
                            <p className="mt-1 text-xs text-neutral-500">
                                Or pull a logo from the binder. Outlined shapes work best.
                            </p>
                        </div>
                        {error && <p className="mt-2 max-w-md text-center text-xs text-red-600">{error}</p>}
                    </button>
                ) : (
                    <>
                        {/* Preview */}
                        <div className="relative flex-1 min-w-0 min-h-[320px] md:min-h-0 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                            {view === 'measure' ? (
                                <div className="h-full w-full p-3">
                                    <svg
                                        viewBox={`${bbox!.minX} ${bbox!.minY} ${w} ${h}`}
                                        className="h-full w-full"
                                        preserveAspectRatio="xMidYMid meet"
                                    >
                                        {/* letter outlines */}
                                        {analysis!.letters.map((l) => (
                                            <path
                                                key={`l${l.index}`}
                                                d={
                                                    l.points
                                                        .map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`)
                                                        .join(' ') + ' Z'
                                                }
                                                fill="none"
                                                stroke="#c8ccd0"
                                                strokeWidth={stroke}
                                            />
                                        ))}
                                        {/* feed lines */}
                                        {analysis!.drivers.map((d) => (
                                            <line
                                                key={`f${d.index}`}
                                                x1={analysis!.cableEntry[0]}
                                                y1={analysis!.cableEntry[1]}
                                                x2={d.position[0]}
                                                y2={d.position[1]}
                                                stroke={FEED}
                                                strokeWidth={stroke}
                                                strokeDasharray={`${stroke * 3} ${stroke * 2}`}
                                            />
                                        ))}
                                        {/* run paths + module dots */}
                                        {analysis!.runs.map((run) => {
                                            const c = driverHex(run.driverIndex);
                                            const d =
                                                run.modules.length > 1
                                                    ? run.modules
                                                          .map((m, i) => `${i === 0 ? 'M' : 'L'}${m[0]} ${m[1]}`)
                                                          .join(' ')
                                                    : '';
                                            return (
                                                <g key={`r${run.index}`}>
                                                    {d && (
                                                        <path d={d} fill="none" stroke={c} strokeWidth={stroke} strokeLinejoin="round" />
                                                    )}
                                                    {run.modules.map((m, i) => (
                                                        <circle key={i} cx={m[0]} cy={m[1]} r={dotR} fill={c} />
                                                    ))}
                                                </g>
                                            );
                                        })}
                                        {/* driver boxes */}
                                        {analysis!.drivers.map((d) => (
                                            <g key={`d${d.index}`}>
                                                <rect
                                                    x={d.position[0] - balloonR * 1.6}
                                                    y={d.position[1] - balloonR}
                                                    width={balloonR * 3.2}
                                                    height={balloonR * 2}
                                                    rx={balloonR * 0.3}
                                                    fill="#fff"
                                                    stroke={driverHex(d.index)}
                                                    strokeWidth={stroke}
                                                />
                                                <text
                                                    x={d.position[0]}
                                                    y={d.position[1] + balloonR * 0.4}
                                                    fontSize={balloonR}
                                                    fontWeight="bold"
                                                    fill={driverHex(d.index)}
                                                    textAnchor="middle"
                                                >
                                                    D{d.index}
                                                </text>
                                            </g>
                                        ))}
                                        {/* letter balloons */}
                                        {analysis!.letters.map((l) => (
                                            <g key={`b${l.index}`}>
                                                <circle cx={l.centroid[0]} cy={l.centroid[1]} r={balloonR} fill={ACCENT} />
                                                <text
                                                    x={l.centroid[0]}
                                                    y={l.centroid[1] + balloonR * 0.36}
                                                    fontSize={balloonR * 1.1}
                                                    fontWeight="bold"
                                                    fill="#fff"
                                                    textAnchor="middle"
                                                >
                                                    {l.index}
                                                </text>
                                            </g>
                                        ))}
                                        {/* cable-in marker */}
                                        <circle cx={analysis!.cableEntry[0]} cy={analysis!.cableEntry[1]} r={balloonR * 0.9} fill={FEED} />
                                    </svg>
                                </div>
                            ) : (
                                <>
                                    <LedLayoutScene analysis={analysis!} night={night} />
                                    <div className="absolute left-3 top-3 z-10 flex rounded-md border border-white/15 bg-black/40 p-0.5 backdrop-blur">
                                        {(
                                            [
                                                ['night', 'Night'],
                                                ['day', 'Day'],
                                            ] as const
                                        ).map(([v, label]) => {
                                            const active = (v === 'night') === night;
                                            return (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() => setNight(v === 'night')}
                                                    className={`rounded px-2.5 py-1 text-[11px] font-medium ${
                                                        active ? 'text-white' : 'text-white/60 hover:text-white'
                                                    }`}
                                                    style={active ? { background: ACCENT } : undefined}
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-black/55 px-2 py-1 text-[10px] font-medium text-white">
                                        Drag to orbit · this view prints on the wiring sheet
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Right column */}
                        <div className="flex w-full md:w-80 shrink-0 flex-col gap-3 md:overflow-y-auto">
                            {/* Totals */}
                            <div className="shrink-0 rounded-xl px-4 py-3 text-white" style={{ background: ACCENT }}>
                                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-90">Total load</p>
                                <p className="text-2xl font-bold tabular-nums">{formatW(analysis!.totalWatts)}</p>
                                <p className="text-xs opacity-90">
                                    {analysis!.totalModules} modules · {analysis!.runs.length} runs
                                </p>
                                <p className="mt-1.5 flex items-center gap-1.5 text-xs opacity-90">
                                    <Zap size={12} />
                                    {analysis!.drivers.length} driver{analysis!.drivers.length === 1 ? '' : 's'} · {cfg.voltageV} V
                                </p>
                            </div>

                            {/* Config */}
                            <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-3">
                                <h3 className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">LED spec</h3>
                                <div className="mb-2 space-y-2">
                                    <label className="block">
                                        <span className="text-[10px] text-neutral-500">LED module</span>
                                        <select
                                            value={cfg.moduleId ?? ''}
                                            onChange={(e) => applyLookup(e.target.value || null, cfg.canDepthMm, cfg.faceType)}
                                            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[#4e7e8c] focus:outline-none"
                                        >
                                            <option value="">Custom (manual)</option>
                                            {LED_MODULE_CATALOG.map((m) => (
                                                <option key={m.id} value={m.id}>
                                                    {m.name}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    {cfg.moduleId && (
                                        <div className="grid grid-cols-2 gap-2">
                                            <NumField
                                                label="Can depth (mm)"
                                                value={cfg.canDepthMm}
                                                step={5}
                                                onChange={(v) => {
                                                    const n = parseFloat(v);
                                                    if (Number.isFinite(n) && n > 0)
                                                        applyLookup(cfg.moduleId, n, cfg.faceType);
                                                }}
                                            />
                                            <label className="block">
                                                <span className="text-[10px] text-neutral-500">Face</span>
                                                <select
                                                    value={cfg.faceType}
                                                    onChange={(e) => applyLookup(cfg.moduleId, cfg.canDepthMm, e.target.value as FaceType)}
                                                    className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[#4e7e8c] focus:outline-none"
                                                >
                                                    {(['standard', 'dark', 'perforated'] as FaceType[]).map((f) => (
                                                        <option key={f} value={f}>
                                                            {FACE_LABELS[f]}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                        </div>
                                    )}
                                </div>
                                <div className="mb-2 flex gap-2">
                                    <Segmented
                                        options={[
                                            ['12', '12 V'],
                                            ['24', '24 V'],
                                        ]}
                                        value={String(cfg.voltageV)}
                                        onChange={(v) => {
                                            const nv = v === '24' ? 24 : 12;
                                            setCfg((c) => ({
                                                ...c,
                                                voltageV: nv,
                                                cascadeLimit: defaultCascadeLimit(nv),
                                            }));
                                        }}
                                    />
                                    <Segmented
                                        options={[
                                            ['auto', 'Auto'],
                                            ['stroke', 'Stroke'],
                                            ['area', 'Area'],
                                        ]}
                                        value={cfg.strategy}
                                        onChange={(v) => setCfg((c) => ({ ...c, strategy: v as LedStrategy }))}
                                    />
                                </div>
                                <div className="mb-2">
                                    <Segmented
                                        options={[
                                            ['front', 'Front-lit'],
                                            ['halo', 'Halo'],
                                            ['edge', 'Edge'],
                                        ]}
                                        value={cfg.lightingMode}
                                        onChange={(v) => setCfg((c) => ({ ...c, lightingMode: v as LightingMode }))}
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <NumField label="Module pitch (mm)" value={cfg.modulePitchMm} step={5} onChange={setNum('modulePitchMm', 5)} />
                                    <NumField label="Row pitch (mm)" value={cfg.rowPitchMm} step={5} onChange={setNum('rowPitchMm', 5)} />
                                    <NumField label="Watts / module" value={cfg.wattsPerModule} step={0.1} onChange={setNum('wattsPerModule', 0.01)} />
                                    <NumField label="Cascade limit" value={cfg.cascadeLimit} step={1} onChange={setNum('cascadeLimit', 1)} />
                                    <NumField label="Max run (mm)" value={cfg.maxRunLengthMm} step={100} onChange={setNum('maxRunLengthMm', 100)} />
                                    <label className="block">
                                        <span className="flex items-center justify-between text-[10px] text-neutral-500">
                                            <span>Driver headroom</span>
                                            <span className="tabular-nums">{Math.round(cfg.driverHeadroom * 100)}%</span>
                                        </span>
                                        <input
                                            type="range"
                                            min={50}
                                            max={100}
                                            step={5}
                                            value={Math.round(cfg.driverHeadroom * 100)}
                                            onChange={(e) => setCfg((c) => ({ ...c, driverHeadroom: parseInt(e.target.value, 10) / 100 }))}
                                            className="mt-2 w-full accent-[#4e7e8c]"
                                        />
                                    </label>
                                    {cfg.lightingMode === 'halo' && (
                                        <NumField label="Standoff (mm)" value={cfg.standoffMm} step={5} onChange={setNum('standoffMm', 0)} />
                                    )}
                                    <label className="block">
                                        <span className="text-[10px] text-neutral-500">IP rating</span>
                                        <input
                                            type="text"
                                            value={cfg.ipRating}
                                            onChange={(e) => setCfg((c) => ({ ...c, ipRating: e.target.value }))}
                                            className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-[#4e7e8c] focus:outline-none"
                                        />
                                    </label>
                                </div>
                                <div className="mt-2">
                                    <span className="text-[10px] text-neutral-500">Cable in</span>
                                    <div className="mt-1 flex rounded-md border border-neutral-300 p-0.5">
                                        {(['left', 'right', 'top', 'bottom'] as CableSide[]).map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() => setCfg((c) => ({ ...c, cableSide: s }))}
                                                className={`flex-1 rounded px-1.5 py-1 text-[11px] font-medium capitalize ${
                                                    cfg.cableSide === s ? 'text-white' : 'text-neutral-600 hover:bg-neutral-100'
                                                }`}
                                                style={cfg.cableSide === s ? { background: ACCENT } : undefined}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                {driverSpecs.length === 0 && (
                                    <p className="mt-2 text-[10px] text-neutral-400">
                                        Using a default driver ladder — add power supplies to the rate card for real costs.
                                    </p>
                                )}
                            </div>

                            {/* Drivers table */}
                            <div className="flex flex-col md:min-h-0 md:flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                                <div className="overflow-y-auto max-h-[40vh] md:max-h-none">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500">
                                            <tr>
                                                <th className="px-2 py-2 text-left font-semibold">Driver</th>
                                                <th className="px-2 py-2 text-left font-semibold">Type</th>
                                                <th className="px-2 py-2 text-right font-semibold">Load</th>
                                                <th className="px-2 py-2 text-right font-semibold">% cap</th>
                                                <th className="px-2 py-2 text-right font-semibold">Out</th>
                                                <th className="px-2 py-2 text-right font-semibold">Mods</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analysis!.drivers.map((d) => (
                                                <tr key={d.index} className="border-t border-neutral-100">
                                                    <td className="px-2 py-1.5">
                                                        <span
                                                            className="inline-flex h-5 items-center justify-center rounded px-1.5 text-[11px] font-bold text-white"
                                                            style={{ background: driverHex(d.index) }}
                                                        >
                                                            D{d.index}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-neutral-600">{d.type}</td>
                                                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-700">{formatW(d.loadW)}</td>
                                                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{Math.round(d.loadPct)}%</td>
                                                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{d.outputs}</td>
                                                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">{d.moduleCount}</td>
                                                </tr>
                                            ))}
                                            {analysis!.drivers.length === 0 && (
                                                <tr>
                                                    <td colSpan={6} className="px-2 py-4 text-center text-xs text-neutral-400">
                                                        No modules placed — adjust the pitch or strategy.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </>
                )}

                {/* Saved rail (desktop) */}
                <aside className="hidden md:flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    <div className="shrink-0 flex items-center gap-1.5 border-b border-neutral-100 px-3 py-2.5">
                        <Bookmark size={14} className="text-neutral-400" />
                        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Saved layouts</h2>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        <JobsList jobs={jobs} jobId={jobId} onOpen={(id) => void openJob(id)} onDelete={(id) => void onDelete(id)} />
                    </div>
                </aside>
            </div>

            {/* Saved drawer (mobile) */}
            {jobsOpen && (
                <div className="fixed inset-0 z-40 md:hidden">
                    <button type="button" aria-label="Close" onClick={() => setJobsOpen(false)} className="absolute inset-0 bg-black/40" />
                    <div className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-white shadow-xl">
                        <div className="flex items-center justify-between border-b border-neutral-100 px-3 py-3">
                            <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-neutral-500">
                                <Bookmark size={14} className="text-neutral-400" /> Saved layouts
                            </h2>
                            <button type="button" onClick={() => setJobsOpen(false)} aria-label="Close" className="rounded p-1 text-neutral-400 hover:bg-neutral-100">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-y-auto">
                            <JobsList jobs={jobs} jobId={jobId} onOpen={(id) => void openJob(id)} onDelete={(id) => void onDelete(id)} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function JobsList({
    jobs,
    jobId,
    onOpen,
    onDelete,
}: {
    jobs: LedLayoutSummary[];
    jobId: string | null;
    onOpen: (id: string) => void;
    onDelete: (id: string) => void;
}) {
    if (jobs.length === 0) {
        return <p className="px-3 py-4 text-xs text-neutral-400">No saved layouts yet. Load an SVG and hit Save.</p>;
    }
    return (
        <ul className="divide-y divide-neutral-100">
            {jobs.map((j) => (
                <li
                    key={j.id}
                    className={`group flex items-center gap-2 px-3 py-2.5 ${j.id === jobId ? 'bg-[#e8f0f3]' : 'hover:bg-neutral-50'}`}
                >
                    <button type="button" onClick={() => onOpen(j.id)} className="min-w-0 flex-1 text-left">
                        <span className="block truncate text-xs font-medium text-neutral-800">{j.name}</span>
                        <span className="block text-[10px] text-neutral-400">{new Date(j.updated_at).toLocaleDateString('en-GB')}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => onDelete(j.id)}
                        aria-label={`Delete ${j.name}`}
                        className="shrink-0 rounded p-1.5 text-neutral-300 hover:bg-red-50 hover:text-red-500"
                    >
                        <Trash2 size={14} />
                    </button>
                </li>
            ))}
        </ul>
    );
}

function Segmented({
    options,
    value,
    onChange,
}: {
    options: Array<[string, string]>;
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div className="flex flex-1 rounded-md border border-neutral-300 p-0.5">
            {options.map(([v, label]) => (
                <button
                    key={v}
                    type="button"
                    onClick={() => onChange(v)}
                    className={`flex-1 rounded px-1.5 py-1 text-[11px] font-medium ${
                        value === v ? 'text-white' : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                    style={value === v ? { background: ACCENT } : undefined}
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

function NumField({
    label,
    value,
    onChange,
    step,
}: {
    label: string;
    value: number;
    onChange: (v: string) => void;
    step: number;
}) {
    return (
        <label className="block">
            <span className="text-[10px] text-neutral-500">{label}</span>
            <input
                type="number"
                inputMode="decimal"
                step={step}
                value={value}
                onChange={(e) => onChange(e.target.value)}
                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs tabular-nums focus:border-[#4e7e8c] focus:outline-none"
            />
        </label>
    );
}
