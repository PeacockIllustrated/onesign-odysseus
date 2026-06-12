'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
    ArrowLeft,
    Bookmark,
    Download,
    ExternalLink,
    FileText,
    Hammer,
    Layers,
    Save,
    Send,
    Trash2,
    Upload,
    X,
} from 'lucide-react';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    analyzeReturns,
    formatMm,
    formatM,
    DEFAULT_RETURNS_CONFIG,
    type ReturnsConfig,
    type ReturnsAnalysis,
} from '@/lib/visualiser/returns';
import { buildReturnsNestSvg } from '@/lib/visualiser/returns-export';
import { generateReturnsPdfBlob } from '@/lib/visualiser/returns-pdf';
import {
    listReturnJobs,
    getReturnJob,
    saveReturnJob,
    deleteReturnJob,
    sendReturnsToNester,
    listNestsForReturnJob,
    type ReturnJobSummary,
    type LinkedNest,
} from '@/lib/visualiser/returns-actions';
import type { FlatPath } from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';
const WELD = '#d4661a';

type Bbox = { minX: number; minY: number; maxX: number; maxY: number };

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

export function ReturnsClient({
    initialJobs,
    initialLoadId,
}: {
    initialJobs: ReturnJobSummary[];
    initialLoadId: string | null;
}) {
    const router = useRouter();
    const fileRef = useRef<HTMLInputElement>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [busy, setBusy] = useState(false);
    const [sendBusy, setSendBusy] = useState(false);

    // Real-world calibration — Illustrator often exports in points, not mm.
    const [calWidth, setCalWidth] = useState('');
    const [calHeight, setCalHeight] = useState('');

    // Returns config.
    const [cfg, setCfg] = useState<ReturnsConfig>(DEFAULT_RETURNS_CONFIG);

    // Saved jobs (DB-backed, shared).
    const [jobs, setJobs] = useState<ReturnJobSummary[]>(initialJobs);
    const [jobId, setJobId] = useState<string | null>(null);
    const [jobName, setJobName] = useState('');
    const [saveBusy, setSaveBusy] = useState(false);
    const [linkedNests, setLinkedNests] = useState<LinkedNest[]>([]);

    const loadSvgText = (text: string, name: string, id: string | null) => {
        try {
            const imported = importSvg(text);
            if (imported.paths.length === 0) {
                setError(
                    'No measurable paths found in that SVG. Expand strokes/shapes to outlines (not images).',
                );
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
                setLinkedNests([]);
            }
            return true;
        } catch {
            setError('Could not read that SVG. Is it a valid SVG export?');
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
        const res = await listReturnJobs();
        if (res.ok) setJobs(res.data);
    };

    const refreshLinkedNests = async (id: string) => {
        const res = await listNestsForReturnJob(id);
        setLinkedNests(res.ok ? res.data : []);
    };

    const openJob = async (id: string) => {
        setError(null);
        const res = await getReturnJob(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        const row = res.data;
        if (!loadSvgText(row.svg_source, row.name, row.id)) return;
        const c = row.config_json ?? { config: DEFAULT_RETURNS_CONFIG };
        setCfg({ ...DEFAULT_RETURNS_CONFIG, ...(c.config ?? {}) });
        setCalWidth(c.widthMm != null ? String(c.widthMm) : '');
        setCalHeight(c.heightMm != null ? String(c.heightMm) : '');
        await refreshLinkedNests(row.id);
    };

    // Auto-load when arriving via the nester's "Open job" link (?id=).
    useEffect(() => {
        if (initialLoadId) void openJob(initialLoadId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [initialLoadId]);

    const clear = () => {
        setLoaded(null);
        setError(null);
        setJobId(null);
        setJobName('');
        setCalWidth('');
        setCalHeight('');
        setLinkedNests([]);
        setCfg(DEFAULT_RETURNS_CONFIG);
        if (fileRef.current) fileRef.current.value = '';
    };

    const parsedW = parseFloat(calWidth);
    const parsedH = parseFloat(calHeight);
    const rawW = loaded ? Math.max(1, loaded.bbox.maxX - loaded.bbox.minX) : 1;
    const rawH = loaded ? Math.max(1, loaded.bbox.maxY - loaded.bbox.minY) : 1;
    const scale =
        parsedW > 0 ? parsedW / rawW : parsedH > 0 ? parsedH / rawH : 1;

    const { analysis, bbox } = useMemo((): {
        analysis: ReturnsAnalysis | null;
        bbox: Bbox | null;
    } => {
        if (!loaded) return { analysis: null, bbox: null };
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
            analysis: analyzeReturns(paths, cfg),
            bbox: {
                minX: loaded.bbox.minX * scale,
                minY: loaded.bbox.minY * scale,
                maxX: loaded.bbox.maxX * scale,
                maxY: loaded.bbox.maxY * scale,
            },
        };
    }, [loaded, scale, cfg]);

    const doSave = async (): Promise<string | null> => {
        if (!loaded) return null;
        const name = jobName.trim() || loaded.name;
        setSaveBusy(true);
        setError(null);
        try {
            const res = await saveReturnJob({
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
            await refreshLinkedNests(res.data.id);
            return res.data.id;
        } finally {
            setSaveBusy(false);
        }
    };

    const onDelete = async (id: string) => {
        const res = await deleteReturnJob(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        if (id === jobId) setJobId(null);
        await refreshJobs();
    };

    const onSendToNester = async () => {
        if (!loaded || !analysis || analysis.contours.length === 0) return;
        setSendBusy(true);
        setError(null);
        try {
            // The nest references the job, so it must be saved first (this also
            // persists the latest config + SVG).
            const id = await doSave();
            if (!id) return;
            const combinedSvg = buildReturnsNestSvg({
                analysis,
                returnDepthMm: cfg.returnDepthMm,
                title: jobName.trim() || loaded.name,
            });
            const res = await sendReturnsToNester({
                jobId: id,
                name: jobName.trim() || loaded.name,
                combinedSvg,
                fileName: loaded.name,
            });
            if (!res.ok) {
                setError(res.error);
                return;
            }
            router.push(`/admin/nesting?open=${res.data.nestId}`);
        } finally {
            setSendBusy(false);
        }
    };

    const onDownloadPdf = async () => {
        if (!loaded || !analysis) return;
        setBusy(true);
        try {
            const blob = await generateReturnsPdfBlob({
                name: jobName.trim() || loaded.name,
                analysis,
                config: cfg,
            });
            download(blob, `${loaded.name}-returns-cut-sheet.pdf`);
        } finally {
            setBusy(false);
        }
    };

    const onDownloadSvg = () => {
        if (!loaded || !analysis) return;
        const svg = buildReturnsNestSvg({
            analysis,
            returnDepthMm: cfg.returnDepthMm,
            title: jobName.trim() || loaded.name,
        });
        download(
            new Blob([svg], { type: 'image/svg+xml' }),
            `${loaded.name}-faces-and-returns.svg`,
        );
    };

    const w = bbox ? Math.max(1, bbox.maxX - bbox.minX) : 1;
    const h = bbox ? Math.max(1, bbox.maxY - bbox.minY) : 1;
    const span = Math.max(w, h);
    const stroke = span / 320;
    const balloonR = span / 46;
    const weldR = Math.max(stroke * 1.2, span / 240);

    const setNum =
        (key: keyof ReturnsConfig, min = 0) =>
        (v: string) => {
            const n = parseFloat(v);
            setCfg((c) => ({
                ...c,
                [key]: Number.isFinite(n) && n >= min ? n : c[key],
            }));
        };

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
                            <Hammer size={18} style={{ color: ACCENT }} /> Built-up
                            returns tool
                        </h1>
                        <p className="hidden sm:block text-xs text-neutral-500">
                            Upload letters → measure faces &amp; return strips →
                            cut sheet + send faces &amp; returns to the nester
                        </p>
                    </div>
                </div>
                {loaded && (
                    <div className="flex flex-wrap items-center gap-2">
                        <input
                            type="text"
                            value={jobName}
                            onChange={(e) => setJobName(e.target.value)}
                            placeholder="Job name"
                            className="w-36 rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:border-[#4e7e8c] focus:outline-none"
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
                            className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                        >
                            <FileText size={14} />
                            {busy ? 'Building…' : 'Cut sheet PDF'}
                        </button>
                        <button
                            type="button"
                            onClick={onSendToNester}
                            disabled={sendBusy || saveBusy}
                            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                            style={{ background: ACCENT }}
                        >
                            <Send size={14} />
                            {sendBusy ? 'Sending…' : 'Send to nester'}
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

            <div className="flex flex-1 min-h-0 gap-3">
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
                                Drop a letters SVG here, or click to choose
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
                ) : (
                    <>
                        {/* Annotated preview */}
                        <div className="flex-1 min-w-0 overflow-hidden rounded-xl border border-neutral-200 bg-white p-3">
                            <svg
                                viewBox={`${bbox!.minX} ${bbox!.minY} ${w} ${h}`}
                                className="h-full w-full"
                                preserveAspectRatio="xMidYMid meet"
                            >
                                {analysis!.contours.map((c) => {
                                    const d =
                                        c.points
                                            .map(
                                                (p, i) =>
                                                    `${i === 0 ? 'M' : 'L'}${p[0]} ${p[1]}`,
                                            )
                                            .join(' ') + (c.closed ? ' Z' : '');
                                    return (
                                        <path
                                            key={`p${c.index}`}
                                            d={d}
                                            fill="none"
                                            stroke={ACCENT}
                                            strokeWidth={stroke}
                                            strokeLinejoin="round"
                                            strokeLinecap="round"
                                        />
                                    );
                                })}
                                {/* Weld points */}
                                {analysis!.contours.flatMap((c) =>
                                    c.weldPoints.map((wp, i) => (
                                        <circle
                                            key={`w${c.index}-${i}`}
                                            cx={wp[0]}
                                            cy={wp[1]}
                                            r={weldR}
                                            fill={WELD}
                                        />
                                    )),
                                )}
                                {/* Contour index balloons */}
                                {analysis!.contours.map((c) => (
                                    <g key={`b${c.index}`}>
                                        <circle
                                            cx={c.centroid[0]}
                                            cy={c.centroid[1]}
                                            r={balloonR}
                                            fill={ACCENT}
                                        />
                                        <text
                                            x={c.centroid[0]}
                                            y={c.centroid[1] + balloonR * 0.36}
                                            fontSize={balloonR * 1.1}
                                            fontWeight="bold"
                                            fill="#fff"
                                            textAnchor="middle"
                                        >
                                            {c.index}
                                        </text>
                                    </g>
                                ))}
                            </svg>
                        </div>

                        {/* Right column: config + totals + table */}
                        <div className="flex w-80 shrink-0 flex-col gap-3 overflow-y-auto">
                            {/* Totals */}
                            <div
                                className="shrink-0 rounded-xl px-4 py-3 text-white"
                                style={{ background: ACCENT }}
                            >
                                <p className="text-[10px] font-semibold uppercase tracking-widest opacity-90">
                                    Total return strip
                                </p>
                                <p className="text-2xl font-bold tabular-nums">
                                    {formatM(analysis!.totalReturnLengthMm)}
                                </p>
                                <p className="text-xs opacity-90">
                                    {formatMm(analysis!.totalReturnLengthMm)} ·{' '}
                                    {analysis!.faceCount} face
                                    {analysis!.faceCount === 1 ? '' : 's'}
                                </p>
                                <p className="mt-1.5 flex items-center gap-3 text-xs opacity-90">
                                    <span>{analysis!.stripCount} strips</span>
                                    <span>{analysis!.weldCount} welds</span>
                                </p>
                            </div>

                            {/* Config */}
                            <div className="shrink-0 rounded-xl border border-neutral-200 bg-white p-3">
                                <h3 className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                    <Layers size={12} /> Returns spec
                                </h3>
                                <div className="grid grid-cols-2 gap-2">
                                    <NumField
                                        label="Return depth (mm)"
                                        value={cfg.returnDepthMm}
                                        step={1}
                                        onChange={setNum('returnDepthMm', 0.1)}
                                    />
                                    <NumField
                                        label="Gauge (mm)"
                                        value={cfg.materialThicknessMm}
                                        step={0.1}
                                        onChange={setNum('materialThicknessMm')}
                                    />
                                    <NumField
                                        label="Stock length (mm)"
                                        value={cfg.stockLengthMm}
                                        step={50}
                                        onChange={setNum('stockLengthMm', 1)}
                                    />
                                    <label className="block">
                                        <span className="flex items-center justify-between text-[10px] text-neutral-500">
                                            <span>Break angle</span>
                                            <span className="tabular-nums">
                                                {cfg.breakAngleDeg}°
                                            </span>
                                        </span>
                                        <input
                                            type="range"
                                            min={5}
                                            max={90}
                                            step={1}
                                            value={cfg.breakAngleDeg}
                                            onChange={(e) =>
                                                setCfg((c) => ({
                                                    ...c,
                                                    breakAngleDeg: parseInt(
                                                        e.target.value,
                                                        10,
                                                    ),
                                                }))
                                            }
                                            className="mt-2 w-full accent-[#4e7e8c]"
                                        />
                                    </label>
                                </div>
                                <p className="mt-1.5 text-[10px] text-neutral-400">
                                    A corner sharper than the break angle starts a
                                    new welded strip; runs over the stock length
                                    get a butt-weld.
                                </p>
                            </div>

                            {/* Linked nests */}
                            {linkedNests.length > 0 && (
                                <div className="shrink-0 rounded-xl border border-[#b8d0d8] bg-[#e8f0f3] p-3">
                                    <h3 className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#3a5f6a]">
                                        Nested here
                                    </h3>
                                    <ul className="space-y-1">
                                        {linkedNests.map((n) => (
                                            <li key={n.id}>
                                                <Link
                                                    href={`/admin/nesting?open=${n.id}`}
                                                    className="flex items-center gap-1.5 text-xs font-medium text-[#3a5f6a] hover:underline"
                                                >
                                                    <ExternalLink size={12} />
                                                    <span className="truncate">
                                                        {n.name}
                                                    </span>
                                                </Link>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}

                            {/* Contour table */}
                            <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-neutral-200 bg-white">
                                <div className="overflow-y-auto">
                                    <table className="w-full text-sm">
                                        <thead className="sticky top-0 bg-neutral-50 text-[10px] uppercase tracking-wide text-neutral-500">
                                            <tr>
                                                <th className="px-2 py-2 text-left font-semibold">
                                                    #
                                                </th>
                                                <th className="px-2 py-2 text-left font-semibold">
                                                    Type
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    Length
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    Str
                                                </th>
                                                <th className="px-2 py-2 text-right font-semibold">
                                                    Wld
                                                </th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {analysis!.contours.map((c) => (
                                                <tr
                                                    key={c.index}
                                                    className="border-t border-neutral-100"
                                                >
                                                    <td className="px-2 py-1.5">
                                                        <span
                                                            className="inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                                                            style={{
                                                                background: ACCENT,
                                                            }}
                                                        >
                                                            {c.index}
                                                        </span>
                                                    </td>
                                                    <td className="px-2 py-1.5 text-neutral-500">
                                                        {c.kind === 'counter'
                                                            ? 'counter'
                                                            : 'face'}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-700">
                                                        {Math.round(
                                                            c.perimeterMm,
                                                        ).toLocaleString('en-GB')}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">
                                                        {c.strips.length}
                                                    </td>
                                                    <td className="px-2 py-1.5 text-right tabular-nums text-neutral-500">
                                                        {c.weldCount}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={onDownloadSvg}
                                className="shrink-0 flex items-center justify-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                            >
                                <Download size={14} /> Combined SVG (faces +
                                returns)
                            </button>
                        </div>
                    </>
                )}

                {/* Saved jobs rail */}
                <aside className="hidden md:flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    <div className="shrink-0 flex items-center gap-1.5 border-b border-neutral-100 px-3 py-2.5">
                        <Bookmark size={14} className="text-neutral-400" />
                        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                            Saved return jobs
                        </h2>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {jobs.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-neutral-400">
                                No saved jobs yet. Load an SVG and hit Save.
                            </p>
                        ) : (
                            <ul className="divide-y divide-neutral-100">
                                {jobs.map((j) => (
                                    <li
                                        key={j.id}
                                        className={`group flex items-center gap-2 px-3 py-2 ${
                                            j.id === jobId
                                                ? 'bg-[#e8f0f3]'
                                                : 'hover:bg-neutral-50'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => void openJob(j.id)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <span className="block truncate text-xs font-medium text-neutral-800">
                                                {j.name}
                                            </span>
                                            <span className="block text-[10px] text-neutral-400">
                                                {new Date(
                                                    j.updated_at,
                                                ).toLocaleDateString('en-GB')}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => void onDelete(j.id)}
                                            aria-label={`Delete ${j.name}`}
                                            className="shrink-0 rounded p-1 text-neutral-300 hover:bg-red-50 hover:text-red-500"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </aside>
            </div>
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
