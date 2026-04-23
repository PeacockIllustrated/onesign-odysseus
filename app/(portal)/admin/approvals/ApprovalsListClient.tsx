'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Card } from '@/app/(portal)/components/ui';
import { formatDate, formatDateTime } from '@/lib/artwork/utils';
import { List, LayoutGrid, Search, X } from 'lucide-react';

export type EffectiveState =
    | 'pending'
    | 'expired'
    | 'revoked'
    | 'approved_clean'
    | 'approved_with_feedback'
    | 'changes_requested';

export interface LineFeedback {
    key: string;
    decision: 'approved' | 'changes_requested';
    comment: string;
    label: string;
    heading: string;
}

export interface ApprovalRow {
    id: string;
    state: EffectiveState;
    jobId: string;
    jobName: string;
    jobReference: string;
    isVisual: boolean;
    orgName: string | null;
    siteName: string | null;
    clientName: string | null;
    clientEmail: string | null;
    clientCompany: string | null;
    approvedAt: string | null;
    createdAt: string;
    expiresAt: string;
    clientComments: string | null;
    lineFeedback: LineFeedback[];
}

export interface ApprovalCounts {
    all: number;
    changesRequested: number;
    approvedWithFeedback: number;
    pending: number;
    approvedClean: number;
    expired: number;
    revoked: number;
}

interface Props {
    approvals: ApprovalRow[];
    counts: ApprovalCounts;
}

type StateFilter = 'all' | 'needs_action' | EffectiveState;
type TypeFilter = 'all' | 'visual' | 'production';
type DateFilter = 'all' | '7d' | '30d' | '90d';

function daysAgo(days: number): Date {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(0, 0, 0, 0);
    return d;
}

const DATE_CUTOFFS: Record<DateFilter, Date | null> = {
    all: null,
    '7d': daysAgo(7),
    '30d': daysAgo(30),
    '90d': daysAgo(90),
};

const STATE_LABEL: Record<EffectiveState, string> = {
    changes_requested: 'changes requested',
    approved_with_feedback: 'approved — feedback to action',
    pending: 'pending',
    expired: 'expired',
    approved_clean: 'approved',
    revoked: 'revoked',
};

