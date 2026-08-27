'use client';

import { useId } from 'react';

/**
 * Chart primitives for the QR Links analytics panel.
 *
 * These reproduce the *visuals* Lynx uses on its own QR analytics page — the
 * soft-filled area chart, the device donut, the ranked breakdown bars — but
 * drawn in the Odysseus design system rather than Lynx's lime-on-near-black
 * palette. That is the house rule (CLAUDE.md conventions, and the precedent
 * set by the fitting-schedule brief): take the layout and the interaction from
 * the source, drop its palette and typography, or the page reads as a foreign
 * object in the portal.
 *
 * Hand-rolled SVG rather than a charting library: Odysseus carries no chart
 * dependency today, these three shapes are the whole requirement, and drawing
 * them ourselves means every colour is a `var(--…)` token that follows the
 * theme toggle for free — the thing a library would fight us on.
 */

/** Series colours, derived from the brand accent so light/dark both hold up. */
const SERIES = [
    'var(--accent)',
    'color-mix(in srgb, var(--accent) 68%, var(--card))',
    'color-mix(in srgb, var(--accent) 44%, var(--card))',
    'color-mix(in srgb, var(--accent) 26%, var(--card))',
    'color-mix(in srgb, var(--accent) 14%, var(--card))',
];

export function seriesColor(i: number): string {
    return SERIES[i % SERIES.length];
}

export function formatNumber(n: number): string {
    return new Intl.NumberFormat('en-GB').format(n);
}

// ─── Area chart ──────────────────────────────────────────────────────

interface AreaChartProps {
    data: Array<{ date: string; count: number }>;
    height?: number;
    /** Accessible summary — the chart itself is decorative to a screen reader. */
    label?: string;
}

/**
 * Scans over time. Rendered in a fixed viewBox and stretched with
 * `preserveAspectRatio="none"`, so it fills any column width without needing a
 * resize observer; only the stroke is width-compensated (vector-effect).
 */
export function AreaChart({ data, height = 220, label = 'Scans over time' }: AreaChartProps) {
    const gradientId = useId();
    const W = 600;
    const H = 200;
    const PAD_TOP = 8;

    if (data.length === 0) return null;

    const max = Math.max(...data.map((d) => d.count), 1);
    const stepX = data.length > 1 ? W / (data.length - 1) : W;
    const y = (v: number) => PAD_TOP + (1 - v / max) * (H - PAD_TOP);

    const points = data.map((d, i) => [i * stepX, y(d.count)] as const);
    const line = points.map(([px, py], i) => `${i === 0 ? 'M' : 'L'}${px.toFixed(2)},${py.toFixed(2)}`).join(' ');
    const area = `${line} L${W},${H} L0,${H} Z`;

    // Four gridlines is enough to read a value off without becoming a table.
    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => PAD_TOP + t * (H - PAD_TOP));

    return (
        <div className="w-full" style={{ height }}>
            <svg
                viewBox={`0 0 ${W} ${H}`}
                preserveAspectRatio="none"
                className="h-full w-full overflow-visible"
                role="img"
                aria-label={`${label}. Peak ${formatNumber(max)} scans in a day.`}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
                    </linearGradient>
                </defs>

                {gridLines.map((gy, i) => (
                    <line
                        key={i}
                        x1={0}
                        x2={W}
                        y1={gy}
                        y2={gy}
                        stroke="var(--card-border)"
                        strokeWidth={1}
                        vectorEffect="non-scaling-stroke"
                    />
                ))}

                <path d={area} fill={`url(#${gradientId})`} />
                <path
                    d={line}
                    fill="none"
                    stroke="var(--accent)"
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                />
            </svg>
        </div>
    );
}

/**
 * X-axis labels for the area chart. Kept in HTML rather than inside the
 * stretched SVG, because `preserveAspectRatio="none"` would smear the text.
 */
