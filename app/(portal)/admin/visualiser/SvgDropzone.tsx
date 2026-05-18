'use client';

import { useRef, useState } from 'react';
import { useVisualiser } from './store';
import { importSvg } from '@/lib/visualiser/svg-import';
import { AlertTriangle, Upload, X } from 'lucide-react';

export function SvgDropzone() {
    const { svgSource, imported, params, setSvg, clearSvg, setPlacement } =
        useVisualiser();
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
                <div className="grid grid-cols-3 gap-2">
                    {(
                        [
                            ['offsetXMm', 'X offset'],
                            ['offsetYMm', 'Y offset'],
                            ['scale', 'Scale'],
                        ] as const
                    ).map(([key, label]) => (
                        <label key={key} className="block">
                            <span className="text-[10px] text-neutral-500">
                                {label}
                            </span>
                            <input
                                type="number"
                                step={key === 'scale' ? 0.05 : 1}
                                value={placement[key]}
                                onChange={(e) => {
                                    const n = parseFloat(e.target.value);
                                    setPlacement({
                                        [key]: Number.isNaN(n) ? 0 : n,
                                    });
                                }}
                                className="mt-0.5 w-full rounded border border-neutral-300 px-1.5 py-1 text-xs focus:border-black focus:outline-none"
                            />
                        </label>
                    ))}
                </div>
            )}
        </div>
    );
}
