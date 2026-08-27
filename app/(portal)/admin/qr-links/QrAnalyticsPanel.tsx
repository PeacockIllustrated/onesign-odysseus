'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { BarChart3, Users, CalendarDays, Smartphone, Loader2, EyeOff } from 'lucide-react';
import { getQrLinkAnalytics } from '@/lib/qr-links/actions';
import type { QrAnalyticsSummary, QrLink, QrPeriod } from '@/lib/qr-links/types';
import {
    AreaChart,
    AreaChartAxis,
    DonutChart,
    BreakdownBars,
    seriesColor,
    formatNumber,
    formatScanTime,
    countryCodeToFlag,
} from './charts';

/**
 * The per-link analytics view — the same panel Lynx shows its own users
 * (stat cards → scans over time → countries + devices → OS + browsers →
 * referrers → recent scans), rebuilt in the Odysseus design system.
 *
 * Read-only by design: managing the link itself stays in Lynx (see
 * `lib/qr-links/client.ts`). What this gives the office is the overview
 * without a second login.
 */

const PERIODS: Array<{ value: QrPeriod; label: string }> = [
    { value: '7d', label: 'Last 7 days' },
    { value: '30d', label: 'Last 30 days' },
    { value: '90d', label: 'Last 90 days' },
];

export function QrAnalyticsPanel({ link }: { link: QrLink }) {
    const [data, setData] = useState<QrAnalyticsSummary | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<QrPeriod>('30d');
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        let cancelled = false;

        startTransition(async () => {
            const res = await getQrLinkAnalytics({ qrId: link.id, period });
            if (cancelled) return;
            if (!res.ok) {
                setError(res.error);
                setData(null);
            } else {
                setError(null);
                setData(res.data);
            }
        });

        return () => {
            cancelled = true;
        };
        // Re-fetch when the selected link or window changes.
    }, [link.id, period]);

    const hasScans = useMemo(
        () => Boolean(data?.scans_by_day.some((d) => d.count > 0)),
        [data]
    );

    const deviceTotal = useMemo(
        () => data?.top_devices.reduce((n, d) => n + d.count, 0) ?? 0,
        [data]
    );

    if (!data && !error) return <PanelSkeleton />;

    if (error) {
        return (
            <div className="card-base">
                <p className="py-8 text-center text-sm text-[var(--fg-muted)]">{error}</p>
            </div>
        );
    }

    if (!data) return null;

    return (
        <div className="space-y-4">
            {/* Window selector */}
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-[var(--fg)]">Analytics</h2>
                    {pending && (
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-subtle)]">
                            <Loader2 size={12} className="animate-spin" />
                            Updating…
                        </span>
                    )}
                </div>
                <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-1">
                    {PERIODS.map((p) => (
                        <button
                            key={p.value}
                            type="button"
                            onClick={() => setPeriod(p.value)}
                            aria-pressed={period === p.value}
                            className={`rounded-[calc(var(--radius-sm)-2px)] px-3 py-1.5 text-xs font-medium transition-colors ${
                                period === p.value
                                    ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm'
                                    : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                            }`}
                        >
                            {p.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Analytics can be switched off per-link in Lynx. Say so plainly, or a
                flat chart reads as "nobody scanned it" rather than "we weren't counting". */}
            {!link.analytics_enabled && (
                <div className="flex items-start gap-2 rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-[var(--surface-2)] px-3 py-2.5 text-xs text-[var(--fg-muted)]">
                    <EyeOff size={14} className="mt-0.5 shrink-0" />
                    <span>
                        Scan tracking is switched off for this link in Lynx. The lifetime total still
                        counts, but no new scan detail is being recorded.
                    </span>
                </div>
            )}

            {/* Stat cards */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <StatCard label="Total scans" value={data.total_scans} icon={<BarChart3 size={14} />} sublabel="lifetime" />
                <StatCard label="Unique visitors" value={data.unique_visitors} icon={<Users size={14} />} sublabel="in window" />
                <StatCard label="Today" value={data.scans_today} icon={<CalendarDays size={14} />} />
                <StatCard label="This week" value={data.scans_this_week} icon={<CalendarDays size={14} />} />
            </div>

            {!hasScans ? (
                <div className="card-base">
                    <div className="py-10 text-center text-[var(--fg-muted)]">
                        <BarChart3 size={32} className="mx-auto mb-3 opacity-40" />
                        <p className="text-sm">No scans in the selected period yet.</p>
                        <p className="mt-1 text-xs text-[var(--fg-subtle)]">
                            Once the code is out in the wild, scans appear here.
                        </p>
                    </div>
                </div>
            ) : (
                <>
                    {/* Time series */}
                    <div className="card-base">
                        <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Scans over time</h3>
                        <AreaChart data={data.scans_by_day} />
                        <AreaChartAxis data={data.scans_by_day} />
                    </div>

                    {/* Countries + devices */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="card-base">
                            <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Top countries</h3>
                            {data.top_countries.length === 0 ? (
                                <EmptyHint>No country data yet</EmptyHint>
                            ) : (
                                <BreakdownBars
                                    items={data.top_countries.slice(0, 8).map((c) => ({
                                        key: c.country,
                                        leading: (
                                            <>
                                                <span className="w-7 shrink-0 text-center text-base">
                                                    {countryCodeToFlag(c.country)}
                                                </span>
                                                <span className="w-8 shrink-0 text-xs font-medium uppercase text-[var(--fg-muted)]">
                                                    {c.country}
                                                </span>
                                            </>
                                        ),
                                        count: c.count,
                                    }))}
                                />
                            )}
                        </div>

                        <div className="card-base">
                            <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Devices</h3>
                            {data.top_devices.length === 0 ? (
                                <EmptyHint>No device data yet</EmptyHint>
                            ) : (
                                <div className="flex flex-col items-center">
                                    <DonutChart
                                        data={data.top_devices.map((d) => ({ name: d.device, value: d.count }))}
                                    />
                                    <div className="mt-3 flex flex-wrap justify-center gap-x-4 gap-y-1.5">
                                        {data.top_devices.map((d, i) => (
                                            <div key={d.device} className="flex items-center gap-1.5 text-xs">
                                                <span
                                                    className="h-2.5 w-2.5 rounded-full"
                                                    style={{ background: seriesColor(i) }}
                                                />
                                                <span className="capitalize text-[var(--fg)]">{d.device}</span>
                                                <span className="text-[var(--fg-subtle)]">
                                                    {deviceTotal > 0
                                                        ? `${Math.round((d.count / deviceTotal) * 100)}%`
                                                        : '0%'}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* OS + browsers */}
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <div className="card-base">
                            <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Operating systems</h3>
                            {data.top_os.length === 0 ? (
                                <EmptyHint>No OS data yet</EmptyHint>
                            ) : (
                                <BreakdownBars
                                    items={data.top_os.slice(0, 6).map((o) => ({
                                        key: o.os,
                                        leading: (
                                            <span className="w-20 shrink-0 truncate text-sm text-[var(--fg)]">
                                                {o.os}
                                            </span>
                                        ),
                                        count: o.count,
                                    }))}
                                />
                            )}
                        </div>

                        <div className="card-base">
                            <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Browsers</h3>
                            {data.top_browsers.length === 0 ? (
                                <EmptyHint>No browser data yet</EmptyHint>
                            ) : (
                                <BreakdownBars
                                    items={data.top_browsers.slice(0, 6).map((b) => ({
                                        key: b.browser,
                                        leading: (
                                            <span className="w-20 shrink-0 truncate text-sm text-[var(--fg)]">
                                                {b.browser}
                                            </span>
                                        ),
                                        count: b.count,
                                    }))}
                                />
                            )}
                        </div>
                    </div>

                    {/* Referrers */}
                    <div className="card-base">
                        <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Top referrers</h3>
                        {data.top_referrers.length === 0 ? (
                            <EmptyHint>
                                No referrer data — most scans came from camera apps, not links
                            </EmptyHint>
                        ) : (
                            <BreakdownBars
                                items={data.top_referrers.slice(0, 8).map((r) => ({
                                    key: r.domain,
                                    leading: (
                                        <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]">
                                            {r.domain}
                                        </span>
                                    ),
                                    count: r.count,
                                    fillLeading: true,
                                }))}
                            />
                        )}
                    </div>

                    {/* Recent scans */}
                    <div className="card-base">
                        <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Recent scans</h3>
                        {data.recent_scans.length === 0 ? (
                            <EmptyHint>No recent scans</EmptyHint>
                        ) : (
                            <div className="-my-1">
                                {data.recent_scans.map((scan, i) => (
                                    <div
                                        key={`${scan.scanned_at}-${i}`}
                                        className="flex items-center gap-3 border-b border-[var(--card-border)] py-2 text-sm last:border-b-0"
                                    >
                                        <span className="w-20 shrink-0 text-xs tabular-nums text-[var(--fg-subtle)]">
                                            {formatScanTime(scan.scanned_at)}
                                        </span>
                                        <span className="w-6 shrink-0 text-base">
                                            {countryCodeToFlag(scan.country_code)}
                                        </span>
                                        <span className="flex shrink-0 items-center gap-1 text-xs capitalize text-[var(--fg-muted)]">
                                            <Smartphone size={12} />
                                            {scan.device_type}
                                        </span>
                                        <span className="min-w-0 flex-1 truncate text-xs text-[var(--fg-muted)]">
                                            {[scan.os_family, scan.browser_family].filter(Boolean).join(' · ') || '—'}
                                        </span>
                                        {scan.referrer_domain && (
                                            <span className="hidden max-w-[140px] shrink-0 truncate text-xs text-[var(--fg-subtle)] sm:block">
                                                from {scan.referrer_domain}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// ─── Sub-components ──────────────────────────────────────────────────

export function StatCard({
    label,
    value,
    icon,
    sublabel,
}: {
    label: string;
    value: number;
    icon: React.ReactNode;
    sublabel?: string;
}) {
    return (
        <div className="rounded-[var(--radius-md)] border border-[var(--card-border)] bg-[var(--card)] p-3">
            <div className="flex items-center gap-1.5 text-[var(--fg-muted)]">
                {icon}
                <span className="text-xs">{label}</span>
            </div>
            <p className="mt-1 text-xl font-bold tabular-nums text-[var(--fg)]">{formatNumber(value)}</p>
            {sublabel && <p className="text-[11px] text-[var(--fg-subtle)]">{sublabel}</p>}
        </div>
    );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
    return <p className="py-4 text-center text-sm text-[var(--fg-muted)]">{children}</p>;
}

function PanelSkeleton() {
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-[76px] animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-2)]" />
                ))}
            </div>
            <div className="h-[280px] animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-2)]" />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="h-[220px] animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-2)]" />
                <div className="h-[220px] animate-pulse rounded-[var(--radius-md)] bg-[var(--surface-2)]" />
            </div>
        </div>
    );
}
