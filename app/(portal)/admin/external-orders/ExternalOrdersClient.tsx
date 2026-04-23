'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/app/(portal)/components/ui';
import { createBrowserClient } from '@/lib/supabase';
import { formatDate, formatDateTime } from '@/lib/artwork/utils';
import { formatPence } from '@/lib/invoices/utils';
import { List, LayoutGrid, Search, X, Check, Play, Ban, Trash2 } from 'lucide-react';
import type { ExternalOrder, ExternalOrderSource, ExternalOrderStatus } from '@/lib/external-orders/types';
import {
    acknowledgeExternalOrder,
    markExternalOrderInProgress,
    completeExternalOrder,
    cancelExternalOrder,
    deleteExternalOrder,
} from '@/lib/external-orders/actions';

interface Props {
    orders: ExternalOrder[];
}

type SourceFilter = 'all' | ExternalOrderSource;
type StatusFilter = 'all' | 'open' | ExternalOrderStatus;
type DateFilter = 'all' | '7d' | '30d' | '90d';

function daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
}
const DATE_CUTOFFS: Record<DateFilter, Date | null> = {
    all: null, '7d': daysAgo(7), '30d': daysAgo(30), '90d': daysAgo(90),
};

const SOURCE_LABEL: Record<ExternalOrderSource, string> = {
    persimmon: 'Persimmon',
    mapleleaf: 'Mapleleaf',
    lynx: 'Lynx',
    other: 'Other',
};

const SOURCE_CHIP: Record<ExternalOrderSource, string> = {
    persimmon: 'bg-blue-100 text-blue-800',
    mapleleaf: 'bg-red-100 text-red-800',
    lynx: 'bg-purple-100 text-purple-800',
    other: 'bg-neutral-100 text-neutral-700',
};

const STATUS_LABEL: Record<ExternalOrderStatus, string> = {
    new: 'new',
    acknowledged: 'acknowledged',
    in_progress: 'in progress',
    converted: 'converted',
    completed: 'completed',
    cancelled: 'cancelled',
};

const STATUS_CHIP: Record<ExternalOrderStatus, { chip: string; card: string; dot: string }> = {
    new: { chip: 'bg-orange-600 text-white', card: 'border-orange-300 bg-orange-50', dot: 'bg-orange-500' },
    acknowledged: { chip: 'bg-amber-100 text-amber-900', card: '', dot: 'bg-amber-400' },
    in_progress: { chip: 'bg-blue-100 text-blue-900', card: 'border-blue-200 bg-blue-50', dot: 'bg-blue-500' },
    converted: { chip: 'bg-teal-600 text-white', card: '', dot: 'bg-teal-500' },
    completed: { chip: 'bg-green-600 text-white', card: '', dot: 'bg-green-500' },
    cancelled: { chip: 'bg-neutral-200 text-neutral-500', card: 'opacity-60', dot: 'bg-neutral-300' },
};

