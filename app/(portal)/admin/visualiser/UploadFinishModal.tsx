'use client';

// app/(portal)/admin/visualiser/UploadFinishModal.tsx
//
// PUBLIC-STUDIO upload gate: when a customer drops an SVG on /design, this
// modal asks how the artwork should be made BEFORE it lands on the sign — so
// the first thing they see is their logo already finished the way they chose,
// not a raw cut-out they then have to figure out how to change. Staff never
// see this (their SvgDropzone flow adds the layer immediately).
//
// Colour handling honours the shop's stock: the customer picks the FINISH; the
// artwork's own colours are matched per element to the nearest stock swatch
// (acrylic library for letters, RAL for solid vinyl) via lib/visualiser/
// upload-finish. A single-colour upload gets an editable swatch; multi-colour
// uploads show the per-part matches and can be fine-tuned after adding.

import { useMemo, useState } from 'react';
import { Check, X } from 'lucide-react';
import { SwatchPicker, type SwatchItem } from './SwatchPicker';
import { ACRYLIC_COLOURS, nearestAcrylic } from '@/lib/visualiser/acrylic';
import { RAL_CLASSIC, nearestRal } from '@/lib/visualiser/ral';
import { detectInnerCounters } from '@/lib/visualiser/svg-import';
import {
    ACRYLIC_THICKNESSES_MM,
    clusterByColour,
    matchedStockColour,
    type ColourCluster,
} from '@/lib/visualiser/upload-finish';
import type { ImportedSvg } from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';
const ACCENT_DARK = '#3a5f6a';

const ACRYLIC_ITEMS: SwatchItem[] = ACRYLIC_COLOURS.map((c) => ({
    hex: c.hex,
    label: c.name,
    sublabel: `${c.brand}${c.code ? ' ' + c.code : ''} · ${c.finish}`,
}));
const RAL_ITEMS: SwatchItem[] = RAL_CLASSIC.map((r) => ({
    hex: r.hex,
    label: r.code,
    sublabel: r.name,
}));

const CHECKER: React.CSSProperties = {
    backgroundColor: '#fff',
    backgroundImage:
        'linear-gradient(45deg,#eee 25%,transparent 25%),linear-gradient(-45deg,#eee 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#eee 75%),linear-gradient(-45deg,transparent 75%,#eee 75%)',
    backgroundSize: '12px 12px',
    backgroundPosition: '0 0,0 6px,6px -6px,-6px 0',
};

export type UploadFinishMaterial =
    | 'cut'
    | 'vinyl'
    | 'acrylic'
    | 'standoff'
    | 'pushthrough'
    | 'backlight';

export interface PendingUpload {
    text: string;
    name: string;
    imported: ImportedSvg;
}

export interface UploadFinishChoice {
    material: UploadFinishMaterial;
    /** Vinyl only — full-colour print (true) or single plotter-cut colour. */
    printFullColor?: boolean;
    /** Acrylic-based finishes — one of the stocked sheet thicknesses. */
    thicknessMm?: number;
    /** Single-colour artwork only: the customer picked a specific swatch. */
    colourOverride?: string;
}

const FINISH_OPTIONS: Array<{
    key: UploadFinishMaterial;
    label: string;
    desc: string;
}> = [
    { key: 'standoff', label: 'Raised letters', desc: 'Stood off the face on hidden studs — a premium, dimensional look.' },
    { key: 'cut', label: 'Cut out', desc: 'Cut right through the face of the sign.' },
    { key: 'vinyl', label: 'Printed', desc: 'Printed onto the face — full colour or one flat colour.' },
    { key: 'acrylic', label: 'Acrylic', desc: 'Glossy coloured acrylic stuck onto the face.' },
    { key: 'pushthrough', label: 'Push-through', desc: 'Acrylic letters through the face — glow beautifully when lit.' },
    { key: 'backlight', label: 'Backlit glow', desc: 'Cut out and lit from behind so the shape glows.' },
];

const svgDataUrl = (svg: string) =>
    'data:image/svg+xml;utf8,' + encodeURIComponent(svg);

const isAcrylicBased = (m: UploadFinishMaterial | null) =>
    m === 'acrylic' || m === 'standoff' || m === 'pushthrough';

