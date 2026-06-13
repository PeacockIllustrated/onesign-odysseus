'use client';

// app/design/BuiltUpModal.tsx
//
// Premium built-up lettering builder for the public studio. Reuses the SAME
// engine as the staff built-up returns tool (`analyzeReturns` + `groupReturnFaces`
// + `ReturnsScene`), so the spec a customer builds here is exactly what
// production fabricates from after the quote.
//
// Two ways in (Phase 2):
//   • Type text + pick a Google font (or upload a font file) — converted to
//     exact glyph outlines with opentype.js.
//   • Upload outlined lettering (SVG).
// Either way it flows through the same depth / finish / preview / take-off and,
// on confirm, the host places it on the panel and records the full spec.

import { useEffect, useMemo, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import * as opentype from 'opentype.js';
import { Loader2, Sparkles, Type, Upload, X } from 'lucide-react';
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

/** A small, signage-friendly curated set; each carries its available weights. */
const GOOGLE_FONTS: { label: string; slug: string; weights: number[] }[] = [
    { label: 'Anton', slug: 'anton', weights: [400] },
    { label: 'Archivo Black', slug: 'archivo-black', weights: [400] },
    { label: 'Bebas Neue', slug: 'bebas-neue', weights: [400] },
    { label: 'Oswald', slug: 'oswald', weights: [400, 700] },
    { label: 'Montserrat', slug: 'montserrat', weights: [400, 700] },
    { label: 'Poppins', slug: 'poppins', weights: [400, 700] },
    { label: 'Roboto', slug: 'roboto', weights: [400, 700] },
    { label: 'Raleway', slug: 'raleway', weights: [400, 700] },
    { label: 'Playfair Display', slug: 'playfair-display', weights: [400, 700] },
    { label: 'Pacifico', slug: 'pacifico', weights: [400] },
    { label: 'Lobster', slug: 'lobster', weights: [400] },
];

/** Heaviest weight available for a font (built-up letters read better bold). */
function defaultWeight(slug: string): number {
    const f = GOOGLE_FONTS.find((g) => g.slug === slug);
    return f && f.weights.includes(700) ? 700 : 400;
}

/** Fetch a Google font as TTF (keyless, via the Fontsource CDN) and parse it. */
async function loadGoogleFont(
    slug: string,
    weight: number,
): Promise<opentype.Font> {
    const url = `https://cdn.jsdelivr.net/fontsource/fonts/${slug}@latest/latin-${weight}-normal.ttf`;
    const res = await fetch(url);
    if (!res.ok)
        throw new Error('Could not load that font — try another, or upload a file.');
    return opentype.parse(await res.arrayBuffer());
}

/** Typed text → an SVG of exact glyph outlines (one compound path). */
function textToSvg(font: opentype.Font, text: string): string | null {
    const size = 300;
    const path = font.getPath(text, 0, 0, size);
    const bb = path.getBoundingBox();
    const w = bb.x2 - bb.x1;
    const h = bb.y2 - bb.y1;
    if (!(w > 0.5 && h > 0.5)) return null;
    const d = path.toPathData(2);
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${bb.x1.toFixed(
        2,
    )} ${bb.y1.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)}"><path d="${d}" fill="#000000"/></svg>`;
}

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

interface Built {
    svgText: string;
    paths: FlatPath[];
    wMm: number;
    hMm: number;
}

function scalePaths(paths: FlatPath[], k: number): FlatPath[] {
    if (k === 1) return paths;
    return paths.map((p) => ({
        ...p,
        points: p.points.map(([x, y]) => [x * k, y * k] as [number, number]),
    }));
}

