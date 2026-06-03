'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Card, Chip, EmptyState } from '@/app/(portal)/components/ui';
import {
    DESIGN_REQUEST_STATUS_LABELS,
    type DesignRequestRow,
    type DesignRequestStatus,
} from '@/lib/design-requests/types';

const STATUS_CHIP: Record<
    DesignRequestStatus,
    'review' | 'scheduled' | 'approved' | 'done' | 'paused'
> = {
    new: 'review',
    reviewing: 'scheduled',
    quoted: 'approved',
    won: 'done',
    closed: 'paused',
};

type Filter = 'all' | DesignRequestStatus;

function timeAgo(iso: string): string {
    const then = new Date(iso).getTime();
    const mins = Math.round((Date.now() - then) / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString('en-GB');
}

export function DesignRequestsClient({
    requests,
}: {
    requests: DesignRequestRow[];
}) {
    const [filter, setFilter] = useState<Filter>('all');

    const counts = useMemo(() => {
        const c: Record<string, number> = { all: requests.length };
        for (const r of requests) c[r.status] = (c[r.status] ?? 0) + 1;
        return c;
    }, [requests]);

    const filtered = useMemo(
        () =>
            filter === 'all'
                ? requests
                : requests.filter((r) => r.status === filter),
        [requests, filter],
    );

    const tabs: Filter[] = [
        'all',
        'new',
        'reviewing',
        'quoted',
        'won',
        'closed',
    ];

    return (
        <div>
            {/* Filter tabs */}
            <div className="mb-4 flex flex-wrap gap-1.5">
                {tabs.map((t) => {
                    const active = filter === t;
                    const label =
                        t === 'all'
                            ? 'All'
                            : DESIGN_REQUEST_STATUS_LABELS[t];
                    const n = counts[t] ?? 0;
                    return (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setFilter(t)}
                            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                                active
                                    ? 'bg-[#4e7e8c] text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                        >
                            {label}
                            <span
                                className={`ml-1.5 tabular-nums ${
                                    active ? 'text-white/70' : 'text-neutral-400'
                                }`}
                            >
                                {n}
                            </span>
                        </button>
                    );
                })}
            </div>

            {filtered.length === 0 ? (
                <EmptyState
                    title="No design requests"
                    description={
                        filter === 'all'
                            ? 'When a customer sends a sign from the public studio, it lands here.'
                            : 'Nothing in this status right now.'
                    }
                />
            ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {filtered.map((r) => (
                        <Link
                            key={r.id}
                            href={`/admin/design-requests/${r.id}`}
                            className="block"
                        >
                            <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
                                <div className="flex h-28 items-center justify-center border-b border-neutral-100 bg-neutral-50">
                                    {r.thumbnail ? (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                            src={r.thumbnail}
                                            alt={r.params_json?.name ?? 'Design'}
                                            className="max-h-full max-w-full object-contain p-2"
                                        />
                                    ) : (
                                        <span className="text-xs text-neutral-300">
                                            No preview
                                        </span>
                                    )}
                                </div>
                                <div className="p-3">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="font-mono text-[11px] text-neutral-400">
                                            {r.reference}
                                        </span>
                                        <Chip variant={STATUS_CHIP[r.status]}>
                                            {DESIGN_REQUEST_STATUS_LABELS[
                                                r.status
                                            ]}
                                        </Chip>
                                    </div>
                                    <p className="mt-1 truncate text-sm font-semibold text-neutral-900">
                                        {r.customer_name}
                                        {r.company ? ` · ${r.company}` : ''}
                                    </p>
                                    <p className="truncate text-xs text-neutral-500">
                                        {r.sign_type ?? 'Sign'} ·{' '}
                                        {Math.round(
                                            r.params_json?.panelWidthMm ?? 0,
                                        )}
                                        ×
                                        {Math.round(
                                            r.params_json?.panelHeightMm ?? 0,
                                        )}
                                        mm
                                    </p>
                                    <p className="mt-1 text-[11px] text-neutral-400">
                                        {timeAgo(r.created_at)}
                                    </p>
                                </div>
                            </Card>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
