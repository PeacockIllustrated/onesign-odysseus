'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useVisualiser } from './store';
import { importSvg } from '@/lib/visualiser/svg-import';
import type {
    AlignH,
    AlignV,
    ApertureMode,
    FlatPath,
    PanelParams,
} from '@/lib/visualiser/types';
import { AlertTriangle, Crosshair, Eraser, Upload, X } from 'lucide-react';

type NonCutEntry = NonNullable<PanelParams['nonCutPaths']>[number];

/**
 * Per-imported-path material picker for aperture mode. Each row maps to
 * one imported SVG path: leave it as Cut (the default), or move it out
 * of the cut and re-render as vinyl (colour) or acrylic (colour +
 * thickness). Indices line up with imported.paths order.
 */
function MaterialsPanel({
    paths,
    nonCut,
    setPathMaterial,
    selectedPathIndex,
    setSelectedPathIndex,
}: {
    paths: FlatPath[];
    nonCut: NonCutEntry[];
    setPathMaterial: (
        pathIndex: number,
        patch:
            | null
            | {
                  material: 'solid' | 'vinyl' | 'acrylic';
                  color?: string;
                  thicknessMm?: number;
              },
    ) => void;
    selectedPathIndex: number | null;
    setSelectedPathIndex: (i: number | null) => void;
}) {
    const byIndex = useMemo(() => {
        const m = new Map<number, NonCutEntry>();
        for (const e of nonCut) m.set(e.pathIndex, e);
        return m;
    }, [nonCut]);

    // Scroll the selected row into view when the operator picks a path
    // on the canvas — otherwise it can sit off-screen on a long list.
    const rowRefs = useRef<Array<HTMLLIElement | null>>([]);
    useEffect(() => {
        if (selectedPathIndex == null) return;
        const el = rowRefs.current[selectedPathIndex];
        if (el)
            el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, [selectedPathIndex]);

    if (paths.length === 0) return null;

    return (
        <div className="space-y-2 pt-2 border-t border-neutral-100">
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                Materials per path
            </h4>
            <p className="text-[10px] text-neutral-400">
                By default every SVG path is cut out of the panel. Switch a
                row to Vinyl (printed/cut sticker) or Acrylic (sheet sitting
                on the face) to keep it.
            </p>
            <ul className="space-y-2">
                {paths.map((_, i) => {
                    const entry = byIndex.get(i);
                    const material = entry?.material ?? 'cut';
                    const isSelected = selectedPathIndex === i;
                    return (
                        <li
                            key={i}
                            ref={(el) => {
                                rowRefs.current[i] = el;
                            }}
                            className={`rounded-md border bg-neutral-50 p-2 transition-colors ${
                                isSelected
                                    ? 'border-orange-400 ring-1 ring-orange-300'
                                    : 'border-neutral-200'
                            }`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <button
                                    type="button"
                                    onClick={() =>
                                        setSelectedPathIndex(
                                            isSelected ? null : i,
                                        )
                                    }
                                    className="text-[11px] font-medium text-neutral-600 hover:text-black"
                                >
                                    Path {i + 1}
                                    {isSelected && (
                                        <span className="ml-1 text-orange-500">
                                            • selected
                                        </span>
                                    )}
                                </button>
                                <div className="flex overflow-hidden rounded border border-neutral-300">
                                    {(
                                        [
                                            ['cut', 'Cut'],
                                            ['solid', 'Solid'],
                                            ['vinyl', 'Vinyl'],
                                            ['acrylic', 'Acrylic'],
                                        ] as const
                                    ).map(([v, label], k) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() =>
                                                setPathMaterial(
                                                    i,
                                                    v === 'cut'
                                                        ? null
                                                        : { material: v },
                                                )
                                            }
                                            className={`px-2 py-0.5 text-[10px] font-medium ${
                                                k > 0
                                                    ? 'border-l border-neutral-300'
                                                    : ''
                                            } ${
                                                material === v
                                                    ? 'bg-black text-white'
                                                    : 'bg-white text-neutral-500 hover:bg-neutral-100'
                                            }`}
                                            title={
                                                v === 'solid'
                                                    ? 'Leave as panel material (no cut). Use for inner letter counters.'
                                                    : undefined
                                            }
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {entry && entry.material !== 'solid' && (
                                <div className="mt-2 grid grid-cols-2 gap-2">
                                    <label className="block">
                                        <span className="text-[10px] text-neutral-500">
                                            Colour
                                        </span>
                                        <div className="mt-0.5 flex items-center gap-1.5">
                                            <input
                                                type="color"
                                                value={entry.color}
                                                onChange={(e) =>
                                                    setPathMaterial(i, {
                                                        material:
                                                            entry.material,
                                                        color: e.target.value,
                                                    })
                                                }
                                                className="h-6 w-8 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                                                aria-label={`Path ${i + 1} colour`}
                                            />
                                            <input
                                                type="text"
                                                value={entry.color}
                                                onChange={(e) => {
                                                    const v =
                                                        e.target.value.trim();
                                                    if (
                                                        /^#[0-9a-fA-F]{6}$/.test(
                                                            v,
                                                        )
                                                    )
                                                        setPathMaterial(i, {
                                                            material:
                                                                entry.material,
                                                            color: v,
                                                        });
                                                }}
                                                className="flex-1 rounded border border-neutral-300 px-1 py-0.5 font-mono text-[10px] uppercase focus:border-black focus:outline-none"
                                            />
                                        </div>
                                    </label>
                                    {entry.material === 'acrylic' && (
                                        <NumField
                                            label="Thickness (mm)"
                                            step={0.5}
                                            value={entry.thicknessMm ?? 5}
                                            onChange={(n) =>
                                                setPathMaterial(i, {
                                                    material: 'acrylic',
                                                    thicknessMm:
                                                        n > 0 ? n : 0.5,
                                                })
                                            }
                                        />
                                    )}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}

function Segmented<T extends string>({
    options,
    value,
    onChange,
}: {
    options: Array<[T, string]>;
    value: T;
    onChange: (v: T) => void;
}) {
    return (
        <div className="flex overflow-hidden rounded-md border border-neutral-300">
            {options.map(([val, label], i) => (
                <button
                    key={val}
                    type="button"
                    onClick={() => onChange(val)}
                    className={`flex-1 py-1 text-xs font-medium transition-colors ${
                        i > 0 ? 'border-l border-neutral-300' : ''
                    } ${
                        value === val
                            ? 'bg-black text-white'
                            : 'bg-white text-neutral-500 hover:bg-neutral-100'
                    }`}
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
    onChange: (n: number) => void;
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
                onChange={(e) => {
                    const n = parseFloat(e.target.value);
                    onChange(Number.isNaN(n) ? 0 : n);
                }}
                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-black focus:outline-none"
            />
        </label>
    );
}

export function SvgDropzone() {
    const {
        svgSource,
        imported,
        params,
        setSvg,
        clearSvg,
        setPlacement,
        setParam,
        fixingMode,
        setFixingMode,
        clearManualFixings,
        setPathMaterial,
        selectedPathIndex,
        setSelectedPathIndex,
    } = useVisualiser();
    const inputRef = useRef<HTMLInputElement>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFile = async (file: File) => {
        setError(null);
        try {
            const text = await file.text();
            const result = importSvg(text);
            if (result.paths.length === 0) {
                setError('No usable vector shapes found in that SVG.');
                return;
            }
            setSvg(text, result);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'Could not read SVG');
        }
    };

    const placement = params.aperturePlacement;

    return (
        <div className="space-y-3">
            <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                    Aperture artwork
                </span>
                {svgSource && (
                    <button
                        type="button"
                        onClick={clearSvg}
                        className="flex items-center gap-1 text-xs text-neutral-500 hover:text-red-600"
                    >
                        <X size={12} /> Remove
                    </button>
                )}
            </div>

            {!svgSource ? (
                <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="flex w-full flex-col items-center gap-1 rounded-lg border-2 border-dashed border-neutral-300 px-4 py-6 text-neutral-400 hover:border-neutral-400 hover:text-neutral-600"
                >
                    <Upload size={20} />
                    <span className="text-xs">Upload an SVG to cut from the panel</span>
                </button>
            ) : (
                <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-xs text-neutral-600">
                    {imported && (
                        <p>
                            {imported.paths.length} path
                            {imported.paths.length === 1 ? '' : 's'} ·{' '}
                            {imported.bbox.w.toFixed(0)}×{imported.bbox.h.toFixed(0)}mm
                            native
                        </p>
                    )}
                </div>
            )}

            <input
                ref={inputRef}
                type="file"
                accept=".svg,image/svg+xml"
                className="hidden"
                onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleFile(f);
                    e.target.value = '';
                }}
            />

            {error && <p className="text-xs text-red-600">{error}</p>}

            {imported && imported.warnings.length > 0 && (
                <div className="space-y-1 rounded-lg border border-amber-300 bg-amber-50 p-2.5">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                        <AlertTriangle size={13} />
                        Laser warnings (advisory — export still works)
                    </div>
                    <ul className="list-disc pl-4 text-[11px] text-amber-700">
                        {imported.warnings.map((w, i) => (
                            <li key={i}>{w}</li>
                        ))}
                    </ul>
                </div>
            )}

            {placement && (
                <div className="space-y-2.5">
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <span className="text-[10px] text-neutral-500">
                                Horizontal
                            </span>
                            <div className="mt-0.5">
                                <Segmented<AlignH>
                                    options={[
                                        ['left', 'Left'],
                                        ['center', 'Centre'],
                                        ['right', 'Right'],
                                    ]}
                                    value={placement.alignH}
                                    onChange={(v) =>
                                        setPlacement({ alignH: v })
                                    }
                                />
                            </div>
                        </div>
                        <div>
                            <span className="text-[10px] text-neutral-500">
                                Vertical
                            </span>
                            <div className="mt-0.5">
                                <Segmented<AlignV>
                                    options={[
                                        ['top', 'Top'],
                                        ['middle', 'Middle'],
                                        ['bottom', 'Bottom'],
                                    ]}
                                    value={placement.alignV}
                                    onChange={(v) =>
                                        setPlacement({ alignV: v })
                                    }
                                />
                            </div>
                        </div>
                    </div>
                    {imported && imported.bbox.w > 0 && imported.bbox.h > 0 && (
                        <div className="grid grid-cols-2 gap-2">
                            <NumField
                                label="Width (mm)"
                                step={1}
                                value={
                                    Math.round(
                                        imported.bbox.w * placement.scale * 10,
                                    ) / 10
                                }
                                onChange={(n) =>
                                    setPlacement({
                                        scale:
                                            n > 0 ? n / imported.bbox.w : 0.01,
                                    })
                                }
                            />
                            <NumField
                                label="Height (mm)"
                                step={1}
                                value={
                                    Math.round(
                                        imported.bbox.h * placement.scale * 10,
                                    ) / 10
                                }
                                onChange={(n) =>
                                    setPlacement({
                                        scale:
                                            n > 0 ? n / imported.bbox.h : 0.01,
                                    })
                                }
                            />
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-2">
                        <NumField
                            label="Nudge X (mm)"
                            step={1}
                            value={placement.nudgeXMm}
                            onChange={(n) => setPlacement({ nudgeXMm: n })}
                        />
                        <NumField
                            label="Nudge Y (mm)"
                            step={1}
                            value={placement.nudgeYMm}
                            onChange={(n) => setPlacement({ nudgeYMm: n })}
                        />
                    </div>
                    <p className="text-[10px] text-neutral-400">
                        Size in mm — aspect locked, edit width or height.
                        Anchored to the artwork centre; default is dead centre.
                    </p>

                    {/* Cut mode: aperture (cut out of panel) vs stand-off
                        (lettering mounts on studs; the panel gets fixing
                        holes inside each letter instead). */}
                    <div className="pt-2 border-t border-neutral-100 space-y-2">
                        <div>
                            <span className="text-[10px] text-neutral-500">
                                Cut mode
                            </span>
                            <div className="mt-0.5">
                                <Segmented<ApertureMode>
                                    options={[
                                        ['aperture', 'Aperture'],
                                        ['standoff', 'Stood off'],
                                    ]}
                                    value={params.apertureMode ?? 'aperture'}
                                    onChange={(v) =>
                                        setParam('apertureMode', v)
                                    }
                                />
                            </div>
                        </div>
                        {(params.apertureMode ?? 'aperture') === 'aperture' &&
                            imported && (
                                <MaterialsPanel
                                    paths={imported.paths}
                                    nonCut={params.nonCutPaths ?? []}
                                    setPathMaterial={setPathMaterial}
                                    selectedPathIndex={selectedPathIndex}
                                    setSelectedPathIndex={
                                        setSelectedPathIndex
                                    }
                                />
                            )}
                        {(params.apertureMode ?? 'aperture') === 'standoff' && (
                            <>
                                {/* Lettering — physical letter material */}
                                <div className="space-y-2 pt-1">
                                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Lettering
                                    </h4>
                                    <div className="grid grid-cols-2 gap-2">
                                        <NumField
                                            label="Thickness (mm)"
                                            step={0.5}
                                            value={
                                                params.letterThicknessMm ?? 5
                                            }
                                            onChange={(n) =>
                                                setParam(
                                                    'letterThicknessMm',
                                                    n > 0 ? n : 0.5,
                                                )
                                            }
                                        />
                                        <NumField
                                            label="Stand-off (mm)"
                                            step={1}
                                            value={
                                                params.standoffDistanceMm ??
                                                25
                                            }
                                            onChange={(n) =>
                                                setParam(
                                                    'standoffDistanceMm',
                                                    n >= 0 ? n : 0,
                                                )
                                            }
                                        />
                                    </div>
                                    <label className="block">
                                        <span className="text-[10px] text-neutral-500">
                                            Letter colour
                                        </span>
                                        <div className="mt-0.5 flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={
                                                    params.letterColor ??
                                                    '#1a1f23'
                                                }
                                                onChange={(e) =>
                                                    setParam(
                                                        'letterColor',
                                                        e.target.value,
                                                    )
                                                }
                                                className="h-7 w-10 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                                                aria-label="Letter colour"
                                            />
                                            <input
                                                type="text"
                                                value={
                                                    params.letterColor ??
                                                    '#1a1f23'
                                                }
                                                onChange={(e) => {
                                                    const v =
                                                        e.target.value.trim();
                                                    if (
                                                        /^#[0-9a-fA-F]{6}$/.test(
                                                            v,
                                                        )
                                                    )
                                                        setParam(
                                                            'letterColor',
                                                            v,
                                                        );
                                                }}
                                                className="flex-1 rounded border border-neutral-300 px-1.5 py-1 font-mono text-[10px] uppercase tracking-wide focus:border-black focus:outline-none"
                                                placeholder="#1a1f23"
                                            />
                                        </div>
                                    </label>
                                </div>

                                {/* Fixings — diameter + density + manual */}
                                <div className="space-y-2 pt-1">
                                    <h4 className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">
                                        Fixings
                                    </h4>
                                    <NumField
                                        label="Diameter (mm)"
                                        step={0.5}
                                        value={
                                            params.fixingDiameterMm ??
                                            (params.fixingRadiusMm
                                                ? params.fixingRadiusMm * 2
                                                : 10)
                                        }
                                        onChange={(n) =>
                                            setParam(
                                                'fixingDiameterMm',
                                                n > 0 ? n : 0.2,
                                            )
                                        }
                                    />
                                    <div>
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-[10px] text-neutral-500">
                                                Density (auto-placed)
                                            </span>
                                            <span className="text-[10px] tabular-nums text-neutral-400">
                                                {Math.round(
                                                    (params.fixingDensity ??
                                                        1) * 100,
                                                )}
                                                %
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={0}
                                            max={100}
                                            value={Math.round(
                                                50 +
                                                    Math.log2(
                                                        params.fixingDensity ??
                                                            1,
                                                    ) *
                                                        50,
                                            )}
                                            onChange={(e) => {
                                                const v = Number(
                                                    e.target.value,
                                                );
                                                const factor = Math.pow(
                                                    2,
                                                    (v - 50) / 50,
                                                );
                                                setParam(
                                                    'fixingDensity',
                                                    Math.round(factor * 100) /
                                                        100,
                                                );
                                            }}
                                            className="mt-1 h-1 w-full accent-black"
                                            aria-label="Fixing density"
                                        />
                                        <div className="mt-0.5 flex justify-between text-[9px] uppercase tracking-wide text-neutral-400">
                                            <span>Sparse</span>
                                            <span>Normal</span>
                                            <span>Dense</span>
                                        </div>
                                    </div>

                                    {/* Manual placement + deletion. Modes
                                        are mutually exclusive; clicking the
                                        active mode again turns it off. */}
                                    <div className="flex items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() =>
                                                setFixingMode(
                                                    fixingMode === 'place'
                                                        ? 'off'
                                                        : 'place',
                                                )
                                            }
                                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors ${
                                                fixingMode === 'place'
                                                    ? 'bg-black text-white'
                                                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                            title="Click anywhere on the lettering to drop a fixing. Manual fixings track the lettering across placement changes."
                                        >
                                            <Crosshair size={12} />
                                            {fixingMode === 'place'
                                                ? 'Done placing'
                                                : 'Place'}
                                        </button>
                                        <button
                                            type="button"
                                            disabled={
                                                (params.manualFixings?.length ??
                                                    0) === 0
                                            }
                                            onClick={() =>
                                                setFixingMode(
                                                    fixingMode === 'delete'
                                                        ? 'off'
                                                        : 'delete',
                                                )
                                            }
                                            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                                fixingMode === 'delete'
                                                    ? 'bg-red-600 text-white'
                                                    : 'border border-neutral-300 text-neutral-700 hover:bg-neutral-100'
                                            }`}
                                            title="Click on a manually-placed fixing to remove it."
                                        >
                                            <Eraser size={12} />
                                            {fixingMode === 'delete'
                                                ? 'Done deleting'
                                                : 'Delete'}
                                        </button>
                                        {(params.manualFixings?.length ?? 0) >
                                            0 && (
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    clearManualFixings()
                                                }
                                                className="rounded-md border border-neutral-300 px-2 py-1.5 text-[11px] font-medium text-neutral-500 hover:bg-neutral-100"
                                                title="Remove every manually-placed fixing"
                                            >
                                                Clear (
                                                {
                                                    params.manualFixings
                                                        ?.length
                                                }
                                                )
                                            </button>
                                        )}
                                    </div>
                                    {fixingMode === 'place' && (
                                        <p className="text-[10px] text-neutral-500">
                                            Tap the 3D scene or flat preview
                                            to drop a fixing at that point.
                                            Anchored to the lettering, so it
                                            follows when you re-align the
                                            artwork.
                                        </p>
                                    )}
                                    {fixingMode === 'delete' && (
                                        <p className="text-[10px] text-red-600">
                                            Tap a manually-placed fixing to
                                            remove it.
                                        </p>
                                    )}
                                </div>
                            </>
                        )}
                        <p className="text-[10px] text-neutral-400">
                            {(params.apertureMode ?? 'aperture') === 'standoff'
                                ? 'Lettering is fabricated separately; the panel gets fixing holes placed inside each letter, offset so they never line up vertically or horizontally.'
                                : 'The artwork is cut out of the panel as one or more holes.'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
