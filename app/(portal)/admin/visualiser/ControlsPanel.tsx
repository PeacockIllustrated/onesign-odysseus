'use client';

import { ChevronDown } from 'lucide-react';
import { useVisualiser } from './store';
import { MAX_PANEL_WIDTH_MM, type PanelEdge } from '@/lib/visualiser/types';

const ACCENT = '#4e7e8c';

/**
 * Numeric field with built-in range validation. Out-of-range values get
 * a red ring + inline message rather than silently accepting an invalid
 * value that breaks the geometry downstream.
 */
function NumberField({
    label,
    value,
    onChange,
    min,
    max,
    step = 1,
    suffix = 'mm',
    hint,
}: {
    label: string;
    value: number;
    onChange: (n: number) => void;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
    hint?: string;
}) {
    const tooLow = typeof min === 'number' && value < min;
    const tooHigh = typeof max === 'number' && value > max;
    const invalid = tooLow || tooHigh;
    return (
        <label className="block">
            <span className="text-[11px] font-medium text-neutral-600">
                {label}
            </span>
            <div className="mt-1 flex items-center gap-1">
                <input
                    type="number"
                    inputMode="decimal"
                    value={Number.isFinite(value) ? value : ''}
                    min={min}
                    max={max}
                    step={step}
                    aria-invalid={invalid}
                    onChange={(e) => {
                        const n = parseFloat(e.target.value);
                        onChange(Number.isNaN(n) ? 0 : n);
                    }}
                    className={`w-full rounded-md border px-2 py-1.5 text-sm focus:outline-none ${
                        invalid
                            ? 'border-red-400 ring-1 ring-red-200 focus:border-red-500'
                            : 'border-neutral-300 focus:border-black'
                    }`}
                />
                <span className="w-6 text-xs text-neutral-400">{suffix}</span>
            </div>
            {invalid ? (
                <span className="mt-0.5 block text-[10px] text-red-600">
                    {tooLow
                        ? `Must be ≥ ${min}${suffix ? ' ' + suffix : ''}`
                        : `Must be ≤ ${max}${suffix ? ' ' + suffix : ''}`}
                </span>
            ) : hint ? (
                <span className="mt-0.5 block text-[10px] text-neutral-400">
                    {hint}
                </span>
            ) : null}
        </label>
    );
}

/**
 * Collapsible section — `<details>`-based so it's keyboard-accessible
 * for free. Operators can fold sections they've finished configuring
 * to reduce the visual load of the side rail.
 */
function Section({
    title,
    defaultOpen = true,
    children,
}: {
    title: string;
    defaultOpen?: boolean;
    children: React.ReactNode;
}) {
    return (
        <details
            open={defaultOpen}
            className="group rounded-md border border-neutral-200 bg-white"
        >
            <summary className="flex cursor-pointer items-center justify-between px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500 [&::-webkit-details-marker]:hidden">
                <span>{title}</span>
                <ChevronDown
                    size={14}
                    aria-hidden
                    className="text-neutral-400 transition-transform group-open:rotate-180"
                />
            </summary>
            <div className="border-t border-neutral-100 px-3 py-3 space-y-3">
                {children}
            </div>
        </details>
    );
}