type Mode = 'text' | 'upload';

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
    const fontFileRef = useRef<HTMLInputElement>(null);

    const [mode, setMode] = useState<Mode>('text');

    // Text mode
    const [text, setText] = useState('OPEN');
    const [fontSource, setFontSource] = useState<'google' | 'file'>('google');
    const [googleSlug, setGoogleSlug] = useState('oswald');
    const [weight, setWeight] = useState(defaultWeight('oswald'));
    const [font, setFont] = useState<opentype.Font | null>(null);
    const [fontBusy, setFontBusy] = useState(true);
    const [fontErr, setFontErr] = useState<string | null>(null);
    const [fontFileName, setFontFileName] = useState<string | null>(null);

    // Upload-SVG mode
    const [uploaded, setUploaded] = useState<Built | null>(null);
    const [uploadName, setUploadName] = useState('Built-up lettering');
    const [error, setError] = useState<string | null>(null);

    // Shared build spec
    const [realHeight, setRealHeight] = useState('');
    const [depth, setDepth] = useState(DEFAULT_RETURNS_CONFIG.returnDepthMm);
    const [finish, setFinish] = useState<FaceFinish>(DEFAULT_FACE_FINISH);

    // Load a Google font whenever the selection changes. Sync state is set in
    // the change handlers / initial state; the effect only resolves in async
    // callbacks (no synchronous setState in the effect body).
    useEffect(() => {
        if (mode !== 'text' || fontSource !== 'google') return;
        let cancelled = false;
        loadGoogleFont(googleSlug, weight)
            .then((f) => {
                if (!cancelled) {
                    setFont(f);
                    setFontErr(null);
                    setFontBusy(false);
                }
            })
            .catch((e: Error) => {
                if (!cancelled) {
                    setFont(null);
                    setFontErr(e.message);
                    setFontBusy(false);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [mode, fontSource, googleSlug, weight]);

    // Typed text → outlines → imported paths. Pure (no setState), so it can be
    // a memo that re-derives whenever the font or text changes.
    const generated = useMemo<Built | null>(() => {
        if (mode !== 'text' || !font || !text.trim()) return null;
        try {
            const svg = textToSvg(font, text.trim());
            if (!svg) return null;
            const res = importSvg(svg);
            return {
                svgText: svg,
                paths: res.paths,
                wMm: res.bbox.w,
                hMm: res.bbox.h,
            };
        } catch {
            return null;
        }
    }, [mode, font, text]);

    const active: Built | null = mode === 'text' ? generated : uploaded;

    const selectGoogle = (slug: string) => {
        setGoogleSlug(slug);
        setWeight(defaultWeight(slug));
        setFontBusy(true);
        setFontErr(null);
    };
    const selectWeight = (w: number) => {
        setWeight(w);
        setFontBusy(true);
        setFontErr(null);
    };

    const handleFontFile = async (file: File) => {
        setFontErr(null);
        setFontBusy(true);
        try {
            const f = opentype.parse(await file.arrayBuffer());
            setFont(f);
            setFontFileName(file.name);
            setFontBusy(false);
        } catch {
            setFont(null);
            setFontBusy(false);
            setFontErr('That font file could not be read (use TTF / OTF).');
        }
    };

    const handleSvgFile = async (file: File) => {
        setError(null);
        try {
            const txt = await file.text();
            const res = importSvg(txt);
            if (res.paths.length === 0) {
                setError('No usable outlined letters found in that SVG.');
                return;
            }
            setUploaded({
                svgText: txt,
                paths: res.paths,
                wMm: res.bbox.w,
                hMm: res.bbox.h,
            });
            setUploadName(file.name.replace(/\.svg$/i, '') || 'Built-up lettering');
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read SVG');
        }
    };

    const realHeightNum = parseFloat(realHeight);
    const k =
        active &&
        Number.isFinite(realHeightNum) &&
        realHeightNum > 0 &&
        active.hMm > 0
            ? realHeightNum / active.hMm
            : 1;

    const cfg: ReturnsConfig = useMemo(
        () => ({ ...DEFAULT_RETURNS_CONFIG, returnDepthMm: depth }),
        [depth],
    );
    const analysis = useMemo(
        () => (active ? analyzeReturns(scalePaths(active.paths, k), cfg) : null),
        [active, k, cfg],
    );
    const groups = useMemo(
        () => (analysis ? groupReturnFaces(analysis) : []),
        [analysis],
    );

    if (!open) return null;

    const metres = analysis
        ? (analysis.totalReturnLengthMm / 1000).toFixed(2)
        : '0.00';
    const activeWeights =
        GOOGLE_FONTS.find((g) => g.slug === googleSlug)?.weights ?? [400];

    const confirm = () => {
        if (!active || !analysis) return;
        const name =
            (mode === 'text' ? text.trim() : uploadName) || 'Built-up lettering';
        onConfirm({
            svgText: active.svgText,
            name,
            finish,
            config: cfg,
            realHeightMm: k !== 1 ? realHeightNum : undefined,
            totalReturnLengthMm: analysis.totalReturnLengthMm,
            weldCount: analysis.weldCount,
            faceCount: analysis.faceCount,
        });
    };

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
                    {/* Mode toggle */}
                    <div className="flex gap-1 px-5 pt-4">
                        {(
                            [
                                ['text', 'Type text', Type],
                                ['upload', 'Upload artwork', Upload],
                            ] as const
                        ).map(([m, label, Icon]) => {
                            const on = mode === m;
                            return (
                                <button
                                    key={m}
                                    type="button"
                                    onClick={() => setMode(m)}
                                    aria-pressed={on}
                                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md border px-3 py-2 text-[12px] font-medium transition-colors ${
                                        on
                                            ? 'border-[#4e7e8c] text-white'
                                            : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                                    }`}
                                    style={on ? { background: ACCENT } : undefined}
                                >
                                    <Icon size={14} aria-hidden />
                                    {label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Input */}
                    {mode === 'text' ? (
                        <div className="space-y-3 px-5 pt-4">
                            <label className="block">
                                <span className="text-[11px] font-medium text-neutral-600">
                                    Your text
                                </span>
                                <input
                                    type="text"
                                    value={text}
                                    onChange={(e) => setText(e.target.value)}
                                    placeholder="e.g. THE OAK"
                                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-2 text-lg focus:border-[#4e7e8c] focus:outline-none"
                                />
                            </label>

                            <div className="flex gap-1">
                                {(
                                    [
                                        ['google', 'Google font'],
                                        ['file', 'Upload a font'],
                                    ] as const
                                ).map(([s, label]) => (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => {
                                            setFontSource(s);
                                            if (s === 'google') {
                                                setFontBusy(true);
                                                setFontErr(null);
                                            }
                                        }}
                                        aria-pressed={fontSource === s}
                                        className={`flex-1 rounded-md border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                            fontSource === s
                                                ? 'border-[#4e7e8c] bg-[#e8f0f3] text-[#3a5f6a]'
                                                : 'border-neutral-200 text-neutral-500 hover:bg-neutral-50'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>

                            {fontSource === 'google' ? (
                                <div className="flex gap-2">
                                    <select
                                        value={googleSlug}
                                        onChange={(e) => selectGoogle(e.target.value)}
                                        className="flex-1 rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-[#4e7e8c] focus:outline-none"
                                    >
                                        {GOOGLE_FONTS.map((g) => (
                                            <option key={g.slug} value={g.slug}>
                                                {g.label}
                                            </option>
                                        ))}
                                    </select>
                                    {activeWeights.includes(700) && (
                                        <div className="flex overflow-hidden rounded-md border border-neutral-300 text-[11px] font-medium">
                                            {[400, 700].map((w) => (
                                                <button
                                                    key={w}
                                                    type="button"
                                                    onClick={() => selectWeight(w)}
                                                    aria-pressed={weight === w}
                                                    className={`px-2.5 ${
                                                        weight === w
                                                            ? 'text-white'
                                                            : 'bg-white text-neutral-500'
                                                    }`}
                                                    style={
                                                        weight === w
                                                            ? { background: ACCENT }
                                                            : undefined
                                                    }
                                                >
                                                    {w === 700 ? 'Bold' : 'Regular'}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => fontFileRef.current?.click()}
                                    className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-neutral-300 px-3 py-2 text-[11px] font-medium text-neutral-500 hover:border-[#4e7e8c] hover:text-[#3a5f6a]"
                                >
                                    <Upload size={13} aria-hidden />
                                    {fontFileName ?? 'Upload a font file (TTF / OTF)'}
                                </button>
                            )}

                            {fontBusy && fontSource === 'google' && (
                                <p className="flex items-center gap-1.5 text-[11px] text-neutral-400">
                                    <Loader2 size={12} className="animate-spin" aria-hidden />
                                    Loading font…
                                </p>
                            )}
                            {fontErr && (
                                <p className="text-[11px] text-red-600">{fontErr}</p>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-2 px-5 pt-4">
                            {!uploaded ? (
                                <button
                                    type="button"
                                    onClick={() => fileRef.current?.click()}
                                    className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-neutral-300 px-4 py-8 text-neutral-400 hover:border-[#4e7e8c] hover:text-[#3a5f6a]"
                                >
                                    <Upload size={20} aria-hidden />
                                    <span className="text-sm font-medium">
                                        Upload your lettering (outlined SVG)
                                    </span>
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    onClick={() => setUploaded(null)}
                                    className="text-[11px] font-medium text-neutral-400 hover:text-neutral-600"
                                >
                                    Upload different artwork
                                </button>
                            )}
                            {error && <p className="text-xs text-red-600">{error}</p>}
                        </div>
                    )}

                    {/* Preview + build spec */}
                    <div className="mt-4 grid gap-0 border-t border-neutral-200 md:grid-cols-[1fr_18rem]">
                        <div className="h-56 bg-[#eef1f3] md:h-auto md:border-r md:border-neutral-200">
                            {active && analysis ? (
                                <ReturnsScene
                                    groups={groups}
                                    bbox={analysis.bbox}
                                    returnDepthMm={depth}
                                    finish={finish}
                                />
                            ) : (
                                <div className="flex h-full items-center justify-center px-6 text-center text-[12px] text-neutral-400">
                                    {mode === 'text'
                                        ? 'Type your words and pick a font to preview.'
                                        : 'Upload outlined lettering to preview.'}
                                </div>
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
                                    placeholder={active ? `${Math.round(active.hMm)} (as drawn)` : '—'}
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
                                        const on = finish === f.id;
                                        return (
                                            <button
                                                key={f.id}
                                                type="button"
                                                onClick={() => setFinish(f.id)}
                                                aria-pressed={on}
                                                className={`flex flex-col items-center gap-1 rounded-md border px-1 py-1.5 text-[10px] font-medium transition-colors ${
                                                    on
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

                            {analysis && (
                                <dl className="space-y-1 rounded-lg bg-neutral-50 px-3 py-2.5 text-[11px]">
                                    <div className="flex justify-between gap-2">
                                        <dt className="text-neutral-500">Letters</dt>
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
                                        <dt className="text-neutral-500">Welds</dt>
                                        <dd className="font-medium tabular-nums text-neutral-800">
                                            {analysis.weldCount}
                                        </dd>
                                    </div>
                                </dl>
                            )}
                        </div>
                    </div>
                </div>

                <input
                    ref={fileRef}
                    type="file"
                    accept=".svg,image/svg+xml"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleSvgFile(f);
                        e.target.value = '';
                    }}
                />
                <input
                    ref={fontFileRef}
                    type="file"
                    accept=".ttf,.otf,font/ttf,font/otf"
                    className="hidden"
                    onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void handleFontFile(f);
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
                        disabled={!active || !analysis}
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
