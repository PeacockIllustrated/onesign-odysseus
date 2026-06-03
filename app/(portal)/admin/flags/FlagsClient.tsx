'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase';
import { Card } from '@/app/(portal)/components/ui';
import { formatDateTime } from '@/lib/artwork/utils';
import { AlertTriangle, Check, X, ExternalLink } from 'lucide-react';
import {
    type ShopFloorFlagRow,
    resolveShopFloorFlag,
} from '@/lib/production/shop-floor-actions';

interface Props {
    rows: ShopFloorFlagRow[];
}

type StatusFilter = 'open' | 'resolved' | 'all';

function timeSince(iso: string): string {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return 'just now';
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

export function FlagsClient({ rows }: Props) {
    const router = useRouter();
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
    const [actionError, setActionError] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    // Live inbox: refresh when a flag is raised or resolved (migration 064
    // publishes shop_floor_flags to Realtime).
    useEffect(() => {
        const supabase = createBrowserClient();
        const channel = supabase
            .channel('shop_floor_flags_inbox')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'shop_floor_flags' },
                () => router.refresh()
            )
            .subscribe();
        return () => { supabase.removeChannel(channel); };
    }, [router]);

    const counts = useMemo(() => {
        let open = 0;
        let resolved = 0;
        for (const r of rows) {
            if (r.status === 'open') open++;
            else resolved++;
        }
        return { open, resolved, total: rows.length };
    }, [rows]);

    const filtered = useMemo(() => {
        if (statusFilter === 'all') return rows;
        return rows.filter((r) => r.status === statusFilter);
    }, [rows, statusFilter]);

    const onResolve = (flagId: string) => {
        startTransition(async () => {
            setActionError(null);
            const res = await resolveShopFloorFlag({ flagId });
            if (!res.ok) setActionError(res.error);
            router.refresh();
        });
    };

    return (
        <>
            {/* Stat strip */}
            <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
                <span>
                    <span className="text-neutral-500">Open: </span>
                    <span
                        className={`font-semibold ${
                            counts.open > 0 ? 'text-orange-700' : 'text-neutral-400'
                        }`}
                    >
                        {counts.open}
                    </span>
                </span>
                <span>
                    <span className="text-neutral-500">Resolved (recent): </span>
                    <span className="font-semibold text-neutral-900">{counts.resolved}</span>
                </span>
            </div>

            {/* Status filter */}
            <div className="mb-4 inline-flex rounded border border-neutral-200 bg-white overflow-hidden text-xs">
                {(['open', 'resolved', 'all'] as StatusFilter[]).map((s) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setStatusFilter(s)}
                        className={`px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
                            statusFilter === s
                                ? 'bg-neutral-900 text-white'
                                : 'text-neutral-600 hover:bg-neutral-50'
                        }`}
                    >
                        {s} {s === 'open' && counts.open > 0 && (
                            <span className="ml-1 opacity-75">{counts.open}</span>
                        )}
                    </button>
                ))}
            </div>

            {actionError && (
                <div className="mb-3 p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700 flex items-start gap-2">
                    <span className="font-semibold">Action failed:</span>
                    <span className="flex-1">{actionError}</span>
                    <button
                        type="button"
                        onClick={() => setActionError(null)}
                        className="text-red-500 hover:text-red-700"
                    >
                        <X size={14} />
                    </button>
                </div>
            )}

            {filtered.length === 0 ? (
                <Card>
                    <p className="text-sm text-neutral-500 text-center py-8">
                        {statusFilter === 'open'
                            ? 'Nothing flagged. Shop floor is clear.'
                            : 'No flags match this filter.'}
                    </p>
                </Card>
            ) : (
                <div className="space-y-2">
                    {filtered.map((r) => (
                        <FlagCard
                            key={r.id}
                            row={r}
                            isPending={isPending}
                            onResolve={onResolve}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

function FlagCard({
    row,
    isPending,
    onResolve,
}: {
    row: ShopFloorFlagRow;
    isPending: boolean;
    onResolve: (flagId: string) => void;
}) {
    const isOpen = row.status === 'open';
    const borderClass = isOpen
        ? 'border-orange-300 bg-orange-50/40'
        : 'border-neutral-200 bg-white opacity-80';

    return (
        <div className={`border rounded-lg px-4 py-3 ${borderClass}`}>
            <div className="flex items-start gap-3">
                <span className="shrink-0 mt-0.5 text-orange-600">
                    <AlertTriangle size={18} />
                </span>
                <div className="flex-1 min-w-0">
                    {/* Header: client / job / item */}
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-neutral-900">
                            {row.jobItem?.clientName ?? '— no client —'}
                        </span>
                        {row.jobItem?.jobNumber && (
                            <span className="text-[11px] font-mono text-neutral-500">
                                {row.jobItem.jobNumber}
                            </span>
                        )}
                        {row.jobItem?.itemNumber && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-neutral-200 text-neutral-700">
                                Item {row.jobItem.itemNumber}
                            </span>
                        )}
                        {row.stage && (
                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-100 text-blue-900">
                                {row.stage.name}
                            </span>
                        )}
                        <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                isOpen
                                    ? 'bg-orange-600 text-white'
                                    : 'bg-green-100 text-green-900'
                            }`}
                        >
                            {row.status}
                        </span>
                    </div>

                    {/* Item description / sub-item */}
                    <div className="text-xs text-neutral-600 mt-1">
                        {row.jobItem?.description && <span>{row.jobItem.description}</span>}
                        {row.subItem && (
                            <span className="ml-2 text-neutral-500">
                                · sub-item:{' '}
                                <span className="font-medium text-neutral-700">
                                    {row.subItem.name ?? row.subItem.label}
                                </span>
                                {row.subItem.componentName && (
                                    <span className="text-neutral-400"> ({row.subItem.componentName})</span>
                                )}
                            </span>
                        )}
                    </div>

                    {/* Notes */}
                    <div className="mt-2 p-2.5 rounded border border-amber-200 bg-amber-50 text-sm text-amber-900 whitespace-pre-wrap">
                        {row.notes}
                    </div>

                    {/* Footer: who / when / actions */}
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-neutral-500">
                        <span>
                            reported {timeSince(row.reportedAt)} by{' '}
                            <span className="font-medium text-neutral-700">
                                {row.reportedByName ?? 'unknown'}
                            </span>
                            <span className="ml-2 text-neutral-400">
                                ({formatDateTime(row.reportedAt)})
                            </span>
                            {!isOpen && row.resolvedAt && (
                                <span className="ml-2">
                                    · resolved {timeSince(row.resolvedAt)}
                                </span>
                            )}
                        </span>
                        <div className="flex items-center gap-2">
                            {row.jobItem?.id && (
                                <Link
                                    href={`/admin/jobs?item=${row.jobItem.id}`}
                                    className="text-xs font-semibold px-2.5 py-1.5 rounded border border-neutral-200 bg-white text-neutral-700 hover:bg-neutral-50 inline-flex items-center gap-1"
                                >
                                    <ExternalLink size={12} /> open in board
                                </Link>
                            )}
                            {isOpen && (
                                <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => onResolve(row.id)}
                                    className="text-xs font-semibold px-2.5 py-1.5 rounded border border-green-200 bg-green-50 text-green-900 hover:bg-green-100 inline-flex items-center gap-1 disabled:opacity-50"
                                >
                                    <Check size={12} /> mark resolved
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