export function ControlsPanel() {
    const { params, setParam, setReturn, setShadowGapEdge } = useVisualiser();
    const edges: PanelEdge[] = ['top', 'bottom', 'left', 'right'];
    const shadowGapEdges = params.shadowGapEdges ?? { top: true, bottom: true };

    return (
        <div className="space-y-3">
            <div>
                <label
                    htmlFor="visualiser-design-name"
                    className="text-[11px] font-medium text-neutral-600"
                >
                    Design name
                </label>
                <input
                    id="visualiser-design-name"
                    type="text"
                    value={params.name}
                    onChange={(e) => setParam('name', e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-black focus:outline-none"
                />
            </div>

            <Section title="Panel dimensions">
                <div className="grid grid-cols-2 gap-3">
                    <NumberField
                        label="Width"
                        value={params.panelWidthMm}
                        onChange={(n) => setParam('panelWidthMm', n)}
                        min={1}
                        hint={
                            params.panelWidthMm > MAX_PANEL_WIDTH_MM
                                ? `> ${MAX_PANEL_WIDTH_MM} mm — will be split into sections`
                                : undefined
                        }
                    />
                    <NumberField
                        label="Height"
                        value={params.panelHeightMm}
                        onChange={(n) => setParam('panelHeightMm', n)}
                        min={1}
                    />
                </div>

                {params.panelWidthMm > MAX_PANEL_WIDTH_MM && (
                    <NumberField
                        label="Centre panel override"
                        value={params.centrePanelOverrideMm ?? 0}
                        onChange={(n) =>
                            setParam(
                                'centrePanelOverrideMm',
                                n > 0 ? n : null,
                            )
                        }
                        min={0}
                        hint={
                            params.centrePanelOverrideMm
                                ? `Sides rebalance around ${params.centrePanelOverrideMm} mm centre`
                                : `Default — centre uses the full ${MAX_PANEL_WIDTH_MM} mm sheet`
                        }
                    />
                )}

                <NumberField
                    label="Return depth"
                    value={params.returnDepthMm}
                    onChange={(n) => setParam('returnDepthMm', n)}
                    min={0}
                />

                <div>
                    <span className="text-[11px] font-medium text-neutral-600">
                        Returns on edges
                    </span>
                    <div className="mt-1.5 grid grid-cols-4 gap-1">
                        {edges.map((e) => {
                            const on = params.returns[e];
                            return (
                                <button
                                    key={e}
                                    type="button"
                                    onClick={() => setReturn(e, !on)}
                                    aria-pressed={on}
                                    className={`min-h-[36px] rounded-md px-2 py-2 text-xs font-medium capitalize transition-colors ${
                                        on
                                            ? 'text-white'
                                            : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                    }`}
                                    style={on ? { background: ACCENT } : undefined}
                                >
                                    {e}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <NumberField
                        label="Shadow gap"
                        value={params.shadowGapMm}
                        onChange={(n) => setParam('shadowGapMm', n)}
                        min={0}
                        hint="Inward lip at return tip (0 = none)"
                    />
                    <NumberField
                        label="Keyline"
                        value={params.keylineMm}
                        onChange={(n) => setParam('keylineMm', n)}
                        min={0}
                        hint="Offset around aperture cut"
                    />
                </div>

                {params.shadowGapMm > 0 && (
                    <div>
                        <span className="text-[11px] font-medium text-neutral-600">
                            Shadow gap on edges
                        </span>
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                            {(['top', 'bottom'] as const).map((e) => {
                                const active = shadowGapEdges[e];
                                const returnOn = params.returns[e];
                                return (
                                    <button
                                        key={e}
                                        type="button"
                                        disabled={!returnOn}
                                        onClick={() =>
                                            setShadowGapEdge(e, !active)
                                        }
                                        aria-pressed={!!active}
                                        className={`min-h-[36px] rounded-md px-2 py-2 text-xs font-medium capitalize transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                                            active && returnOn
                                                ? 'text-white'
                                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                        }`}
                                        style={
                                            active && returnOn
                                                ? { background: ACCENT }
                                                : undefined
                                        }
                                    >
                                        {e}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="mt-1 block text-[10px] text-neutral-400">
                            Lips only fit on top + bottom returns.
                        </span>
                    </div>
                )}
            </Section>

            <Section title="Material spec" defaultOpen={false}>
                <NumberField
                    label="Material thickness"
                    value={params.materialThicknessMm}
                    onChange={(n) => setParam('materialThicknessMm', n)}
                    step={0.1}
                    min={0.1}
                    max={20}
                    hint="Drives the bend deduction (½ thickness each side of every fold)"
                />

                <div>
                    <label
                        htmlFor="visualiser-material-label"
                        className="text-[11px] font-medium text-neutral-600"
                    >
                        Material / finish
                    </label>
                    <input
                        id="visualiser-material-label"
                        type="text"
                        value={params.materialLabel ?? ''}
                        onChange={(e) =>
                            setParam('materialLabel', e.target.value)
                        }
                        placeholder="e.g. 3mm aluminium, satin white"
                        className="mt-1 w-full rounded-md border border-neutral-300 px-2 py-1.5 text-sm focus:border-black focus:outline-none"
                    />
                </div>

                <div>
                    <span className="text-[11px] font-medium text-neutral-600">
                        Panel colour
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                        <input
                            type="color"
                            value={params.panelColor ?? '#d6d6d6'}
                            onChange={(e) =>
                                setParam('panelColor', e.target.value)
                            }
                            className="h-11 w-14 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
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
                            className="flex-1 rounded-md border border-neutral-300 px-2 py-2 font-mono text-xs uppercase tracking-wide focus:border-black focus:outline-none"
                            placeholder="#d6d6d6"
                            aria-label="Panel colour hex"
                        />
                    </div>
                    <span className="mt-1 block text-[10px] text-neutral-400">
                        Carried into the 3D &amp; flat previews so the
                        material reads at a glance.
                    </span>
                </div>
            </Section>
        </div>
    );
}