export function UploadFinishModal({
    upload,
    onCancel,
    onConfirm,
}: {
    upload: PendingUpload;
    onCancel: () => void;
    onConfirm: (choice: UploadFinishChoice) => void;
}) {
    const [material, setMaterial] = useState<UploadFinishMaterial | null>(
        null,
    );
    const [printFullColor, setPrintFullColor] = useState(true);
    const [thicknessMm, setThicknessMm] = useState<number>(5);
    const [colourOverride, setColourOverride] = useState<string | null>(null);

    // Colour clusters over the upload's OUTER shapes (counters follow their
    // parent). Computed on the upload's own import, where per-path colour is
    // still present (composition strips it).
    const clusters = useMemo<ColourCluster[]>(() => {
        const counters = new Set(detectInnerCounters(upload.imported.paths));
        const outer = upload.imported.paths
            .map((_, i) => i)
            .filter((i) => !counters.has(i));
        return clusterByColour(upload.imported.paths, outer);
    }, [upload]);
    const singleColour = clusters.length === 1;

    // The matched stock swatches the current choice would land on.
    const matched = useMemo(() => {
        if (!material || material === 'cut') return [];
        return clusters.map((c) => ({
            from: c.colour,
            to:
                matchedStockColour(material, c.colour, {
                    printFullColor:
                        material === 'vinyl' ? printFullColor : undefined,
                }) ?? c.colour,
            count: c.indices.length,
        }));
    }, [clusters, material, printFullColor]);

    const showColourPicker =
        material !== null &&
        singleColour &&
        (isAcrylicBased(material) ||
            (material === 'vinyl' && !printFullColor));
    const pickerItems = isAcrylicBased(material) ? ACRYLIC_ITEMS : RAL_ITEMS;
    const pickerDefault = singleColour
        ? isAcrylicBased(material)
            ? nearestAcrylic(clusters[0]?.colour ?? '#000000').colour.hex
            : nearestRal(clusters[0]?.colour ?? '#000000').hex
        : null;

    const confirm = () => {
        if (!material) return;
        onConfirm({
            material,
            printFullColor: material === 'vinyl' ? printFullColor : undefined,
            thicknessMm: isAcrylicBased(material) ? thicknessMm : undefined,
            colourOverride:
                showColourPicker && colourOverride ? colourOverride : undefined,
        });
    };

    return (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-3 md:p-5">
            <div
                className="absolute inset-0 bg-black/55 backdrop-blur-sm"
                onClick={onCancel}
                aria-hidden
            />
            <div className="relative z-10 flex max-h-full w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                {/* Header */}
                <div className="flex shrink-0 items-start justify-between gap-3 border-b border-neutral-200 px-5 py-3.5">
                    <div>
                        <h2 className="text-sm font-bold text-neutral-900">
                            How should we make it?
                        </h2>
                        <p className="text-[11px] text-neutral-500">
                            Pick a finish for “{upload.name}” — you can
                            fine-tune everything afterwards.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onCancel}
                        aria-label="Cancel upload"
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-neutral-400 hover:bg-neutral-100 hover:text-neutral-600"
                    >
                        <X size={18} aria-hidden />
                    </button>
                </div>

                <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                    {/* Artwork preview */}
                    <div
                        className="flex items-center justify-center rounded-lg border border-neutral-200 p-2"
                        style={CHECKER}
                    >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                            src={svgDataUrl(upload.text)}
                            alt={upload.name}
                            className="max-h-32 w-auto max-w-full object-contain"
                        />
                    </div>

                    {/* Finish tiles */}
                    <div className="grid grid-cols-2 gap-1.5">
                        {FINISH_OPTIONS.map((o) => {
                            const on = material === o.key;
                            return (
                                <button
                                    key={o.key}
                                    type="button"
                                    onClick={() => {
                                        setMaterial(o.key);
                                        setColourOverride(null);
                                    }}
                                    aria-pressed={on}
                                    className={`rounded-lg border p-2.5 text-left transition-colors ${
                                        on
                                            ? 'border-[#4e7e8c] bg-[#e8f0f3]'
                                            : 'border-neutral-200 hover:border-neutral-300'
                                    }`}
                                >
                                    <span
                                        className="flex items-center gap-1.5 text-[12px] font-semibold"
                                        style={{
                                            color: on ? ACCENT_DARK : '#374151',
                                        }}
                                    >
                                        {on && (
                                            <Check
                                                size={13}
                                                aria-hidden
                                                style={{ color: ACCENT }}
                                            />
                                        )}
                                        {o.label}
                                    </span>
                                    <span className="mt-0.5 block text-[10px] leading-snug text-neutral-500">
                                        {o.desc}
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Vinyl: print type */}
                    {material === 'vinyl' && (
                        <div>
                            <span
                                className="text-[11px] font-medium"
                                style={{ color: ACCENT_DARK }}
                            >
                                Print type
                            </span>
                            <div className="mt-1 grid grid-cols-2 overflow-hidden rounded-md border border-neutral-300 text-[11px] font-medium">
                                {(
                                    [
                                        [true, 'Full colour'],
                                        [false, 'Single colour'],
                                    ] as const
                                ).map(([v, label], k) => (
                                    <button
                                        key={label}
                                        type="button"
                                        onClick={() => setPrintFullColor(v)}
                                        aria-pressed={printFullColor === v}
                                        className={`min-h-[36px] py-2 ${
                                            k > 0
                                                ? 'border-l border-neutral-300'
                                                : ''
                                        } ${
                                            printFullColor === v
                                                ? 'text-white'
                                                : 'bg-white text-neutral-600'
                                        }`}
                                        style={
                                            printFullColor === v
                                                ? { background: ACCENT }
                                                : undefined
                                        }
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                            <p className="mt-1 text-[10px] text-neutral-500">
                                {printFullColor
                                    ? 'Keeps every colour and gradient in your artwork.'
                                    : 'One flat colour, matched to an industry-standard (RAL) reference.'}
                            </p>
                        </div>
                    )}

                    {/* Acrylic-based: stocked thickness */}
                    {isAcrylicBased(material) && (
                        <div>
                            <span
                                className="text-[11px] font-medium"
                                style={{ color: ACCENT_DARK }}
                            >
                                Acrylic thickness
                            </span>
                            <div className="mt-1 grid grid-cols-3 overflow-hidden rounded-md border border-neutral-300 text-[11px] font-medium">
                                {ACRYLIC_THICKNESSES_MM.map((t, k) => (
                                    <button
                                        key={t}
                                        type="button"
                                        onClick={() => setThicknessMm(t)}
                                        aria-pressed={thicknessMm === t}
                                        className={`min-h-[36px] py-2 ${
                                            k > 0
                                                ? 'border-l border-neutral-300'
                                                : ''
                                        } ${
                                            thicknessMm === t
                                                ? 'text-white'
                                                : 'bg-white text-neutral-600'
                                        }`}
                                        style={
                                            thicknessMm === t
                                                ? { background: ACCENT }
                                                : undefined
                                        }
                                    >
                                        {t} mm
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Colour: single-colour artwork gets an editable swatch… */}
                    {showColourPicker && (
                        <div>
                            <span
                                className="text-[11px] font-medium"
                                style={{ color: ACCENT_DARK }}
                            >
                                Colour
                            </span>
                            <div className="mt-1">
                                <SwatchPicker
                                    items={pickerItems}
                                    value={colourOverride ?? pickerDefault ?? undefined}
                                    placeholder="Pick a colour…"
                                    onPick={(i) => setColourOverride(i.hex)}
                                />
                            </div>
                            <p className="mt-1 text-[10px] text-neutral-500">
                                We&apos;ve matched your artwork to the closest
                                colour we stock — change it if you like.
                            </p>
                        </div>
                    )}

                    {/* …multi-colour artwork shows the per-part matches. */}
                    {!singleColour && matched.length > 0 && (
                        <div>
                            <span
                                className="text-[11px] font-medium"
                                style={{ color: ACCENT_DARK }}
                            >
                                {material === 'vinyl' && printFullColor
                                    ? 'Colours'
                                    : 'Matched colours'}
                            </span>
                            {material === 'vinyl' && printFullColor ? (
                                <p className="mt-1 text-[10px] text-neutral-500">
                                    Printed as-is — every colour in your
                                    artwork is kept.
                                </p>
                            ) : (
                                <>
                                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                        {matched.map((m, i) => (
                                            <span
                                                key={i}
                                                className="inline-flex items-center gap-1 rounded-full border border-neutral-200 px-1.5 py-0.5"
                                                title={`${m.count} part${m.count === 1 ? '' : 's'}`}
                                            >
                                                <span
                                                    className="h-3.5 w-3.5 rounded-full border border-black/10"
                                                    style={{ background: m.from }}
                                                    aria-hidden
                                                />
                                                <span className="text-[9px] text-neutral-400">
                                                    →
                                                </span>
                                                <span
                                                    className="h-3.5 w-3.5 rounded-full border border-black/10"
                                                    style={{ background: m.to }}
                                                    aria-hidden
                                                />
                                            </span>
                                        ))}
                                    </div>
                                    <p className="mt-1 text-[10px] text-neutral-500">
                                        Each part of your artwork is matched to
                                        the closest colour we stock — tap any
                                        part after adding to change it.
                                    </p>
                                </>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex shrink-0 items-center justify-end gap-2 border-t border-neutral-200 px-5 py-3">
                    <button
                        type="button"
                        onClick={onCancel}
                        className="min-h-[44px] rounded-lg border border-neutral-300 px-4 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={confirm}
                        disabled={!material}
                        className="flex min-h-[44px] items-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{ background: ACCENT }}
                    >
                        <Check size={15} aria-hidden />
                        Add to my sign
                    </button>
                </div>
            </div>
        </div>
    );
}
