import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { formatDate } from '@/lib/artwork/utils';

export const dynamic = 'force-dynamic';

type ApprovalStatus = 'pending' | 'approved' | 'expired' | 'revoked' | 'changes_requested';

function statusVariant(status: ApprovalStatus): 'draft' | 'approved' | 'review' | 'paused' {
    switch (status) {
        case 'approved': return 'approved';
        case 'pending': return 'draft';
        case 'changes_requested': return 'review';
        default: return 'paused';
    }
}

function statusLabel(status: ApprovalStatus): string {
    switch (status) {
        case 'approved': return 'approved';
        case 'pending': return 'pending';
        case 'changes_requested': return 'changes requested';
        case 'expired': return 'expired';
        case 'revoked': return 'revoked';
    }
}

export default async function ApprovalsPage() {
    await requireAdmin();

    const supabase = createAdminClient();

    const { data: approvals } = await supabase
        .from('artwork_approvals')
        .select(`
            id,
            token,
            status,
            expires_at,
            client_name,
            client_email,
            client_company,
            client_comments,
            approved_at,
            created_at,
            snapshot_contact_name,
            snapshot_site_name,
            job_id,
            artwork_jobs!inner(
                id,
                job_name,
                job_reference,
                job_type,
                status,
                org_id,
                orgs(name)
            )
        `)
        .order('created_at', { ascending: false })
        .limit(200);

    const rows = (approvals ?? []) as any[];

    // Counts for the summary bar.
    const total = rows.length;
    const pending = rows.filter((r) => r.status === 'pending').length;
    const approved = rows.filter((r) => r.status === 'approved').length;
    const changesRequested = rows.filter((r) => r.status === 'changes_requested').length;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Approvals"
                description="all artwork approval links — sent, pending, approved, and change requests"
            />

            {/* Summary counters */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-neutral-900">{total}</div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">total</div>
                </Card>
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-amber-600">{pending}</div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">pending</div>
                </Card>
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-green-700">{approved}</div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">approved</div>
                </Card>
                <Card className="!py-3 text-center">
                    <div className="text-2xl font-bold text-orange-600">{changesRequested}</div>
                    <div className="text-xs text-neutral-500 uppercase tracking-wider">changes requested</div>
                </Card>
            </div>

            {/* Table */}
            {rows.length === 0 ? (
                <Card>
                    <p className="text-sm text-neutral-500 text-center py-8">
                        No approval links generated yet. Create one from an artwork job.
                    </p>
                </Card>
            ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200 text-left">
                                <th className="px-4 py-3 font-semibold text-neutral-600 text-xs uppercase tracking-wider">Job</th>
                                <th className="px-4 py-3 font-semibold text-neutral-600 text-xs uppercase tracking-wider">Client</th>
                                <th className="px-4 py-3 font-semibold text-neutral-600 text-xs uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 font-semibold text-neutral-600 text-xs uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 font-semibold text-neutral-600 text-xs uppercase tracking-wider">Sent</th>
                                <th className="px-4 py-3 font-semibold text-neutral-600 text-xs uppercase tracking-wider">Approved by</th>
                                <th className="px-4 py-3 font-semibold text-neutral-600 text-xs uppercase tracking-wider">Comments</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {rows.map((row) => {
                                const job = row.artwork_jobs;
                                const orgName = job?.orgs?.name ?? null;
                                const isVisual = job?.job_type === 'visual_approval';
                                const isPending = row.status === 'pending';
                                const isExpired = isPending && new Date(row.expires_at) < new Date();
                                const effectiveStatus: ApprovalStatus = isExpired ? 'expired' : row.status;

                                return (
                                    <tr key={row.id} className="hover:bg-neutral-50 transition-colors">
                                        {/* Job */}
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/admin/artwork/${row.job_id}`}
                                                className="text-[#4e7e8c] hover:underline font-medium"
                                            >
                                                {job?.job_name ?? '—'}
                                            </Link>
                                            <div className="text-[11px] font-mono text-neutral-400 mt-0.5">
                                                {job?.job_reference ?? ''}
                                            </div>
                                        </td>

                                        {/* Client */}
                                        <td className="px-4 py-3">
                                            <div className="font-medium text-neutral-900 text-xs">
                                                {orgName ?? row.snapshot_contact_name ?? '—'}
                                            </div>
                                            {row.snapshot_site_name && (
                                                <div className="text-[11px] text-neutral-400">{row.snapshot_site_name}</div>
                                            )}
                                        </td>

                                        {/* Type */}
                                        <td className="px-4 py-3">
                                            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                isVisual ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {isVisual ? 'Visual' : 'Production'}
                                            </span>
                                        </td>

                                        {/* Status */}
                                        <td className="px-4 py-3">
                                            <Chip variant={statusVariant(effectiveStatus)}>
                                                {statusLabel(effectiveStatus)}
                                            </Chip>
                                        </td>

                                        {/* Sent */}
                                        <td className="px-4 py-3 text-xs text-neutral-500">
                                            {formatDate(row.created_at)}
                                        </td>

                                        {/* Approved by */}
                                        <td className="px-4 py-3">
                                            {row.client_name ? (
                                                <div>
                                                    <div className="text-xs font-medium text-neutral-900">{row.client_name}</div>
                                                    {row.client_email && (
                                                        <div className="text-[11px] text-neutral-400">{row.client_email}</div>
                                                    )}
                                                    {row.approved_at && (
                                                        <div className="text-[10px] text-neutral-400 mt-0.5">
                                                            {formatDate(row.approved_at)}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-neutral-300">—</span>
                                            )}
                                        </td>

                                        {/* Comments */}
                                        <td className="px-4 py-3">
                                            {row.client_comments ? (
                                                <div
                                                    className="text-xs text-neutral-600 max-w-[200px] truncate"
                                                    title={row.client_comments}
                                                >
                                                    {row.client_comments}
                                                </div>
                                            ) : (
                                                <span className="text-xs text-neutral-300">—</span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
