'use client';

// app/design/BuiltUpModal.tsx
//
// Premium built-up lettering builder for the public studio. Reuses the SAME
// engine as the staff built-up returns tool (`analyzeReturns` + `groupReturnFaces`
// + `ReturnsScene`), so the spec a customer builds here is exactly what
// production fabricates from after the quote. The customer uploads outlined
// lettering, sets the build-up depth + metal finish, sees a live 3D preview and
// a fabrication take-off, then confirms — the host places it on the panel and
// records the full spec in the enquiry (Phase 1: SVG upload; type-text + font is
// a planned follow-up).

import { useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { Sparkles, Upload, X } from 'lucide-react';
import { importSvg } from '@/lib/visualiser/svg-import';
import {
    analyzeReturns,
    groupReturnFaces,
    DEFAULT_RETURNS_CONFIG,
    type ReturnsConfig,
} from '@/lib/visualiser/returns';
import {
    FACE_FINISHES,
    DEFAULT_FACE_FINISH,
    type FaceFinish,
} from '@/lib/visualiser/returns-finish';
import type { FlatPath } from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';

const ReturnsScene = dynamic(
    () => import('../(portal)/admin/visualiser/returns/ReturnsScene'),
    {
        ssr: false,
        loading: () => (
            <div className="flex h-full items-center justify-center bg-[#eef1f3] text-xs text-neutral-400">
                Rendering…
            </div>
        ),
    },
);

export interface BuiltUpResult {
    svgText: string;
    name: string;
    finish: FaceFinish;
    config: ReturnsConfig;
    realHeightMm?: number;
    totalReturnLengthMm: number;
    weldCount: number;
    faceCount: number;
}

function scalePaths(paths: FlatPath[], k: number): FlatPath[] {
    if (k === 1) return paths;
    return paths.map((p) => ({
        ...p,
        points: p.points.map(
            ([x, y]) => [x * k, y * k] as [number, number],
        ),
    }));
}

export function BuiltUpModal({
    open,
    onClose,
    onConfirm,
}: {
    open: boolean;
    onClose: () => void;
    onConfirm: (r: BuiltUpResult) => void;
}) {
    const fileRef = useRef<HTMLInputElement>(null);
    const [svgText, setSvgText] = useState<string | null>(null);
    const [name, setName] = useState('Built-up lettering');
    const [imported, setImported] = useState<{
        paths: FlatPath[];
        wMm: number;
        hMm: number;
    } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [realHeight, setRealHeight] = useState('');
    const [depth, setDepth] = useState(DEFAULT_RETURNS_CONFIG.returnDepthMm);
    const [finish, setFinish] = useState<FaceFinish>(DEFAULT_FACE_FINISH);

    const handleFile = async (file: File) => {
        setError(null);
        try {
            const text = await file.text();
            const res = importSvg(text);
            if (res.paths.length === 0) {
                setError('No usable outlined letters found in that SVG.');
                return;
            }
            setSvgText(text);
            setImported({
                paths: res.paths,
                wMm: res.bbox.w,
                hMm: res.bbox.h,
            });
            setName(file.name.replace(/\.svg$/i, '') || 'Built-up lettering');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read SVG');
        }
    };

    const realHeightNum = parseFloat(realHeight);
    const k =
        imported && Number.isFinite(realHeightNum) && realHeightNum > 0 && imported.hMm > 0
            ? realHeightNum / imported.hMm
            : 1;

    const cfg: ReturnsConfig = useMemo(
        () => ({ ...DEFAULT_RETURNS_CONFIG, returnDepthMm: depth }),
        [depth],
    );

    // The returns take-off + face groups, from the (calibrated) paths — the
    // same pipeline the staff tool runs.
    const analysis = useMemo(() => {
        if (!imported) return null;
        return analyzeReturns(scalePaths(imported.paths, k), cfg);
    }, [imported, k, cfg]);
    const groups = useMemo(
        () => (analysis ? groupReturnFaces(analysis) : []),
        [analysis],
    );

    if (!open) return null;

    const confirm = () => {
        if (!svgText || !analysis) return;
        onConfirm({
            svgText,
            name: name.trim() || 'Built-up lettering',
            finish,
            config: cfg,
            realHeightMm: k !== 1 ? realHeightNum : undefined,
            totalReturnLengthMm: analysis.totalReturnLengthMm,
            weldCount: analysis.weldCount,
            faceCount: analysis.faceCount,
        });
    };

    const metres = analysis
        ? (analysis.totalReturnLengthMm / 1000).toFixed(2)
        : '0.00';

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 md:p-5">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-sm" onClick={onClose} aria-hidden />
            <div className="relative z-10 flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
                    <div className="flex items-center gap-2">
                        <span
                            className="flex h-7 w-7 items-center justify-center rounded-full text-white"
                            style={{ background: ACCENT }}
                        >
                            <Sparkles size={14} aria-hidden />
                        </span>
                        <div>
                            <h2 className="text-sm font-bold text-neutral-900">
                                Built-up lettering
                                <span
                                    className="ml-2 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide"
                                    style={{ background: '#e8f0f3', color: '#3a5f6a' }}
                                >
                                    Premium
                                </span>
                            </h2>
                            <p className="text-[11px] text-neutral-500">
                                Fabricated metal letters with real depth.
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex h-8 w-8 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    >
                        <X size={18} aria-hidden />
                    </button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    {!imported ? (
                        /* Upload step */
                        <div className="space-y-3 p-5">
                            <button
                                type="button"
                                onClick={() => fileRef.current?.click()}
                                className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-10 text-neutral-400 hover:border-[#4e7e8c] hover:text-[#3a5f6a]"
                            >
                                <Upload size={22} aria-hidden />
                                <span className="text-sm font-medium">
                                    Upload your lettering (outlined SVG)
                                </span>
                                <span className="text-[11px]">
                                    Letters converted to outlines — most logo /
                                    sign artwork works.
                                </span>
                            </button>
                            {error && (
                                <p className="text-xs text-red-600">{error}</p>
                            )}
                            <p className="text-center text-[11px] text-neutral-400">
                                Prefer to type your words and pick a font?
                                That&apos;s coming soon — for now, upload
                                artwork.
                            </p>
                        </div>
                    ) : (
                        /* Build step */
                        <div className="grid gap-0 md:grid-cols-[1fr_18rem]">
                            <div className="h-56 border-b border-neutral-200 bg-[#eef1f3] md:h-auto md:border-b-0 md:border-r">
                                {analysis && (
                                    <ReturnsScene
                                        groups={groups}
                                        bbox={analysis.bbox}
                                        returnDepthMm={depth}
                                        finish={finish}
                                    />
                                )}
                            </div>
                            <div className="space-y-4 p-4">
                                <label className="block">
                                    <span className="text-[11px] font-medium text-neutral-600">
                                        Real height of the letters (mm)
                                    </span>
                                    <input
                                        type="number"
                                        inputMode="decimal"
                                        value={realHeight}
                                        onChange={(e) => setRealHeight(e.target.value)}
                                        placeholder={`${Math.round(imported.hMm)} (as drawn)`}
                                        className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-[#4e7e8c] focus:outline-none"
                                    />
                                    <span className="mt-0.5 block text-[10px] text-neutral-400">
                                        So we quote the right amount of metal.
                                    </span>
                                </label>

                                <label className="block">
                                    <span className="flex items-baseline justify-between text-[11px] font-medium text-neutral-600">
                                        Build-up depth
                                        <span className="tabular-nums text-neutral-400">
                                            {depth} mm
                                        </span>
                                    </span>
                                    <input
                                        type="range"
                                        min={20}
                                        max={120}
                                        step={5}
                                        value={depth}
                                        onChange={(e) => setDepth(Number(e.target.value))}
                                        className="mt-1.5 w-full"
                                        style={{ accentColor: ACCENT }}
                                    />
                                </label>

                                <div>
                                    <span className="text-[11px] font-medium text-neutral-600">
                                        Finish
                                    </span>
                                    <div className="mt-1.5 grid grid-cols-3 gap-1">
                                        {FACE_FINISHES.map((f) => {
                                            const active = finish === f.id;
                                            return (
                                                <button
                                                    key={f.id}
                                                    type="button"
                                                    onClick={() => setFinish(f.id)}
                                                    aria-pressed={active}
                                                    className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[10px] font-medium transition-colors ${
                                                        active
                                                            ? 'border-[#4e7e8c] text-[#3a5f6a]'
                                                            : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                                                    }`}
                                                >
                                                    <span
                                                        className="h-5 w-5 rounded-full border border-black/10"
                                                        style={{ background: f.face }}
                                                    />
                                                    {f.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Fabrication take-off — the same numbers the
                                    cut-sheet carries. */}
                                {analysis && (
                                    <dl className="space-y-1 rounded-lg bg-neutral-50 px-3 py-2.5 text-[11px]">
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-neutral-500">
                                                Letters
                                            </dt>
                                            <dd className="font-medium tabular-nums text-neutral-800">
                                                {analysis.faceCount}
                                            </dd>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-neutral-500">
                                                Return to form
                                            </dt>
                                            <dd className="font-medium tabular-nums text-neutral-800">
                                                {metres} m
                                            </dd>
                                        </div>
                                        <div className="flex justify-between gap-2">
                                            <dt className="text-neutral-500">
                                                Welds
                                            </dt>
                                            <dd className="font-medium tabular-nums text-neutral-800">
                                                {analysis.weldCount}
                                            </dd>
                                        </div>
                                    </dl>
                                )}
                                <button
                                    type="button"
                                    onClick={() => {
                                        setImported(null);
                                        setSvgText(null);
                                    }}
                                    className="text-[11px] font-medium text-neutral-400 hover:text-neutral-600"
                                >
                                    Upload different artwork
                                </button>
                            </div>
                        </div>
                    )}
                </div>

                <input
                    ref={fileRef}
                    type="file"
                    accept=".svg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFile(f);
                        e.target.value = '';
                    }}
                />

                {/* Footer */}
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-[40px] rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!imported || !analysis}
                        className="flex min-h-[40px] items-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: ACCENT }}
                    >
                        Add to my sign
                    </button>
                </div>
            </div>
        </div>
    );
}
