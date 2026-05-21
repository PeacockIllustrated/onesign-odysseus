'use client';

import { useVisualiser } from './store';
import { MAX_PANEL_WIDTH_MM, type PanelEdge } from '@/lib/visualiser/types';

function NumberField({
    label,
    value,
    onChange,
    min = 0,
    step = 1,
    suffix = 'mm',
    hint,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    min?: number;
    step?: number;
    suffix?: string;
    hint?: string;
}) {
    return (
        <label className="block">
            <span className="text-xs font-medium text-neutral-600">{label}</span>
            <div className="mt-1 flex items-center gap-1">
                <input
                    type="number"
                    inputMode="decimal"
                    value={Number.isFinite(value) ? value : ''}
                    min={min}
                    step={step}
                    onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        onChange(Number.isNaN(n) ? 0 : n);
                    }}
                    className="w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-black focus:outline-none"
                />
                <span className="text-xs text-neutral-400 w-6">{suffix}</span>
            </div>
            {hint && <span className="mt-0.5 block text-[10px] text-neutral-400">{hint}</span>}
        </label>
    );
}

export function ControlsPanel() {
    const { params, setParam, setReturn } = useVisualiser();
    const edges: PanelEdge[] = ['top', 'bottom', 'left', 'right'];

    return (
        <div className="space-y-4">
            <div>
                <span className="text-xs font-medium text-neutral-600">
                    Design name
                </span>
                <input
                    type="text"
                    value={params.name}
                    onChange={(e) => setParam('name', e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-black focus:outline-none"
                />
            </div>

            <div className="grid grid-cols-2 gap-3">
                <NumberField
                    label="Panel width"
                    value={params.panelWidthMm}
                    onChange={(n) => setParam('panelWidthMm', n)}
                    hint={
                        params.panelWidthMm > MAX_PANEL_WIDTH_MM
                            ? `> ${MAX_PANEL_WIDTH_MM}mm — will be split`
                            : undefined
                    }
                />
                <NumberField
                    label="Panel height"
                    value={params.panelHeightMm}
                    onChange={(n) => setParam('panelHeightMm', n)}
                />
            </div>

            <NumberField
                label="Return depth"
                value={params.returnDepthMm}
                onChange={(n) => setParam('returnDepthMm', n)}
            />

            <div>
                <span className="text-xs font-medium text-neutral-600">
                    Returns on edges
                </span>
                <div className="mt-1.5 grid grid-cols-4 gap-1">
                    {edges.map((e) => (
                        <button
                            key={e}
                            type="button"
                            onClick={() => setReturn(e, !params.returns[e])}
                            className={`rounded-md px-2 py-1.5 text-xs font-medium capitalize transition-colors ${
                                params.returns[e]
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                            }`}
                        >
                            {e}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
                <NumberField
                    label="Shadow gap"
                    value={params.shadowGapMm}
                    onChange={(n) => setParam('shadowGapMm', n)}
                    hint="Inward lip at return tip (0 = none)"
                />
                <NumberField
                    label="Keyline"
                    value={params.keylineMm}
                    onChange={(n) => setParam('keylineMm', n)}
                    hint={
                        (params.apertureMode ?? 'aperture') === 'standoff'
                            ? 'Aperture mode only — ignored for stand-off'
                            : 'Offset around aperture cut'
                    }
                />
            </div>

            <NumberField
                label="Material thickness"
                value={params.materialThicknessMm}
                onChange={(n) => setParam('materialThicknessMm', n)}
                step={0.1}
                hint="Drives the bend deduction (½ thickness each side of every fold)"
            />

            <div>
                <span className="text-xs font-medium text-neutral-600">
                    Material / finish
                </span>
                <input
                    type="text"
                    value={params.materialLabel ?? ''}
                    onChange={(e) => setParam('materialLabel', e.target.value)}
                    placeholder="e.g. 3mm aluminium, satin white"
                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-black focus:outline-none"
                />
            </div>

            <div>
                <span className="text-xs font-medium text-neutral-600">
                    Panel colour
                </span>
                <div className="mt-1 flex items-center gap-2">
                    <input
                        type="color"
                        value={params.panelColor ?? '#d6d6d6'}
                        onChange={(e) => setParam('panelColor', e.target.value)}
                        className="h-8 w-12 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                        aria-label="Panel base colour"
                    />
                    <input
                        type="text"
                        value={params.panelColor ?? '#d6d6d6'}
                        onChange={(e) => {
                            const v = e.target.value.trim();
                            if (/^#[0-9a-fA-F]{6}$/.test(v))
                                setParam('panelColor', v);
                        }}
                        className="flex-1 rounded-md border border-neutral-300 px-2 py-1 font-mono text-xs uppercase tracking-wide focus:border-black focus:outline-none"
                        placeholder="#d6d6d6"
                    />
                </div>
                <span className="mt-0.5 block text-[10px] text-neutral-400">
                    Carried into the 3D &amp; flat previews so the material reads at a glance.
                </span>
            </div>
        </div>
    );
}
