import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { formatDate, formatDateTime } from '@/lib/artwork/utils';

export const dynamic = 'force-dynamic';

type RawStatus = 'pending' | 'approved' | 'expired' | 'revoked' | 'changes_requested';

// The effective state surfaced in the UI. "approved_with_feedback" is the
// retard-proof part: a client who ticks every sub-item approved but still
// types "btw shrink the logo" has NOT given us a clean sign-off. We pull
// that row out of the clean-approved bucket and flag it for follow-up so
// nothing ships on the back of an ambiguous approval.
type EffectiveState =
    | 'pending'
    | 'expired'
    | 'revoked'
    | 'approved_clean'
    | 'approved_with_feedback'
    | 'changes_requested';

interface DecisionRow {
    approval_id: string;
    component_id: string;
    sub_item_id: string | null;
    decision: 'approved' | 'changes_requested';
    comment: string | null;
}

interface SubItemInfo {
    id: string;
    label: string;
    name: string | null;
    component_id: string;
}

interface ComponentInfo {
    id: string;
    name: string;
    job_id: string;
}

export default async function ApprovalsPage() {
    await requireAdmin();

    const supabase = createAdminClient();

    const { data: approvals } = await supabase
        .from('artwork_approvals')
        .select(`
            id, token, status, expires_at, client_name, client_email,
            client_company, client_comments, approved_at, created_at,
            snapshot_contact_name, snapshot_site_name, job_id,
            artwork_jobs!inner(
                id, job_name, job_reference, job_type, status,
                org_id, orgs(name)
            )
        `)
        .order('created_at', { ascending: false })
        .limit(200);

    const rows = (approvals ?? []) as any[];
    const approvalIds = rows.map((r) => r.id);

    // Pull every per-line decision for these approvals in one round trip,
    // plus the sub_item + component metadata needed to label them.
    let decisionsByApproval: Record<string, DecisionRow[]> = {};
    let subItemsById: Record<string, SubItemInfo> = {};
    let componentsById: Record<string, ComponentInfo> = {};

    if (approvalIds.length > 0) {
        const { data: decisions } = await supabase
            .from('artwork_component_decisions')
            .select('approval_id, component_id, sub_item_id, decision, comment')
            .in('approval_id', approvalIds);

        const dRows = (decisions ?? []) as DecisionRow[];
        for (const d of dRows) {
            (decisionsByApproval[d.approval_id] ??= []).push(d);
        }

        const subIds = Array.from(new Set(dRows.map((d) => d.sub_item_id).filter(Boolean))) as string[];
        const componentIds = Array.from(new Set(dRows.map((d) => d.component_id)));

        if (subIds.length > 0) {
            const { data: subs } = await supabase
                .from('artwork_component_items')
                .select('id, label, name, component_id')
                .in('id', subIds);
            for (const s of (subs ?? []) as SubItemInfo[]) {
                subItemsById[s.id] = s;
            }
        }
        if (componentIds.length > 0) {
            const { data: comps } = await supabase
                .from('artwork_components')
                .select('id, name, job_id')
                .in('id', componentIds);
            for (const c of (comps ?? []) as ComponentInfo[]) {
                componentsById[c.id] = c;
            }
        }
    }

    // Compute effective state per approval.
    const derive = (row: any): EffectiveState => {
        const raw = row.status as RawStatus;
        const isExpired = raw === 'pending' && new Date(row.expires_at) < new Date();
        if (isExpired) return 'expired';
        if (raw === 'pending') return 'pending';
        if (raw === 'revoked') return 'revoked';
        if (raw === 'expired') return 'expired';
        if (raw === 'changes_requested') return 'changes_requested';

        // raw === 'approved' — promote to "with feedback" if overall comments
        // or any per-line comment or any changes_requested decision exists.
        const decisions = decisionsByApproval[row.id] ?? [];
        const hasOverallComment = !!(row.client_comments ?? '').trim();
        const hasAnyLineFeedback = decisions.some(
            (d) => d.decision === 'changes_requested' || !!(d.comment ?? '').trim()
        );
        return (hasOverallComment || hasAnyLineFeedback) ? 'approved_with_feedback' : 'approved_clean';
    };

    const enriched = rows.map((row) => ({ row, state: derive(row) }));

    const counts = {
        pending: enriched.filter((e) => e.state === 'pending').length,
        approvedClean: enriched.filter((e) => e.state === 'approved_clean').length,
        approvedWithFeedback: enriched.filter((e) => e.state === 'approved_with_feedback').length,
        changesRequested: enriched.filter((e) => e.state === 'changes_requested').length,
        expired: enriched.filter((e) => e.state === 'expired').length,
    };

    const needsAttentionOrder: Record<EffectiveState, number> = {
        changes_requested: 0,
        approved_with_feedback: 1,
        pending: 2,
        expired: 3,
        approved_clean: 4,
        revoked: 5,
    };
    enriched.sort((a, b) => {
        const s = needsAttentionOrder[a.state] - needsAttentionOrder[b.state];
        if (s !== 0) return s;
        return new Date(b.row.created_at).getTime() - new Date(a.row.created_at).getTime();
    });

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <PageHeader
                title="Approvals"
                description="every artwork approval link sent to clients — sorted so what needs attention sits on top"
            />

            {/* Summary counters. Approved with feedback is deliberately
                called out separately — a client approving with comments is
                NOT a clean approval and shouldn't look like one. */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">{counts.changesRequested}</div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">changes requested</div>
                </Card>
                <Card className="!py-3 text-center bg-amber-50 border-amber-300">
                    <div className="text-2xl font-bold text-amber-700">{counts.approvedWithFeedback}</div>
                    <div className="text-[10px] text-amber-800 uppercase tracking-wider leading-tight">approved w/ feedback</div>
                </Card>
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-amber-600">{counts.pending}</div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">pending</div>
                </Card>
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{counts.approvedClean}</div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">approved clean</div>
                </Card>
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-neutral-400">{counts.expired}</div>
                    <div className="text-[10px] text-neutral-500 uppercase tracking-wider leading-tight">expired</div>
                </Card>
            </div>

            {enriched.length === 0 ? (
                <Card>
                    <p className="text-sm text-neutral-500 text-center py-8">
                        No approval links generated yet. Create one from an artwork job.
                    </p>
                </Card>
            ) : (
                <div className="space-y-3">
                    {enriched.map(({ row, state }) => {
                        const job = row.artwork_jobs;
                        const orgName = job?.orgs?.name ?? null;
                        const isVisual = job?.job_type === 'visual_approval';
                        const decisions = decisionsByApproval[row.id] ?? [];
                        const lineFeedback = decisions
                            .filter((d) => d.decision === 'changes_requested' || !!(d.comment ?? '').trim())
                            .map((d) => {
                                const sub = d.sub_item_id ? subItemsById[d.sub_item_id] : null;
                                const comp = componentsById[d.component_id];
                                return {
                                    key: d.sub_item_id ?? d.component_id,
                                    decision: d.decision,
                                    comment: d.comment ?? '',
                                    label: sub?.label ?? '',
                                    heading: sub?.name ?? comp?.name ?? 'component',
                                };
                            });

                        const badge = stateBadge(state);

                        return (
                            <Card
                                key={row.id}
                                className={`${badge.cardClass}`}
                            >
                                {/* Header row: job title + client + state */}
                                <div className="flex flex-wrap items-start gap-3 mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <Link
                                                href={`/admin/artwork/${row.job_id}`}
                                                className="text-[#4e7e8c] hover:underline font-semibold text-base"
                                            >
                                                {job?.job_name ?? 'untitled'}
                                            </Link>
                                            <span className="text-[11px] font-mono text-neutral-400">
                                                {job?.job_reference ?? ''}
                                            </span>
                                            <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                isVisual ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {isVisual ? 'Visual' : 'Production'}
                                            </span>
                                        </div>
                                        <div className="text-xs text-neutral-500 mt-1">
                                            {orgName ?? row.snapshot_contact_name ?? '—'}
                                            {row.snapshot_site_name && ` · ${row.snapshot_site_name}`}
                                        </div>
                                    </div>
                                    <span className={`text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded ${badge.chipClass}`}>
                                        {badge.label}
                                    </span>
                                </div>

                                {/* Submitter meta */}
                                {(state === 'approved_clean' || state === 'approved_with_feedback' || state === 'changes_requested') && row.client_name && (
                                    <div className="text-xs text-neutral-600 mb-3 flex flex-wrap gap-x-4 gap-y-1">
                                        <span>
                                            <span className="text-neutral-400">by</span>{' '}
                                            <span className="font-medium text-neutral-800">{row.client_name}</span>
                                        </span>
                                        {row.client_email && (
                                            <span className="text-neutral-500">{row.client_email}</span>
                                        )}
                                        {row.client_company && (
                                            <span className="text-neutral-500">{row.client_company}</span>
                                        )}
                                        {row.approved_at && (
                                            <span className="text-neutral-400">
                                                {formatDateTime(row.approved_at)}
                                            </span>
                                        )}
                                    </div>
                                )}

                                {/* Overall comments — full text, not truncated */}
                                {row.client_comments && (
                                    <div className="mb-3 p-3 rounded border border-amber-300 bg-amber-50">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1">
                                            Overall comment from {row.client_name ?? 'client'}
                                        </div>
                                        <p className="text-sm text-amber-900 whitespace-pre-wrap leading-relaxed">
                                            {row.client_comments}
                                        </p>
                                    </div>
                                )}

                                {/* Per-line feedback */}
                                {lineFeedback.length > 0 && (
                                    <div className="mb-3">
                                        <div className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                                            Per-item feedback ({lineFeedback.length})
                                        </div>
                                        <div className="space-y-1.5">
                                            {lineFeedback.map((fb) => (
                                                <div
                                                    key={fb.key}
                                                    className={`p-2.5 rounded border text-sm ${
                                                        fb.decision === 'changes_requested'
                                                            ? 'border-orange-300 bg-orange-50'
                                                            : 'border-amber-300 bg-amber-50'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-2 mb-1">
                                                        {fb.label && (
                                                            <span className="font-mono font-bold text-[10px] bg-neutral-900 text-white px-1 py-0.5 rounded">
                                                                {fb.label}
                                                            </span>
                                                        )}
                                                        <span className="font-semibold text-sm text-neutral-900">
                                                            {fb.heading}
                                                        </span>
                                                        <span className={`text-[10px] font-bold uppercase tracking-wider ml-auto ${
                                                            fb.decision === 'changes_requested' ? 'text-orange-700' : 'text-amber-700'
                                                        }`}>
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

                                {/* Footer — sent / expiry / action */}
                                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-neutral-500 pt-2 border-t border-neutral-100">
                                    <span>
                                        sent {formatDate(row.created_at)}
                                        {state === 'pending' && (
                                            <> · expires {formatDate(row.expires_at)}</>
                                        )}
                                    </span>
                                    <Link
                                        href={`/admin/artwork/${row.job_id}`}
                                        className="text-[#4e7e8c] hover:underline font-medium"
                                    >
                                        open artwork →
                                    </Link>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function stateBadge(state: EffectiveState): { label: string; chipClass: string; cardClass: string } {
    switch (state) {
        case 'changes_requested':
            return {
                label: 'changes requested',
                chipClass: 'bg-orange-600 text-white',
                cardClass: 'border-orange-300 bg-orange-50',
            };
        case 'approved_with_feedback':
            return {
                label: 'approved — feedback to action',
                chipClass: 'bg-amber-600 text-white',
                cardClass: 'border-amber-300 bg-amber-50',
            };
        case 'pending':
            return {
                label: 'pending',
                chipClass: 'bg-amber-100 text-amber-900',
                cardClass: '',
            };
        case 'expired':
            return {
                label: 'expired',
                chipClass: 'bg-neutral-200 text-neutral-600',
                cardClass: 'opacity-70',
            };
        case 'revoked':
            return {
                label: 'revoked',
                chipClass: 'bg-neutral-200 text-neutral-500',
                cardClass: 'opacity-60',
            };
        case 'approved_clean':
            return {
                label: 'approved',
                chipClass: 'bg-green-600 text-white',
                cardClass: '',
            };
    }
}
