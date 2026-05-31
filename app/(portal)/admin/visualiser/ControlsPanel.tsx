'use client';

import { useVisualiser } from './store';
import { Section } from './Section';
import {
    MAX_PANEL_WIDTH_MM,
    type BracketStyle,
    type PanelEdge,
} from '@/lib/visualiser/types';
import { resolveMount } from '@/lib/visualiser/projecting';

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


const BRACKET_STYLES: { value: BracketStyle; label: string }[] = [
    { value: 'flat-plate', label: 'Flat plate' },
    { value: 'box-arm', label: 'Box arm' },
    { value: 'scroll', label: 'Scroll' },
];

export function ControlsPanel() {
    const {
        params,
        setParam,
        setReturn,
        setShadowGapEdge,
        mount,
        setMount,
        activeTab,
        projectingEnabled,
        setActiveTab,
        enableProjecting,
        disableProjecting,
    } = useVisualiser();
    const edges: PanelEdge[] = ['top', 'bottom', 'left', 'right'];
    const shadowGapEdges = params.shadowGapEdges ?? { top: true, bottom: true };
    const onProjectingTab = activeTab === 'projecting';
    // Resolve the mount once so the controls show the same defaults the rest
    // of the pipeline applies when a field is left absent.
    const m = resolveMount(mount);

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

            {/* Sign tabs — a design is a main fascia panel plus an optional
                projecting (blade) sign. Each tab edits its own full panel;
                everything below (dimensions, material, artwork) applies to the
                panel of the active tab. */}
            <div>
                <span className="text-[11px] font-medium text-neutral-600">
                    Sign
                </span>
                <div className="mt-1.5 grid grid-cols-2 gap-1">
                    <button
                        type="button"
                        onClick={() => setActiveTab('main')}
                        aria-pressed={!onProjectingTab}
                        className={`min-h-[36px] rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                            !onProjectingTab
                                ? 'text-white'
                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                        }`}
                        style={!onProjectingTab ? { background: ACCENT } : undefined}
                    >
                        Main panel
                    </button>
                    {projectingEnabled ? (
                        <button
                            type="button"
                            onClick={() => setActiveTab('projecting')}
                            aria-pressed={onProjectingTab}
                            className={`min-h-[36px] rounded-md px-2 py-2 text-xs font-medium transition-colors ${
                                onProjectingTab
                                    ? 'text-white'
                                    : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                            }`}
                            style={
                                onProjectingTab ? { background: ACCENT } : undefined
                            }
                        >
                            Projecting sign
                        </button>
                    ) : (
                        <button
                            type="button"
                            onClick={() => {
                                enableProjecting();
                                setActiveTab('projecting');
                            }}
                            className="min-h-[36px] rounded-md border border-dashed border-neutral-300 px-2 py-2 text-xs font-medium text-neutral-500 transition-colors hover:border-neutral-400 hover:text-neutral-700"
                        >
                            + Add projecting sign
                        </button>
                    )}
                </div>
                {onProjectingTab && (
                    <button
                        type="button"
                        onClick={disableProjecting}
                        className="mt-1.5 text-[10px] font-medium text-red-600 hover:underline"
                    >
                        Remove projecting sign
                    </button>
                )}
            </div>

            {onProjectingTab && (
                <Section title="Mounting" accent>
                    <p className="text-[10px] text-neutral-500">
                        How the blade attaches to the fascia. Its width (in Panel
                        dimensions) is how far it protrudes; its height is
                        vertical. The bracket is bought-in — specified on the
                        PDFs, not fabricated.
                    </p>

                    <div>
                        <span className="text-[11px] font-medium text-neutral-600">
                            Projects from
                        </span>
                        <div className="mt-1.5 grid grid-cols-2 gap-1">
                            {(['left', 'right'] as const).map((sd) => {
                                const active = m.side === sd;
                                return (
                                    <button
                                        key={sd}
                                        type="button"
                                        onClick={() => setMount({ side: sd })}
                                        aria-pressed={active}
                                        className={`min-h-[36px] rounded-md px-2 py-2 text-xs font-medium capitalize transition-colors ${
                                            active
                                                ? 'text-white'
                                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                        }`}
                                        style={
                                            active
                                                ? { background: ACCENT }
                                                : undefined
                                        }
                                    >
                                        {sd}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="mt-1 block text-[10px] text-neutral-400">
                            Which side of the fascia the blade sits on.
                        </span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <NumberField
                            label="Position across"
                            value={m.offsetXMm}
                            onChange={(n) => setMount({ offsetXMm: n })}
                            min={0}
                            hint="From the fascia edge"
                        />
                        <NumberField
                            label="Height from top"
                            value={m.offsetYMm}
                            onChange={(n) => setMount({ offsetYMm: n })}
                            min={0}
                            hint="Blade top, from fascia top"
                        />
                    </div>

                    <button
                        type="button"
                        onClick={() =>
                            setMount({ doubleSided: !m.doubleSided })
                        }
                        aria-pressed={m.doubleSided}
                        className={`flex min-h-[36px] w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                            m.doubleSided
                                ? 'text-white'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                        }`}
                        style={m.doubleSided ? { background: ACCENT } : undefined}
                    >
                        <span>Double-sided</span>
                        <span className="text-[10px] uppercase tracking-wide">
                            {m.doubleSided ? 'On' : 'Off'}
                        </span>
                    </button>
                    <p className="text-[10px] text-neutral-400">
                        Artwork on both faces — the usual case for a blade sign.
                    </p>

                    <div>
                        <span className="text-[11px] font-medium text-neutral-600">
                            Bracket style
                        </span>
                        <div className="mt-1.5 grid grid-cols-3 gap-1">
                            {BRACKET_STYLES.map((b) => {
                                const active = m.bracketStyle === b.value;
                                return (
                                    <button
                                        key={b.value}
                                        type="button"
                                        onClick={() =>
                                            setMount({ bracketStyle: b.value })
                                        }
                                        aria-pressed={active}
                                        className={`min-h-[36px] rounded-md px-1 py-2 text-[11px] font-medium transition-colors ${
                                            active
                                                ? 'text-white'
                                                : 'bg-neutral-100 text-neutral-500 hover:bg-neutral-200'
                                        }`}
                                        style={
                                            active
                                                ? { background: ACCENT }
                                                : undefined
                                        }
                                    >
                                        {b.label}
                                    </button>
                                );
                            })}
                        </div>
                        <span className="mt-1 block text-[10px] text-neutral-400">
                            Bought-in — box-arm is the sturdy default.
                        </span>
                    </div>
                </Section>
            )}

            <Section title="Panel dimensions" step={1}>
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

            <Section title="Material spec" step={2} defaultOpen={false}>
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

            <Section title="Illumination" defaultOpen={false}>
                <p className="text-[10px] text-neutral-500">
                    Records the lighting built into the sign. Toggle the
                    dark view in the preview header to see it lit.
                </p>

                {/* Keyline illumination — LEDs behind the opal
                    push-through backing; light diffuses and escapes
                    through the keyline shoulder as a halo. */}
                {(() => {
                    const kl = params.illumination?.keyline ?? {
                        enabled: false,
                        color: '#ffffff',
                        intensity: 1,
                    };
                    const setKeyline = (
                        patch: Partial<typeof kl>,
                    ) =>
                        setParam('illumination', {
                            ...params.illumination,
                            keyline: { ...kl, ...patch },
                        });
                    return (
                        <div className="space-y-2">
                            <button
                                type="button"
                                onClick={() =>
                                    setKeyline({ enabled: !kl.enabled })
                                }
                                aria-pressed={kl.enabled}
                                className={`flex min-h-[36px] w-full items-center justify-between rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                                    kl.enabled
                                        ? 'text-white'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                                style={
                                    kl.enabled
                                        ? { background: ACCENT }
                                        : undefined
                                }
                            >
                                <span>Keyline halo</span>
                                <span className="text-[10px] uppercase tracking-wide">
                                    {kl.enabled ? 'On' : 'Off'}
                                </span>
                            </button>
                            <p className="text-[10px] text-neutral-400">
                                Backlit push-through letters — light
                                halos the keyline shoulder around each
                                letter. Needs a push-through group.
                            </p>

                            {kl.enabled && (
                                <>
                                    <div>
                                        <span className="text-[11px] font-medium text-neutral-600">
                                            Light colour
                                        </span>
                                        <div className="mt-1 flex items-center gap-2">
                                            <input
                                                type="color"
                                                value={kl.color}
                                                onChange={(e) =>
                                                    setKeyline({
                                                        color: e.target
                                                            .value,
                                                    })
                                                }
                                                className="h-11 w-14 cursor-pointer rounded border border-neutral-300 bg-white p-0.5"
                                                aria-label="Keyline light colour"
                                            />
                                            <input
                                                type="text"
                                                value={kl.color}
                                                onChange={(e) => {
                                                    const v =
                                                        e.target.value.trim();
                                                    if (
                                                        /^#[0-9a-fA-F]{6}$/.test(
                                                            v,
                                                        )
                                                    )
                                                        setKeyline({
                                                            color: v,
                                                        });
                                                }}
                                                className="flex-1 rounded-md border border-neutral-300 px-2 py-2 font-mono text-xs uppercase tracking-wide focus:border-black focus:outline-none"
                                                placeholder="#ffffff"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <div className="flex items-baseline justify-between">
                                            <span className="text-[11px] font-medium text-neutral-600">
                                                Brightness
                                            </span>
                                            <span className="text-[10px] tabular-nums text-neutral-400">
                                                {Math.round(
                                                    (kl.intensity ?? 1) *
                                                        100,
                                                )}
                                                %
                                            </span>
                                        </div>
                                        <input
                                            type="range"
                                            min={20}
                                            max={300}
                                            value={Math.round(
                                                (kl.intensity ?? 1) * 100,
                                            )}
                                            onChange={(e) =>
                                                setKeyline({
                                                    intensity:
                                                        Number(
                                                            e.target.value,
                                                        ) / 100,
                                                })
                                            }
                                            className="mt-1 h-1 w-full accent-black"
                                            aria-label="Keyline brightness"
                                        />
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })()}
            </Section>
        </div>
    );
}
