'use client';

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import {
    ArrowLeft,
    Bookmark,
    Download,
    Ruler,
    Save,
    Sparkles,
    Trash2,
    Upload,
    X,
    Zap,
} from 'lucide-react';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    measureNeon,
    totalLengthMm,
    formatMm,
    formatM,
    transformerCount,
    CABLE_SIDES,
    DEFAULT_METRES_PER_TRANSFORMER,
    type NeonElement,
    type CableSide,
} from '@/lib/visualiser/neon';
import { generateNeonPdfBlob } from '@/lib/visualiser/neon-pdf';
import {
    listNeonDesigns,
    saveNeonDesign,
    deleteNeonDesign,
    type NeonDesignRow,
} from '@/lib/visualiser/neon-actions';
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
    /** The raw uploaded SVG text — kept so the design can be saved + reopened. */
    svgText: string;
    /** Raw flattened paths (mm as read from the SVG, before any calibration). */
    paths: FlatPath[];
    /** Raw bounding box, before calibration. */
    bbox: Bbox;
}

export function NeonMeasureClient({
    initialDesigns,
}: {
    initialDesigns: NeonDesignRow[];
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [view, setView] = useState<'measure' | 'glow'>('measure');
    const [boardOn, setBoardOn] = useState(true);
    const [paddingMm, setPaddingMm] = useState(50);
    const [saturation, setSaturation] = useState(1);
    // Saved designs (shared, DB-backed via neon-actions).
    const [designs, setDesigns] = useState<NeonDesignRow[]>(initialDesigns);
    const [designId, setDesignId] = useState<string | null>(null);
    const [designName, setDesignName] = useState('');
    const [saveBusy, setSaveBusy] = useState(false);
    // Manual calibration: the real WIDTH or HEIGHT (mm) of the artwork — enter
    // either one (aspect ratio is fixed, so one dimension sets the scale).
    // Needed because Illustrator often exports without real-world units, which
    // makes the raw geometry read in points, not mm. Captured up front on
    // upload so the very first generation is already to scale.
    const [calWidth, setCalWidth] = useState('');
    const [calHeight, setCalHeight] = useState('');
    // Power: which edge the mains cable enters, and how many metres of neon one
    // transformer carries (drives the transformer count for the manufacturer).
    const [cableSide, setCableSide] = useState<CableSide>('left');
    const [metresPerTransformer, setMetresPerTransformer] = useState(
        DEFAULT_METRES_PER_TRANSFORMER,
    );

    // Import SVG text into the editor. Returns true on success. Optionally
    // tags it with a saved-design id (when reopening a saved record).
    const loadSvgText = (text: string, name: string, id: string | null) => {
        try {
            const imported = importSvg(text);
            if (measureNeon(imported.paths).length === 0) {
                setError(
                    'No measurable paths found in that SVG. Make sure strokes/shapes are expanded to outlines, not images.',
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
            setDesignId(id);
            setDesignName(name);
            // A fresh upload must NOT inherit the previous file's calibration
            // (different artwork, different real size). Reopening a saved design
            // (id set) keeps it — openDesign restores the saved values next.
            if (id === null) {
                setCalWidth('');
                setCalHeight('');
                setView('measure');
                setCableSide('left');
                setMetresPerTransformer(DEFAULT_METRES_PER_TRANSFORMER);
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

    // Reopen a saved design: re-import its SVG + restore the saved settings.
    const openDesign = (row: NeonDesignRow) => {
        setError(null);
        if (!row.svg_source) {
            setError('That saved design has no SVG.');
            return;
        }
        if (!loadSvgText(row.svg_source, row.name, row.id)) return;
        // Coalesce — a row saved before a field existed (params_json is
        // unconstrained JSONB) must not push undefined into the controls
        // (e.g. undefined saturation → NaN → black runs).
        const cfg = row.params_json ?? {};
        setCalWidth(cfg.widthMm != null ? String(cfg.widthMm) : '');
        setCalHeight(cfg.heightMm != null ? String(cfg.heightMm) : '');
        setBoardOn(cfg.backboardEnabled ?? true);
        setPaddingMm(
            typeof cfg.backboardPaddingMm === 'number'
                ? cfg.backboardPaddingMm
                : 50,
        );
        setSaturation(typeof cfg.saturation === 'number' ? cfg.saturation : 1);
        setCableSide(cfg.cableSide ?? 'left');
        setMetresPerTransformer(
            typeof cfg.metresPerTransformer === 'number'
                ? cfg.metresPerTransformer
                : DEFAULT_METRES_PER_TRANSFORMER,
        );
    };

    const refreshDesigns = async () => {
        const res = await listNeonDesigns();
        if (res.ok) setDesigns(res.data);
    };

    const onSave = async () => {
        if (!loaded) return;
        const name = designName.trim() || loaded.name;
        setSaveBusy(true);
        setError(null);
        try {
            const res = await saveNeonDesign({
                id: designId,
                name,
                svgSource: loaded.svgText,
                config: {
                    widthMm: parsedW > 0 ? parsedW : null,
                    heightMm: parsedW > 0 ? null : parsedH > 0 ? parsedH : null,
                    backboardEnabled: boardOn,
                    backboardPaddingMm: paddingMm,
                    saturation,
                    cableSide,
                    metresPerTransformer,
                },
            });
            if (!res.ok) {
                setError(res.error);
                return;
            }
            setDesignId(res.data.id);
            await refreshDesigns();
        } finally {
            setSaveBusy(false);
        }
    };

    const onDeleteDesign = async (id: string) => {
        const res = await deleteNeonDesign(id);
        if (!res.ok) {
            setError(res.error);
            return;
        }
        if (id === designId) setDesignId(null);
        await refreshDesigns();
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
                transformers,
                cableSide,
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
    const transformers = transformerCount(total, metresPerTransformer);
    // Cable-in marker anchor (mm, in bbox space) on the chosen edge midpoint.
    const cableAnchor = bbox
        ? {
              left: [bbox.minX, (bbox.minY + bbox.maxY) / 2],
              right: [bbox.maxX, (bbox.minY + bbox.maxY) / 2],
              top: [(bbox.minX + bbox.maxX) / 2, bbox.minY],
              bottom: [(bbox.minX + bbox.maxX) / 2, bbox.maxY],
          }[cableSide]
        : [0, 0];

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
                        <input
                            type="text"
                            value={designName}
                            onChange={(e) => setDesignName(e.target.value)}
                            placeholder="Design name"
                            className="w-36 rounded-md border border-neutral-300 px-2 py-1.5 text-xs focus:border-[#4e7e8c] focus:outline-none"
                        />
                        <button
                            type="button"
                            onClick={onSave}
                            disabled={saveBusy}
                            className="flex items-center gap-1 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-60"
                        >
                            <Save size={14} />
                            {saveBusy
                                ? 'Saving…'
                                : designId
                                  ? 'Update'
                                  : 'Save'}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setLoaded(null);
                                setError(null);
                                setDesignId(null);
                                setDesignName('');
                                setCalWidth('');
                                setCalHeight('');
                                setView('measure');
                                setCableSide('left');
                                setMetresPerTransformer(
                                    DEFAULT_METRES_PER_TRANSFORMER,
                                );
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

            <div className="flex flex-1 min-h-0 gap-3">
                <div className="flex flex-1 min-h-0 flex-col gap-3">
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

            {loaded && (
                <div className="shrink-0 flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-md border border-[#b8d0d8] bg-[#e8f0f3] px-3 py-1.5 text-xs text-[#3a5f6a]">
                    <span className="flex items-center gap-1.5 font-semibold">
                        <Zap size={13} /> Power
                    </span>
                    <span className="flex items-center gap-1.5">
                        Transformers
                        <span className="rounded px-1.5 py-0.5 font-bold tabular-nums text-white" style={{ background: ACCENT }}>
                            {transformers}
                        </span>
                    </span>
                    <label className="flex items-center gap-1">
                        per
                        <input
                            type="number"
                            inputMode="decimal"
                            min={1}
                            value={metresPerTransformer}
                            onChange={(e) => {
                                const n = parseFloat(e.target.value);
                                setMetresPerTransformer(
                                    Number.isFinite(n) && n > 0
                                        ? n
                                        : DEFAULT_METRES_PER_TRANSFORMER,
                                );
                            }}
                            className="w-14 rounded border border-[#b8d0d8] bg-white px-2 py-0.5 text-right tabular-nums focus:border-[#4e7e8c] focus:outline-none"
                        />
                        m
                    </label>
                    <span className="flex items-center gap-1.5">
                        Cable in
                        <span className="flex rounded-md border border-[#b8d0d8] p-0.5">
                            {CABLE_SIDES.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() => setCableSide(s)}
                                    aria-pressed={cableSide === s}
                                    className={`rounded px-2 py-0.5 text-[11px] font-medium capitalize ${
                                        cableSide === s
                                            ? 'text-white'
                                            : 'text-[#3a5f6a] hover:bg-white'
                                    }`}
                                    style={
                                        cableSide === s
                                            ? { background: ACCENT }
                                            : undefined
                                    }
                                >
                                    {s}
                                </button>
                            ))}
                        </span>
                    </span>
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
                            {/* Cable-in marker on the chosen edge */}
                            <g>
                                <circle
                                    cx={cableAnchor[0]}
                                    cy={cableAnchor[1]}
                                    r={balloonR * 0.9}
                                    fill="#d4661a"
                                />
                                <text
                                    x={cableAnchor[0]}
                                    y={cableAnchor[1] + balloonR * 0.32}
                                    fontSize={balloonR}
                                    fontWeight="bold"
                                    fill="#fff"
                                    textAnchor="middle"
                                >
                                    ⚡
                                </text>
                                <text
                                    x={
                                        cableSide === 'right'
                                            ? cableAnchor[0] - balloonR * 1.4
                                            : cableSide === 'left'
                                              ? cableAnchor[0] + balloonR * 1.4
                                              : cableAnchor[0]
                                    }
                                    y={
                                        cableSide === 'bottom'
                                            ? cableAnchor[1] - balloonR * 1.4
                                            : cableAnchor[1] + balloonR * 1.9
                                    }
                                    fontSize={balloonR * 0.9}
                                    fontWeight="bold"
                                    fill="#d4661a"
                                    textAnchor={
                                        cableSide === 'right'
                                            ? 'end'
                                            : cableSide === 'left'
                                              ? 'start'
                                              : 'middle'
                                    }
                                >
                                    CABLE IN
                                </text>
                            </g>
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
                            <p className="mt-1.5 flex items-center gap-1.5 text-xs opacity-90">
                                <Zap size={12} />
                                {transformers} transformer
                                {transformers === 1 ? '' : 's'} · cable in{' '}
                                {cableSide}
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
                        cableSide={cableSide}
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

                {/* Saved designs rail (DB-backed, shared) */}
                <aside className="hidden md:flex w-56 shrink-0 flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white">
                    <div className="shrink-0 flex items-center gap-1.5 border-b border-neutral-100 px-3 py-2.5">
                        <Bookmark size={14} className="text-neutral-400" />
                        <h2 className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                            Saved neon designs
                        </h2>
                    </div>
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {designs.length === 0 ? (
                            <p className="px-3 py-4 text-xs text-neutral-400">
                                No saved designs yet. Load an SVG and hit Save.
                            </p>
                        ) : (
                            <ul className="divide-y divide-neutral-100">
                                {designs.map((d) => (
                                    <li
                                        key={d.id}
                                        className={`group flex items-center gap-2 px-3 py-2 ${
                                            d.id === designId
                                                ? 'bg-[#e8f0f3]'
                                                : 'hover:bg-neutral-50'
                                        }`}
                                    >
                                        <button
                                            type="button"
                                            onClick={() => openDesign(d)}
                                            className="min-w-0 flex-1 text-left"
                                        >
                                            <span className="block truncate text-xs font-medium text-neutral-800">
                                                {d.name}
                                            </span>
                                            <span className="block text-[10px] text-neutral-400">
                                                {new Date(
                                                    d.updated_at,
                                                ).toLocaleDateString('en-GB')}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => onDeleteDesign(d.id)}
                                            aria-label={`Delete ${d.name}`}
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