export function ExternalOrdersClient({ orders }: Props) {
    const router = useRouter();
    const sp = useSearchParams();

    const [status, setStatus] = useState<StatusFilter>((sp.get('status') as StatusFilter) || 'open');
    const [source, setSource] = useState<SourceFilter>((sp.get('source') as SourceFilter) || 'all');
    const [dateRange, setDateRange] = useState<DateFilter>((sp.get('date') as DateFilter) || 'all');
    const [search, setSearch] = useState(sp.get('q') || '');
    const [compact, setCompact] = useState(sp.get('view') === 'compact');

    const supabase = useMemo(() => createBrowserClient(), []);
    const [isPending, startTransition] = useTransition();

    // Live updates — re-fetch the list whenever external_orders OR any
    // upstream source table changes (psp_orders for Persimmon today).
    useEffect(() => {
        const channel = supabase
            .channel('external-orders-live')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'external_orders' },
                () => router.refresh())
            .on('postgres_changes', { event: '*', schema: 'public', table: 'psp_orders' },
                () => router.refresh())
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [router, supabase]);

    // URL persistence
    useEffect(() => {
        const p = new URLSearchParams();
        if (status !== 'open') p.set('status', status);
        if (source !== 'all') p.set('source', source);
        if (dateRange !== 'all') p.set('date', dateRange);
        if (search.trim()) p.set('q', search.trim());
        if (compact) p.set('view', 'compact');
        const qs = p.toString();
        router.replace(qs ? `/admin/external-orders?${qs}` : '/admin/external-orders', { scroll: false });
    }, [router, status, source, dateRange, search, compact]);

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: orders.length, open: 0 };
        for (const st of ['new', 'acknowledged', 'in_progress', 'converted', 'completed', 'cancelled']) c[st] = 0;
        for (const o of orders) {
            c[o.status] = (c[o.status] ?? 0) + 1;
            if (['new', 'acknowledged', 'in_progress'].includes(o.status)) c.open++;
        }
        return c;
    }, [orders]);

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        const cutoff = DATE_CUTOFFS[dateRange];
        return orders.filter((o) => {
            if (status !== 'all') {
                if (status === 'open') {
                    if (!['new', 'acknowledged', 'in_progress'].includes(o.status)) return false;
                } else if (o.status !== status) return false;
            }
            if (source !== 'all' && o.source_app !== source) return false;
            if (cutoff && new Date(o.placed_at) < cutoff) return false;
            if (s) {
                const hay = [
                    o.client_name, o.client_email, o.external_ref,
                    o.item_summary, o.site_address, o.site_postcode, o.notes,
                ].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(s)) return false;
            }
            return true;
        });
    }, [orders, status, source, dateRange, search]);

    const statusChips: Array<{ key: StatusFilter; label: string; count: number; className: string }> = [
        { key: 'all', label: 'all', count: counts.all ?? 0, className: 'bg-neutral-900 text-white' },
        { key: 'open', label: 'needs action', count: counts.open ?? 0, className: 'bg-orange-600 text-white' },
        { key: 'new', label: 'new', count: counts.new ?? 0, className: 'bg-orange-100 text-orange-900' },
        { key: 'acknowledged', label: 'acknowledged', count: counts.acknowledged ?? 0, className: 'bg-amber-100 text-amber-900' },
        { key: 'in_progress', label: 'in progress', count: counts.in_progress ?? 0, className: 'bg-blue-100 text-blue-900' },
        { key: 'completed', label: 'completed', count: counts.completed ?? 0, className: 'bg-green-100 text-green-900' },
        { key: 'cancelled', label: 'cancelled', count: counts.cancelled ?? 0, className: 'bg-neutral-100 text-neutral-500' },
    ];

    const clearFilters = () => {
        setStatus('open'); setSource('all'); setDateRange('all'); setSearch('');
    };

    const act = (fn: () => Promise<unknown>) => startTransition(async () => {
        await fn();
        router.refresh();
    });

    return (
        <>
            {/* Filter chips */}
            <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {statusChips.map((c) => {
                        const active = status === c.key;
                        return (
                            <button
                                key={c.key}
                                type="button"
                                onClick={() => setStatus(c.key)}
                                className={`text-[11px] font-semibold uppercase tracking-wider px-2 py-1 rounded transition-colors ${
                                    active ? c.className : 'bg-white border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                                }`}
                            >
                                {c.label} <span className="ml-1 opacity-75">{c.count}</span>
                            </button>
                        );
                    })}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                    <div className="inline-flex rounded border border-neutral-200 bg-white overflow-hidden text-xs">
                        {(['all', 'persimmon', 'mapleleaf', 'lynx', 'other'] as SourceFilter[]).map((s) => (
                            <button
                                key={s}
                                type="button"
                                onClick={() => setSource(s)}
                                className={`px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
                                    source === s ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                            >
                                {s === 'all' ? 'all sources' : SOURCE_LABEL[s as ExternalOrderSource]}
                            </button>
                        ))}
                    </div>

                    <div className="inline-flex rounded border border-neutral-200 bg-white overflow-hidden text-xs">
                        {(['all', '7d', '30d', '90d'] as DateFilter[]).map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDateRange(d)}
                                className={`px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
                                    dateRange === d ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                            >
                                {d === 'all' ? 'all time' : `last ${d}`}
                            </button>
                        ))}
                    </div>

                    <div className="flex-1 min-w-[200px] relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="search client, ref, item, postcode…"
                            className="w-full pl-8 pr-8 py-1.5 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400"
                        />
                        {search && (
                            <button type="button" onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                                aria-label="Clear search"><X size={14} /></button>
                        )}
                    </div>

                    <div className="inline-flex rounded border border-neutral-200 bg-white overflow-hidden">
                        <button type="button" onClick={() => setCompact(false)} title="Detailed cards" aria-pressed={!compact}
                            className={`px-2.5 py-1.5 transition-colors ${!compact ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>
                            <LayoutGrid size={14} />
                        </button>
                        <button type="button" onClick={() => setCompact(true)} title="Compact rows" aria-pressed={compact}
                            className={`px-2.5 py-1.5 transition-colors ${compact ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>
                            <List size={14} />
                        </button>
                    </div>
                </div>

                <div className="text-xs text-neutral-500">
                    showing <span className="font-semibold text-neutral-800">{filtered.length}</span> of {counts.all}
                    <span className="ml-3 text-[10px] text-neutral-400" title="Live via Supabase Realtime">● live</span>
                    {(status !== 'open' || source !== 'all' || dateRange !== 'all' || search) && (
                        <button type="button" onClick={clearFilters} className="ml-3 text-[#4e7e8c] hover:underline">
                            reset to needs-action
                        </button>
                    )}
                </div>
            </div>

            {filtered.length === 0 ? (
                <Card>
                    <p className="text-sm text-neutral-500 text-center py-8">
                        No external orders match the current filters.
                    </p>
                </Card>
            ) : compact ? (
                <CompactList rows={filtered} onAct={act} isPending={isPending} />
            ) : (
                <DetailedList rows={filtered} onAct={act} isPending={isPending} />
            )}
        </>
    );
}

type ActRunner = (fn: () => Promise<unknown>) => void;

function OrderActions({ o, onAct, isPending }: { o: ExternalOrder; onAct: ActRunner; isPending: boolean }) {
    return (
        <div className="flex flex-wrap items-center gap-2">
            {o.status === 'new' && (
                <button type="button" disabled={isPending}
                    onClick={() => onAct(() => acknowledgeExternalOrder(o.id))}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded border border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100 inline-flex items-center gap-1">
                    <Check size={12} /> acknowledge
                </button>
            )}
            {(o.status === 'new' || o.status === 'acknowledged') && (
                <button type="button" disabled={isPending}
                    onClick={() => onAct(() => markExternalOrderInProgress(o.id))}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded border border-blue-200 bg-blue-50 text-blue-900 hover:bg-blue-100 inline-flex items-center gap-1">
                    <Play size={12} /> in progress
                </button>
            )}
            {o.status !== 'completed' && o.status !== 'cancelled' && (
                <button type="button" disabled={isPending}
                    onClick={() => onAct(() => completeExternalOrder(o.id))}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded border border-green-200 bg-green-50 text-green-900 hover:bg-green-100 inline-flex items-center gap-1">
                    <Check size={12} /> mark complete
                </button>
            )}
            {o.status !== 'cancelled' && o.status !== 'completed' && (
                <button type="button" disabled={isPending}
                    onClick={() => {
                        const reason = window.prompt('Reason for cancelling (optional):') ?? '';
                        onAct(() => cancelExternalOrder(o.id, reason));
                    }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded border border-neutral-200 bg-white text-neutral-600 hover:bg-neutral-50 inline-flex items-center gap-1">
                    <Ban size={12} /> cancel
                </button>
            )}
            {(o.status === 'cancelled' || o.status === 'completed') && (
                <button type="button" disabled={isPending}
                    onClick={() => {
                        if (!window.confirm('Delete this order permanently? (super-admin only)')) return;
                        onAct(() => deleteExternalOrder(o.id));
                    }}
                    className="text-xs font-semibold px-2.5 py-1.5 rounded border border-red-200 bg-white text-red-600 hover:bg-red-50 inline-flex items-center gap-1">
                    <Trash2 size={12} /> delete
                </button>
            )}
        </div>
    );
}

function CompactList({ rows, onAct, isPending }: { rows: ExternalOrder[]; onAct: ActRunner; isPending: boolean }) {
    return (
        <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
            <div className="grid grid-cols-[1fr_110px_130px_90px_100px_auto] gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <div>Client / Item</div>
                <div>Source</div>
                <div>Status</div>
                <div>Placed</div>
                <div className="text-right">Total</div>
                <div className="text-right pr-1">Actions</div>
            </div>
            {rows.map((o) => {
                const st = STATUS_CHIP[o.status];
                return (
                    <div key={o.id} className="grid grid-cols-[1fr_110px_130px_90px_100px_auto] gap-2 px-3 py-2.5 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 items-center text-sm">
                        <div className="min-w-0 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} aria-hidden />
                            <div className="min-w-0">
                                <div className="font-semibold text-neutral-900 truncate">{o.client_name ?? '— no client —'}</div>
                                <div className="text-[11px] text-neutral-500 truncate">
                                    {o.external_ref && <span className="font-mono">{o.external_ref} · </span>}
                                    {o.item_summary ?? ''}
                                </div>
                            </div>
                        </div>
                        <div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${SOURCE_CHIP[o.source_app]}`}>
                                {SOURCE_LABEL[o.source_app]}
                            </span>
                        </div>
                        <div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${st.chip}`}>
                                {STATUS_LABEL[o.status]}
                            </span>
                        </div>
                        <div className="text-xs text-neutral-500">{formatDate(o.placed_at)}</div>
                        <div className="text-xs text-neutral-700 text-right font-mono">
                            {o.total_pence != null ? formatPence(o.total_pence) : '—'}
                        </div>
                        <div className="text-right"><OrderActions o={o} onAct={onAct} isPending={isPending} /></div>
                    </div>
                );
            })}
        </div>
    );
}

function DetailedList({ rows, onAct, isPending }: { rows: ExternalOrder[]; onAct: ActRunner; isPending: boolean }) {
    return (
        <div className="space-y-3">
            {rows.map((o) => {
                const st = STATUS_CHIP[o.status];
                return (
                    <Card key={o.id} className={st.card}>
                        <div className="flex flex-wrap items-start gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <h3 className="font-semibold text-base text-neutral-900">
                                        {o.client_name ?? <span className="text-neutral-400 italic">no client name</span>}
                                    </h3>
                                    {o.external_ref && (
                                        <span className="text-[11px] font-mono text-neutral-400">{o.external_ref}</span>
                                    )}
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${SOURCE_CHIP[o.source_app]}`}>
                                        {SOURCE_LABEL[o.source_app]}
                                    </span>
                                </div>
                                <div className="text-xs text-neutral-500 mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
                                    {o.client_email && <span>{o.client_email}</span>}
                                    {o.client_phone && <span>{o.client_phone}</span>}
                                    {o.site_postcode && <span>📍 {o.site_postcode}</span>}
                                </div>
                            </div>
                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded ${st.chip}`}>
                                {STATUS_LABEL[o.status]}
                            </span>
                        </div>

                        {o.item_summary && (
                            <div className="mb-3 p-3 rounded border border-neutral-200 bg-neutral-50">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1">Order</div>
                                <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">{o.item_summary}</p>
                                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
                                    {o.item_count != null && <span>{o.item_count} item{o.item_count !== 1 ? 's' : ''}</span>}
                                    {o.total_pence != null && <span className="font-semibold">{formatPence(o.total_pence)}</span>}
                                </div>
                            </div>
                        )}

                        {o.site_address && (
                            <div className="mb-3 text-xs text-neutral-600">
                                <span className="font-semibold text-neutral-700">Site: </span>
                                <span className="whitespace-pre-wrap">{o.site_address}</span>
                            </div>
                        )}

                        {o.notes && (
                            <div className="mb-3 p-2.5 rounded border border-amber-200 bg-amber-50 text-xs text-amber-900 whitespace-pre-wrap">
                                {o.notes}
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                            <span>
                                placed {formatDateTime(o.placed_at)}
                                {o.acknowledged_at && <> · acknowledged {formatDate(o.acknowledged_at)}</>}
                            </span>
                            <OrderActions o={o} onAct={onAct} isPending={isPending} />
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
