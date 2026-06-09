import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { PageHeader } from '@/app/(portal)/components/ui';
import { ApprovalsListClient, type ApprovalRow, type EffectiveState } from './ApprovalsListClient';

export const dynamic = 'force-dynamic';

type RawStatus = 'pending' | 'approved' | 'expired' | 'revoked' | 'changes_requested';

interface DecisionRow {
    approval_id: string;
    component_id: string;
    sub_item_id: string | null;
    decision: 'approved' | 'changes_requested';
    comment: string | null;
}
interface SubItemInfo { id: string; label: string; name: string | null; component_id: string; }
interface ComponentInfo { id: string; name: string; job_id: string; }

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

    const raw = (approvals ?? []) as any[];
    const approvalIds = raw.map((r) => r.id);

    let decisionsByApproval: Record<string, DecisionRow[]> = {};
    const subItemsById: Record<string, SubItemInfo> = {};
    const componentsById: Record<string, ComponentInfo> = {};

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
            for (const s of (subs ?? []) as SubItemInfo[]) subItemsById[s.id] = s;
        }
        if (componentIds.length > 0) {
            const { data: comps } = await supabase
                .from('artwork_components')
                .select('id, name, job_id')
                .in('id', componentIds);
            for (const c of (comps ?? []) as ComponentInfo[]) componentsById[c.id] = c;
        }
    }

    // Derive effective state. Approving with any comment or any line-level
    // feedback promotes the row out of "clean approval" and into
    // "approved_with_feedback" so it stays on the needs-action list.
    const derive = (row: any): EffectiveState => {
        const rs = row.status as RawStatus;
        if (rs === 'pending' && new Date(row.expires_at) < new Date()) return 'expired';
        if (rs === 'pending') return 'pending';
        if (rs === 'revoked') return 'revoked';
        if (rs === 'expired') return 'expired';
        if (rs === 'changes_requested') return 'changes_requested';

        const decisions = decisionsByApproval[row.id] ?? [];
        const hasOverall = !!(row.client_comments ?? '').trim();
        const hasLine = decisions.some((d) => d.decision === 'changes_requested' || !!(d.comment ?? '').trim());
        return (hasOverall || hasLine) ? 'approved_with_feedback' : 'approved_clean';
    };

    const enriched: ApprovalRow[] = raw.map((row) => {
        const state = derive(row);
        const job = row.artwork_jobs;
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

        return {
            id: row.id,
            state,
            jobId: row.job_id,
            jobName: job?.job_name ?? 'untitled',
            jobReference: job?.job_reference ?? '',
            isVisual: job?.job_type === 'visual_approval',
            orgName: job?.orgs?.name ?? row.snapshot_contact_name ?? null,
            siteName: row.snapshot_site_name ?? null,
            clientName: row.client_name ?? null,
            clientEmail: row.client_email ?? null,
            clientCompany: row.client_company ?? null,
            approvedAt: row.approved_at ?? null,
            createdAt: row.created_at,
            expiresAt: row.expires_at,
            clientComments: row.client_comments ?? null,
            lineFeedback,
        };
    });

    const order: Record<EffectiveState, number> = {
        changes_requested: 0, approved_with_feedback: 1, pending: 2,
        expired: 3, approved_clean: 4, revoked: 5,
    };
    enriched.sort((a, b) => {
        const s = order[a.state] - order[b.state];
        if (s !== 0) return s;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    const counts = {
        all: enriched.length,
        changesRequested: enriched.filter((e) => e.state === 'changes_requested').length,
        approvedWithFeedback: enriched.filter((e) => e.state === 'approved_with_feedback').length,
        pending: enriched.filter((e) => e.state === 'pending').length,
        approvedClean: enriched.filter((e) => e.state === 'approved_clean').length,
        expired: enriched.filter((e) => e.state === 'expired').length,
        revoked: enriched.filter((e) => e.state === 'revoked').length,
    };

    return (
        <div className="p-6 max-w-5xl mx-auto">
            <PageHeader
                title="Approvals"
                description="every artwork approval link sent to clients — sorted so what needs attention sits on top"
            />
            <ApprovalsListClient approvals={enriched} counts={counts} />
        </div>
    );
}