export function AreaChartAxis({ data }: { data: Array<{ date: string; count: number }> }) {
    if (data.length === 0) return null;
    const ticks = [0, Math.floor(data.length / 2), data.length - 1];
    return (
        <div className="mt-2 flex justify-between text-[11px] text-[var(--fg-subtle)] tabular-nums">
            {ticks.map((i) => (
                <span key={i}>{formatDateTick(data[i].date)}</span>
            ))}
        </div>
    );
}

// ─── Donut ───────────────────────────────────────────────────────────

interface DonutChartProps {
    data: Array<{ name: string; value: number }>;
    size?: number;
}

/**
 * Device split. Drawn as stroked arcs on one circle (dash-offset technique)
 * rather than pie wedges — it keeps the ring a constant thickness and avoids
 * arc-path maths for the 100%-in-one-slice case, which is common early on.
 */
export function DonutChart({ data, size = 168 }: DonutChartProps) {
    const total = data.reduce((n, d) => n + d.value, 0);
    const radius = size / 2 - 14;
    const circumference = 2 * Math.PI * radius;

    if (total === 0) return null;

    // Each arc starts where the previous ones ended. Computed as a prefix sum
    // over the preceding slices rather than a running counter — a handful of
    // device buckets makes the quadratic walk free, and it keeps render pure.
    const arcs = data.map((d, i) => ({
        name: d.name,
        color: seriesColor(i),
        dash: (d.value / total) * circumference,
        offset: (data.slice(0, i).reduce((n, x) => n + x.value, 0) / total) * circumference,
    }));

    return (
        <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            role="img"
            aria-label={data.map((d) => `${d.name}: ${d.value}`).join(', ')}
        >
            <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
                {arcs.map((arc) => (
                    <circle
                        key={arc.name}
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="none"
                        stroke={arc.color}
                        strokeWidth={18}
                        strokeDasharray={`${arc.dash} ${circumference - arc.dash}`}
                        strokeDashoffset={-arc.offset}
                    />
                ))}
            </g>
            <text
                x="50%"
                y="50%"
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-[var(--fg)] text-base font-semibold"
                style={{ fontSize: 18 }}
            >
                {formatNumber(total)}
            </text>
        </svg>
    );
}

// ─── Breakdown bars ──────────────────────────────────────────────────

export interface BreakdownItem {
    key: string;
    leading: React.ReactNode;
    count: number;
    /** Let the label take the room and keep the bar short (used for referrers). */
    fillLeading?: boolean;
}

/** Ranked horizontal bars — the workhorse of the Lynx breakdowns. */
export function BreakdownBars({ items }: { items: BreakdownItem[] }) {
    const max = Math.max(...items.map((i) => i.count), 1);
    return (
        <div className="space-y-2">
            {items.map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                    {item.leading}
                    <div
                        className={`h-2 ${item.fillLeading ? 'w-20' : 'flex-1'} shrink-0 overflow-hidden rounded-full`}
                        style={{ background: 'color-mix(in srgb, var(--fg) 10%, transparent)' }}
                    >
                        <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${(item.count / max) * 100}%`, background: 'var(--accent)' }}
                        />
                    </div>
                    <span className="w-12 shrink-0 text-right text-sm font-medium tabular-nums text-[var(--fg)]">
                        {formatNumber(item.count)}
                    </span>
                </div>
            ))}
        </div>
    );
}

// ─── Shared formatters ───────────────────────────────────────────────

export function formatDateTick(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

/** Relative time for the recent-scans feed, matching Lynx's phrasing. */
export function formatScanTime(iso: string): string {
    const d = new Date(iso);
    const diffMs = Date.now() - d.getTime();
    const minute = 60_000;
    const hour = 60 * minute;
    const day = 24 * hour;

    if (diffMs < minute) return 'just now';
    if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
    if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
    if (diffMs < 7 * day) return `${Math.floor(diffMs / day)}d ago`;
    return d.toLocaleDateString('en-GB', { month: 'short', day: 'numeric' });
}

/** ISO-3166 alpha-2 → regional-indicator flag. Falls back to a globe. */
export function countryCodeToFlag(code: string | null): string {
    if (!code || code.length !== 2) return '🌍';
    return String.fromCodePoint(
        ...Array.from(code.toUpperCase()).map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
    );
}