function stateBadge(state: EffectiveState): { label: string; chip: string; card: string; dot: string } {
    switch (state) {
        case 'changes_requested':
            return { label: STATE_LABEL[state], chip: 'bg-orange-600 text-white', card: 'border-orange-300 bg-orange-50', dot: 'bg-orange-500' };
        case 'approved_with_feedback':
            return { label: STATE_LABEL[state], chip: 'bg-amber-600 text-white', card: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500' };
        case 'pending':
            return { label: STATE_LABEL[state], chip: 'bg-amber-100 text-amber-900', card: '', dot: 'bg-amber-400' };
        case 'expired':
            return { label: STATE_LABEL[state], chip: 'bg-neutral-200 text-neutral-600', card: 'opacity-70', dot: 'bg-neutral-300' };
        case 'revoked':
            return { label: STATE_LABEL[state], chip: 'bg-neutral-200 text-neutral-500', card: 'opacity-60', dot: 'bg-neutral-300' };
        case 'approved_clean':
            return { label: STATE_LABEL[state], chip: 'bg-green-600 text-white', card: '', dot: 'bg-green-500' };
    }
}

export function ApprovalsListClient({ approvals, counts }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // Initial filter state is hydrated from URL so a refresh or a linked
    // bookmark preserves exactly what the viewer was looking at.
    const initialState = (searchParams.get('state') as StateFilter) || 'all';
    const initialType = (searchParams.get('type') as TypeFilter) || 'all';
    const initialDate = (searchParams.get('date') as DateFilter) || 'all';
    const initialClient = searchParams.get('client') || 'all';
    const initialSearch = searchParams.get('q') || '';
    const initialCompact = searchParams.get('view') === 'compact';

    const [stateFilter, setStateFilter] = useState<StateFilter>(initialState);
    const [typeFilter, setTypeFilter] = useState<TypeFilter>(initialType);
    const [dateFilter, setDateFilter] = useState<DateFilter>(initialDate);
    const [clientFilter, setClientFilter] = useState<string>(initialClient);
    const [search, setSearch] = useState(initialSearch);
    const [compact, setCompact] = useState(initialCompact);

    // Write filter state back into the URL (shallow, no scroll).
    useEffect(() => {
        const p = new URLSearchParams();
        if (stateFilter !== 'all') p.set('state', stateFilter);
        if (typeFilter !== 'all') p.set('type', typeFilter);
        if (dateFilter !== 'all') p.set('date', dateFilter);
        if (clientFilter !== 'all') p.set('client', clientFilter);
        if (search.trim()) p.set('q', search.trim());
        if (compact) p.set('view', 'compact');
        const qs = p.toString();
        router.replace(qs ? `/admin/approvals?${qs}` : '/admin/approvals', { scroll: false });
    }, [router, stateFilter, typeFilter, dateFilter, clientFilter, search, compact]);

    const needsActionStates: EffectiveState[] = ['changes_requested', 'approved_with_feedback', 'pending'];

    // Client dropdown options derived from the approval set. De-duplicate
    // by name; blank/null orgs surface as "— no client —".
    const clientOptions = useMemo(() => {
        const names = new Set<string>();
        for (const a of approvals) names.add(a.orgName ?? '—');
        return Array.from(names).sort((a, b) => a.localeCompare(b));
    }, [approvals]);

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        const dateCutoff = DATE_CUTOFFS[dateFilter];
        return approvals.filter((a) => {
            if (stateFilter !== 'all') {
                if (stateFilter === 'needs_action') {
                    if (!needsActionStates.includes(a.state)) return false;
                } else if (a.state !== stateFilter) return false;
            }
            if (typeFilter !== 'all') {
                if (typeFilter === 'visual' && !a.isVisual) return false;
                if (typeFilter === 'production' && a.isVisual) return false;
            }
            if (clientFilter !== 'all') {
                if ((a.orgName ?? '—') !== clientFilter) return false;
            }
            if (dateCutoff) {
                if (new Date(a.createdAt) < dateCutoff) return false;
            }
            if (s) {
                const hay = [
                    a.jobName, a.jobReference, a.orgName, a.clientName,
                    a.clientEmail, a.clientCompany, a.clientComments,
                    ...a.lineFeedback.map((f) => `${f.heading} ${f.comment}`),
                ].filter(Boolean).join(' ').toLowerCase();
                if (!hay.includes(s)) return false;
            }
            return true;
        });
    }, [approvals, stateFilter, typeFilter, dateFilter, clientFilter, search]);

    const stateChips: Array<{ key: StateFilter; label: string; count: number; className: string }> = [
        { key: 'all', label: 'all', count: counts.all, className: 'bg-neutral-900 text-white' },
        { key: 'needs_action', label: 'needs action', count: counts.changesRequested + counts.approvedWithFeedback + counts.pending, className: 'bg-orange-600 text-white' },
        { key: 'changes_requested', label: 'changes requested', count: counts.changesRequested, className: 'bg-orange-100 text-orange-900' },
        { key: 'approved_with_feedback', label: 'approved w/ feedback', count: counts.approvedWithFeedback, className: 'bg-amber-100 text-amber-900' },
        { key: 'pending', label: 'pending', count: counts.pending, className: 'bg-amber-50 text-amber-800' },
        { key: 'approved_clean', label: 'approved clean', count: counts.approvedClean, className: 'bg-green-100 text-green-900' },
        { key: 'expired', label: 'expired', count: counts.expired, className: 'bg-neutral-100 text-neutral-600' },
        { key: 'revoked', label: 'revoked', count: counts.revoked, className: 'bg-neutral-100 text-neutral-500' },
    ];

    return (
        <>
            {/* Controls */}
            <div className="mb-4 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                    {stateChips.map((c) => {
                        const active = stateFilter === c.key;
                        return (
                            <button
                                key={c.key}
                                type="button"
                                onClick={() => setStateFilter(c.key)}
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
                        {(['all', 'production', 'visual'] as TypeFilter[]).map((t) => (
                            <button
                                key={t}
                                type="button"
                                onClick={() => setTypeFilter(t)}
                                className={`px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
                                    typeFilter === t ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                            >
                                {t}
                            </button>
                        ))}
                    </div>

                    <div className="inline-flex rounded border border-neutral-200 bg-white overflow-hidden text-xs">
                        {(['all', '7d', '30d', '90d'] as DateFilter[]).map((d) => (
                            <button
                                key={d}
                                type="button"
                                onClick={() => setDateFilter(d)}
                                className={`px-3 py-1.5 font-semibold uppercase tracking-wider transition-colors ${
                                    dateFilter === d ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'
                                }`}
                                title={d === 'all' ? 'all time' : `last ${d.replace('d', '')} days`}
                            >
                                {d === 'all' ? 'all time' : `last ${d.replace('d', 'd')}`}
                            </button>
                        ))}
                    </div>

                    <select
                        value={clientFilter}
                        onChange={(e) => setClientFilter(e.target.value)}
                        className="text-xs font-semibold uppercase tracking-wider px-2.5 py-1.5 border border-neutral-200 rounded bg-white text-neutral-700 focus:outline-none focus:border-neutral-400 max-w-[200px]"
                        title="Filter by client"
                    >
                        <option value="all">All clients</option>
                        {clientOptions.map((name) => (
                            <option key={name} value={name}>{name}</option>
                        ))}
                    </select>

                    <div className="flex-1 min-w-[200px] relative">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="search job, client, comment…"
                            className="w-full pl-8 pr-8 py-1.5 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                className="absolute right-2 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-700"
                                aria-label="Clear search"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    <div className="inline-flex rounded border border-neutral-200 bg-white overflow-hidden">
                        <button
                            type="button"
                            onClick={() => setCompact(false)}
                            className={`px-2.5 py-1.5 transition-colors ${!compact ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}
                            title="Detailed cards"
                            aria-pressed={!compact}
                        >
                            <LayoutGrid size={14} />
                        </button>
                        <button
                            type="button"
                            onClick={() => setCompact(true)}
                            className={`px-2.5 py-1.5 transition-colors ${compact ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}
                            title="Compact rows"
                            aria-pressed={compact}
                        >
                            <List size={14} />
                        </button>
                    </div>
                </div>

                <div className="text-xs text-neutral-500">
                    showing <span className="font-semibold text-neutral-800">{filtered.length}</span> of {counts.all}
                    {(stateFilter !== 'all' || typeFilter !== 'all' || dateFilter !== 'all' || clientFilter !== 'all' || search) && (
                        <button
                            type="button"
                            onClick={() => {
                                setStateFilter('all');
                                setTypeFilter('all');
                                setDateFilter('all');
                                setClientFilter('all');
                                setSearch('');
                            }}
                            className="ml-3 text-[#4e7e8c] hover:underline"
                        >
                            clear filters
                        </button>
                    )}
                </div>
            </div>

            {filtered.length === 0 ? (
                <Card>
                    <p className="text-sm text-neutral-500 text-center py-8">
                        No approvals match the current filters.
                    </p>
                </Card>
            ) : compact ? (
                <CompactList rows={filtered} />
            ) : (
                <DetailedList rows={filtered} />
            )}
        </>
    );
}

function CompactList({ rows }: { rows: ApprovalRow[] }) {
    return (
        <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
            <div className="grid grid-cols-[1fr_160px_110px_90px_90px] gap-2 px-3 py-2 bg-neutral-50 border-b border-neutral-200 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <div>Job / Client</div>
                <div>Status</div>
                <div>Type</div>
                <div>Sent</div>
                <div className="text-right">Feedback</div>
            </div>
            {rows.map((r) => {
                const badge = stateBadge(r.state);
                const feedbackCount = r.lineFeedback.length + (r.clientComments ? 1 : 0);
                return (
                    <Link
                        key={r.id}
                        href={`/admin/artwork/${r.jobId}`}
                        className="grid grid-cols-[1fr_160px_110px_90px_90px] gap-2 px-3 py-2.5 border-b border-neutral-100 last:border-b-0 hover:bg-neutral-50 transition-colors items-center text-sm"
                    >
                        <div className="min-w-0 flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${badge.dot}`} aria-hidden />
                            <div className="min-w-0">
                                <div className="font-semibold text-neutral-900 truncate">{r.jobName}</div>
                                <div className="text-[11px] text-neutral-500 truncate">
                                    <span className="font-mono">{r.jobReference}</span>
                                    {r.orgName && ` · ${r.orgName}`}
                                </div>
                            </div>
                        </div>
                        <div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.chip}`}>
                                {badge.label}
                            </span>
                        </div>
                        <div>
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${r.isVisual ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                                {r.isVisual ? 'Visual' : 'Production'}
                            </span>
                        </div>
                        <div className="text-xs text-neutral-500">{formatDate(r.createdAt)}</div>
                        <div className="text-xs text-neutral-700 text-right">
                            {feedbackCount > 0 ? (
                                <span className="font-semibold">{feedbackCount} note{feedbackCount !== 1 ? 's' : ''}</span>
                            ) : (
                                <span className="text-neutral-300">—</span>
                            )}
                        </div>
                    </Link>
                );
            })}
        </div>
    );
}

function DetailedList({ rows }: { rows: ApprovalRow[] }) {
    return (
        <div className="space-y-3">
            {rows.map((r) => {
                const badge = stateBadge(r.state);
                return (
                    <Card key={r.id} className={badge.card}>
                        <div className="flex flex-wrap items-start gap-3 mb-3">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <Link
                                        href={`/admin/artwork/${r.jobId}`}
                                        className="text-[#4e7e8c] hover:underline font-semibold text-base"
                                    >
                                        {r.jobName}
                                    </Link>
                                    <span className="text-[11px] font-mono text-neutral-400">{r.jobReference}</span>
                                    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${r.isVisual ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                                        {r.isVisual ? 'Visual' : 'Production'}
                                    </span>
                                </div>
                                <div className="text-xs text-neutral-500 mt-1">
                                    {r.orgName ?? '—'}
                                    {r.siteName && ` · ${r.siteName}`}
                                </div>
                            </div>
                            <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded ${badge.chip}`}>
                                {badge.label}
                            </span>
                        </div>

                        {(r.state === 'approved_clean' || r.state === 'approved_with_feedback' || r.state === 'changes_requested') && r.clientName && (
                            <div className="text-xs text-neutral-600 mb-3 flex flex-wrap gap-x-4 gap-y-1">
                                <span><span className="text-neutral-400">by</span> <span className="font-medium text-neutral-800">{r.clientName}</span></span>
                                {r.clientEmail && <span className="text-neutral-500">{r.clientEmail}</span>}
                                {r.clientCompany && <span className="text-neutral-500">{r.clientCompany}</span>}
                                {r.approvedAt && <span className="text-neutral-400">{formatDateTime(r.approvedAt)}</span>}
                            </div>
                        )}

                        {r.clientComments && (
                            <div className="mb-3 p-3 rounded border border-amber-300 bg-amber-50">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
                                    Overall comment from {r.clientName ?? 'client'}
                                </div>
                                <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                                    {r.clientComments}
                                </p>
                            </div>
                        )}

                        {r.lineFeedback.length > 0 && (
                            <div className="mb-3">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                    Per-item feedback ({r.lineFeedback.length})
                                </div>
                                <div className="space-y-1.5">
                                    {r.lineFeedback.map((fb) => (
                                        <div
                                            key={fb.key}
                                            className={`p-2.5 rounded border text-sm ${
                                                fb.decision === 'changes_requested' ? 'border-orange-300 bg-orange-50' : 'border-amber-300 bg-amber-50'
                                            }`}
                                        >
                                            <div className="flex items-center gap-2 mb-1">
                                                {fb.label && (
                                                    <span className="font-mono font-bold text-[10px] bg-neutral-900 text-white px-1 py-0.5 rounded">{fb.label}</span>
                                                )}
                                                <span className="font-semibold text-sm text-neutral-900">{fb.heading}</span>
                                                <span className={`text-[10px] font-bold uppercase tracking-wider ml-auto ${fb.decision === 'changes_requested' ? 'text-orange-700' : 'text-amber-700'}`}>
                                                    {fb.decision === 'changes_requested' ? 'changes requested' : 'approved with note'}
                                                </span>
                                            </div>
                                            {fb.comment && (
                                                <p className="text-sm text-neutral-800 whitespace-pre-wrap leading-relaxed">
                                                    {fb.comment}
                                                </p>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                            <span>
                                sent {formatDate(r.createdAt)}
                                {r.state === 'pending' && <> · expires {formatDate(r.expiresAt)}</>}
                            </span>
                            <Link href={`/admin/artwork/${r.jobId}`} className="text-[#4e7e8c] hover:underline font-medium">
                                open artwork →
                            </Link>
                        </div>
                    </Card>
                );
            })}
        </div>
    );
}
