'use client';

import { useMemo, useState } from 'react';
import {
    QrCode,
    Nfc,
    Search,
    ExternalLink,
    Radio,
    Link2,
    Users,
    BarChart3,
    CalendarDays,
    ChevronRight,
    Copy,
    Check,
} from 'lucide-react';
import type { QrLink, QrLinksOverview } from '@/lib/qr-links/types';
import { QrAnalyticsPanel, StatCard } from './QrAnalyticsPanel';
import { AreaChart, AreaChartAxis, BreakdownBars, formatNumber } from './charts';

/**
 * QR Links overview — every managed QR / NFC link Lynx holds, with the same
 * scan analytics Lynx shows, in one place staff already have open.
 *
 * Layout is master/detail: the roll-up and the link list on the left, the
 * selected link's full analytics on the right. Selecting is client-side state
 * rather than a route param — the list is small, the analytics fetch is the
 * only real cost, and keeping it local means no full page transition between
 * links.
 */

type CarrierFilter = 'all' | 'qr' | 'nfc';
type StatusFilter = 'all' | 'active' | 'inactive';

export function QrLinksClient({
    links,
    overview,
    redirectBase,
}: {
    links: QrLink[];
    overview: QrLinksOverview | null;
    redirectBase: string;
}) {
    const [selectedId, setSelectedId] = useState<string | null>(links[0]?.id ?? null);
    const [search, setSearch] = useState('');
    const [carrier, setCarrier] = useState<CarrierFilter>('all');
    const [status, setStatus] = useState<StatusFilter>('all');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return links.filter((l) => {
            if (status === 'active' && !l.is_active) return false;
            if (status === 'inactive' && l.is_active) return false;
            if (carrier === 'nfc' && l.carrier === 'qr') return false;
            if (carrier === 'qr' && l.carrier === 'nfc') return false;
            if (!q) return true;
            return (
                l.name.toLowerCase().includes(q) ||
                (l.slug ?? '').toLowerCase().includes(q) ||
                l.destination_url.toLowerCase().includes(q) ||
                (l.org_name ?? '').toLowerCase().includes(q)
            );
        });
    }, [links, search, carrier, status]);

    // Keep the detail pane honest: if filters hide the selection, follow the list.
    const selected = filtered.find((l) => l.id === selectedId) ?? filtered[0] ?? null;

    return (
        <div className="space-y-5">
            {overview && <OverviewSection overview={overview} />}

            <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,380px)_minmax(0,1fr)]">
                {/* ── Link list ── */}
                <div className="space-y-3">
                    <div className="relative">
                        <Search
                            size={15}
                            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--fg-subtle)]"
                        />
                        <input
                            type="search"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search links, slugs or clients…"
                            aria-label="Search QR links"
                            className="w-full rounded-[var(--radius-sm)] border border-[var(--card-border)] bg-[var(--card)] py-2 pl-9 pr-3 text-sm text-[var(--fg)] placeholder:text-[var(--fg-subtle)] focus:border-[var(--accent)] focus:outline-none"
                        />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <FilterGroup
                            value={carrier}
                            onChange={setCarrier}
                            options={[
                                { value: 'all', label: 'All' },
                                { value: 'qr', label: 'QR' },
                                { value: 'nfc', label: 'NFC' },
                            ]}
                        />
                        <FilterGroup
                            value={status}
                            onChange={setStatus}
                            options={[
                                { value: 'all', label: 'Any status' },
                                { value: 'active', label: 'Live' },
                                { value: 'inactive', label: 'Paused' },
                            ]}
                        />
                    </div>

                    <p className="text-xs text-[var(--fg-subtle)]">
                        {filtered.length} of {links.length} link{links.length === 1 ? '' : 's'}
                    </p>

                    {filtered.length === 0 ? (
                        <div className="card-base">
                            <p className="py-8 text-center text-sm text-[var(--fg-muted)]">
                                No links match those filters.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {filtered.map((link) => (
                                <LinkRow
                                    key={link.id}
                                    link={link}
                                    redirectBase={redirectBase}
                                    selected={selected?.id === link.id}
                                    onSelect={() => setSelectedId(link.id)}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* ── Detail ── */}
                <div className="min-w-0">
                    {selected ? (
                        <div className="space-y-4">
                            <LinkHeader link={selected} redirectBase={redirectBase} />
                            <QrAnalyticsPanel link={selected} />
                        </div>
                    ) : (
                        <div className="card-base">
                            <p className="py-12 text-center text-sm text-[var(--fg-muted)]">
                                Select a link to see its analytics.
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Overview ────────────────────────────────────────────────────────

function OverviewSection({ overview }: { overview: QrLinksOverview }) {
    const hasScans = overview.scans_by_day.some((d) => d.count > 0);

    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <StatCard
                    label="Active links"
                    value={overview.active_links}
                    icon={<Link2 size={14} />}
                    sublabel={`${formatNumber(overview.total_links)} total · ${formatNumber(overview.nfc_links)} NFC`}
                />
                <StatCard
                    label="Total scans"
                    value={overview.total_scans}
                    icon={<BarChart3 size={14} />}
                    sublabel="lifetime, all links"
                />
                <StatCard
                    label="Last 30 days"
                    value={overview.scans_this_month}
                    icon={<CalendarDays size={14} />}
                    sublabel={`${formatNumber(overview.scans_today)} today · ${formatNumber(overview.scans_this_week)} this week`}
                />
                <StatCard
                    label="Unique visitors"
                    value={overview.unique_visitors}
                    icon={<Users size={14} />}
                    sublabel="last 30 days"
                />
            </div>

            {hasScans && (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
                    <div className="card-base">
                        <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">
                            All scans — last 30 days
                        </h3>
                        <AreaChart data={overview.scans_by_day} height={180} label="All scans, last 30 days" />
                        <AreaChartAxis data={overview.scans_by_day} />
                    </div>

                    <div className="card-base">
                        <h3 className="mb-4 text-sm font-medium text-[var(--fg)]">Busiest links</h3>
                        {overview.top_links.length === 0 ? (
                            <p className="py-4 text-center text-sm text-[var(--fg-muted)]">
                                No scans in the last 30 days
                            </p>
                        ) : (
                            <BreakdownBars
                                items={overview.top_links.slice(0, 6).map((l) => ({
                                    key: l.id,
                                    leading: (
                                        <span className="min-w-0 flex-1 truncate text-sm text-[var(--fg)]">
                                            {l.name}
                                        </span>
                                    ),
                                    count: l.count,
                                    fillLeading: true,
                                }))}
                            />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

// ─── List row ────────────────────────────────────────────────────────

function LinkRow({
    link,
    redirectBase,
    selected,
    onSelect,
}: {
    link: QrLink;
    redirectBase: string;
    selected: boolean;
    onSelect: () => void;
}) {
    const isNfc = link.carrier === 'nfc' || link.carrier === 'both';

    return (
        <button
            type="button"
            onClick={onSelect}
            aria-current={selected ? 'true' : undefined}
            className={`w-full rounded-[var(--radius-md)] border p-3 text-left transition-colors ${
                selected
                    ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,var(--card))]'
                    : 'border-[var(--card-border)] bg-[var(--card)] hover:border-[var(--accent)]'
            }`}
        >
            <div className="flex items-start gap-3">
                <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-sm)]"
                    style={{ background: 'color-mix(in srgb, var(--accent) 12%, var(--card))' }}
                >
                    {isNfc ? (
                        <Nfc size={16} className="text-[var(--accent)]" />
                    ) : (
                        <QrCode size={16} className="text-[var(--accent)]" />
                    )}
                </div>

                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--fg)]">
                            {link.name}
                        </p>
                        <StatusDot active={link.is_active} />
                    </div>

                    <p className="mt-0.5 truncate text-xs text-[var(--fg-subtle)]">
                        {link.mode === 'managed' && link.slug
                            ? `${stripProtocol(redirectBase)}/r/${link.slug}`
                            : stripProtocol(link.destination_url)}
                    </p>

                    <div className="mt-2 flex items-center gap-3 text-xs">
                        <span className="font-semibold tabular-nums text-[var(--fg)]">
                            {formatNumber(link.total_scans)}
                        </span>
                        <span className="text-[var(--fg-subtle)]">scans</span>
                        {link.org_name && (
                            <span className="min-w-0 truncate text-[var(--fg-subtle)]">
                                · {link.org_name}
                            </span>
                        )}
                    </div>
                </div>

                <ChevronRight
                    size={16}
                    className={selected ? 'text-[var(--accent)]' : 'text-[var(--fg-subtle)]'}
                />
            </div>
        </button>
    );
}

// ─── Detail header ───────────────────────────────────────────────────

function LinkHeader({ link, redirectBase }: { link: QrLink; redirectBase: string }) {
    const [copied, setCopied] = useState(false);
    const printed =
        link.mode === 'managed' && link.slug ? `${redirectBase}/r/${link.slug}` : link.destination_url;

    async function copy() {
        try {
            await navigator.clipboard.writeText(printed);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        } catch {
            // Clipboard blocked (insecure context or denied permission) — the URL
            // is on screen and selectable, so there is nothing to recover from.
        }
    }

    return (
        <div className="card-base">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-[var(--fg)]">{link.name}</h2>
                        <Badge>{link.mode === 'managed' ? 'Managed' : 'Direct'}</Badge>
                        <Badge>{carrierLabel(link.carrier)}</Badge>
                        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--fg-muted)]">
                            <StatusDot active={link.is_active} />
                            {link.is_active ? 'Live' : 'Paused'}
                        </span>
                    </div>

                    {link.org_name && (
                        <p className="mt-1 text-sm text-[var(--fg-muted)]">{link.org_name}</p>
                    )}

                    <dl className="mt-3 space-y-1.5 text-xs">
                        <div className="flex flex-wrap items-center gap-2">
                            <dt className="w-20 shrink-0 text-[var(--fg-subtle)]">
                                {link.mode === 'managed' ? 'Printed URL' : 'Encoded URL'}
                            </dt>
                            <dd className="flex min-w-0 items-center gap-1.5">
                                <code className="truncate text-[var(--fg)]">{printed}</code>
                                <button
                                    type="button"
                                    onClick={copy}
                                    aria-label="Copy URL"
                                    className="shrink-0 text-[var(--fg-subtle)] transition-colors hover:text-[var(--accent)]"
                                >
                                    {copied ? <Check size={13} /> : <Copy size={13} />}
                                </button>
                            </dd>
                        </div>

                        {/* Managed codes are the point of Lynx: the printed URL never
                            changes, the destination behind it does. Show both. */}
                        {link.mode === 'managed' && (
                            <div className="flex flex-wrap items-center gap-2">
                                <dt className="w-20 shrink-0 text-[var(--fg-subtle)]">Redirects to</dt>
                                <dd className="min-w-0 truncate">
                                    <a
                                        href={link.destination_url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 text-[var(--accent)] hover:underline"
                                    >
                                        <span className="truncate">{stripProtocol(link.destination_url)}</span>
                                        <ExternalLink size={11} className="shrink-0" />
                                    </a>
                                </dd>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center gap-2">
                            <dt className="w-20 shrink-0 text-[var(--fg-subtle)]">Last scan</dt>
                            <dd className="text-[var(--fg)]">
                                {link.last_scanned_at
                                    ? new Date(link.last_scanned_at).toLocaleString('en-GB', {
                                          dateStyle: 'medium',
                                          timeStyle: 'short',
                                      })
                                    : 'Never scanned'}
                            </dd>
                        </div>
                    </dl>
                </div>

                <a
                    href={printed}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="btn-secondary inline-flex shrink-0 items-center gap-2"
                >
                    <Radio size={14} />
                    Open link
                </a>
            </div>
        </div>
    );
}

// ─── Small bits ──────────────────────────────────────────────────────

function FilterGroup<T extends string>({
    value,
    onChange,
    options,
}: {
    value: T;
    onChange: (v: T) => void;
    options: Array<{ value: T; label: string }>;
}) {
    return (
        <div className="flex gap-1 rounded-[var(--radius-sm)] bg-[var(--surface-2)] p-1">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    onClick={() => onChange(o.value)}
                    aria-pressed={value === o.value}
                    className={`rounded-[calc(var(--radius-sm)-2px)] px-2.5 py-1 text-xs font-medium transition-colors ${
                        value === o.value
                            ? 'bg-[var(--card)] text-[var(--fg)] shadow-sm'
                            : 'text-[var(--fg-muted)] hover:text-[var(--fg)]'
                    }`}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

function StatusDot({ active }: { active: boolean }) {
    return (
        <span
            aria-hidden
            className="inline-block h-2 w-2 shrink-0 rounded-full"
            style={{ background: active ? 'var(--accent)' : 'var(--fg-subtle)' }}
        />
    );
}

function Badge({ children }: { children: React.ReactNode }) {
    return (
        <span
            className="rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--fg-muted)]"
            style={{ background: 'color-mix(in srgb, var(--accent) 10%, var(--card))' }}
        >
            {children}
        </span>
    );
}

function carrierLabel(carrier: string): string {
    if (carrier === 'nfc') return 'NFC';
    if (carrier === 'both') return 'QR + NFC';
    return 'QR';
}

function stripProtocol(url: string): string {
    return url.replace(/^https?:\/\//, '');
}
