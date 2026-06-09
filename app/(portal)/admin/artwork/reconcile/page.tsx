import { requireAdmin } from '@/lib/auth';
import { listUnmatchedJobs } from '@/lib/artwork/reconcile-actions';
import { createAdminClient } from '@/lib/supabase-admin';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ReconcileRow } from './ReconcileRow';

export const dynamic = 'force-dynamic';

export default async function ReconcilePage() {
    await requireAdmin();

    const unmatched = await listUnmatchedJobs();
    const supabase = createAdminClient();
    const { data: orgs } = await supabase
        .from('orgs')
        .select('id, name')
        .order('name', { ascending: true });

    if (unmatched.length === 0) {
        return (
            <div className="p-6 max-w-3xl mx-auto">
                <PageHeader
                    title="artwork reconciliation"
                    description="link historic artwork jobs to organisations"
                />
                <Card>
                    <div className="text-center py-12">
                        <p className="text-neutral-700 font-medium mb-2">nothing to reconcile.</p>
                        <p className="text-sm text-neutral-500">
                            every artwork job is linked to an organisation or marked as an orphan.
                        </p>
                        <Link href="/admin/artwork" className="btn-primary mt-6 inline-block">
                            back to dashboard
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <PageHeader
                title="artwork reconciliation"
                description={`${unmatched.length} job${unmatched.length === 1 ? '' : 's'} need linking`}
            />
            <Card>
                <table className="w-full">
                    <thead className="border-b border-neutral-200 bg-neutral-50">
                        <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">ref</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">legacy client</th>
                            <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase">link to</th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-neutral-500 uppercase">action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                        {unmatched.map((job) => (
                            <ReconcileRow
                                key={job.id}
                                jobId={job.id}
                                jobReference={job.job_reference}
                                legacyName={job.client_name_snapshot ?? '—'}
                                orgs={orgs ?? []}
                            />
                        ))}
                    </tbody>
                </table>
            </Card>
        </div>
    );
}
