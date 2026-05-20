'use client';

import { useRef, useState } from 'react';
import { useVisualiser } from './store';
import { importSvg } from '@/lib/visualiser/svg-import';
import type {
    AlignH,
    AlignV,
    ApertureMode,
} from '@/lib/visualiser/types';
import { AlertTriangle, Upload, X } from 'lucide-react';

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
                        {(params.apertureMode ?? 'aperture') === 'standoff' && (
                            <>
                                <NumField
                                    label="Fixing radius (mm)"
                                    step={0.5}
                                    value={params.fixingRadiusMm ?? 5}
                                    onChange={(n) =>
                                        setParam(
                                            'fixingRadiusMm',
                                            n > 0 ? n : 0.1,
                                        )
                                    }
                                />
                                <div>
                                    <div className="flex items-baseline justify-between">
                                        <span className="text-[10px] text-neutral-500">
                                            Fixing density
                                        </span>
                                        <span className="text-[10px] tabular-nums text-neutral-400">
                                            {Math.round(
                                                (params.fixingDensity ?? 1) *
                                                    100,
                                            )}
                                            %
                                        </span>
                                    </div>
                                    <input
                                        type="range"
                                        min={0}
                                        max={100}
                                        // Symmetric mapping: slider 50 = 1.0×;
                                        // 0 = 0.5× (sparse, acrylic-light);
                                        // 100 = 2.0× (dense, brass-heavy).
                                        value={Math.round(
                                            50 +
                                                (Math.log2(
                                                    params.fixingDensity ?? 1,
                                                ) *
                                                    50),
                                        )}
                                        onChange={(e) => {
                                            const v = Number(e.target.value);
                                            const factor =
                                                Math.pow(2, (v - 50) / 50);
                                            setParam(
                                                'fixingDensity',
                                                Math.round(factor * 100) / 100,
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
