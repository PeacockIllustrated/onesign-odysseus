import { requireAdmin } from '@/lib/auth';
import { getArtworkDashboardData } from '@/lib/artwork/actions';
import { createAdminClient } from '@/lib/supabase-admin';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { formatDate, getJobStatusLabel, getJobStatusVariant } from '@/lib/artwork/utils';
import { ArtworkJobStatus, ArtworkDashboardFilterEnum } from '@/lib/artwork/types';
import { Settings } from 'lucide-react';
import { StartArtworkButton } from './StartArtworkButton';
import { NewVisualJobButton } from './components/NewVisualJobButton';

type JobTypeFilter = 'all' | 'production' | 'visual_approval';

interface SearchParams {
    filter?: string;
    search?: string;
    type?: string;
}

const FILTER_LABELS: Record<string, string> = {
    all: 'all',
    awaiting_start: 'awaiting start',
    in_progress: 'in progress',
    awaiting_approval: 'awaiting client',
    flagged: 'flagged',
    completed: 'completed',
    orphans: 'orphans',
};

export default async function ArtworkJobsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    await requireAdmin();
    const params = await searchParams;

    const filterParse = ArtworkDashboardFilterEnum.safeParse(params.filter ?? 'all');
    const filter = filterParse.success ? filterParse.data : 'all';

    const rawType = params.type ?? 'all';
    const typeFilter: JobTypeFilter = (rawType === 'production' || rawType === 'visual_approval')
        ? rawType
        : 'all';

    const { jobs: allJobs, ghostRows, counts } = await getArtworkDashboardData({
        filter,
        search: params.search,
    });

    const jobs = typeFilter === 'all'
        ? allJobs
        : allJobs.filter((j) => j.job_type === typeFilter);

    const supabase = createAdminClient();
    const { data: orgs } = await supabase
        .from('orgs')
        .select('id, name')
        .order('name')
        .limit(200);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="artwork compliance"
                description="design-to-production verification for signage jobs"
                action={
                    <div className="flex items-center gap-2">
                        <Link href="/admin/artwork/reconcile" className="btn-secondary text-xs">
                            reconcile
                        </Link>
                        <Link href="/admin/artwork/settings" className="btn-secondary p-2" title="Settings">
                            <Settings size={16} />
                        </Link>
                        <NewVisualJobButton orgs={orgs ?? []} />
                        <Link href="/admin/artwork/new" className="btn-primary">
                            new artwork job
                        </Link>
                    </div>
                }
            />

            {/* Filter chips */}
            <div className="flex flex-wrap gap-2 mb-3">
                {Object.keys(FILTER_LABELS).map((key) => {
                    const active = key === filter;
                    const count = counts[key as keyof typeof counts] ?? 0;
                    const searchQs = params.search ? `&search=${encodeURIComponent(params.search)}` : '';
                    const typeQs = typeFilter !== 'all' ? `&type=${typeFilter}` : '';
                    const href = `/admin/artwork?filter=${key}${searchQs}${typeQs}`;
                    return (
                        <Link
                            key={key}
                            href={href}
                            className={`px-3 py-1.5 text-xs rounded-full border transition-colors ${active ? 'bg-black text-white border-black' : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'}`}
                        >
                            {FILTER_LABELS[key]} <span className="ml-1 opacity-70">{count}</span>
                        </Link>
                    );
                })}
            </div>

            {/* Type filter */}
            <div className="flex gap-1 mb-4">
                {(['all', 'production', 'visual_approval'] as const).map((t) => {
                    const active = t === typeFilter;
                    const filterQs = filter !== 'all' ? `&filter=${filter}` : '';
                    const searchQs = params.search ? `&search=${encodeURIComponent(params.search)}` : '';
                    const href = `/admin/artwork?type=${t}${filterQs}${searchQs}`;
                    const label = t === 'all' ? 'All' : t === 'production' ? 'Production' : 'Visuals';
                    return (
                        <Link
                            key={t}
                            href={href}
                            className={`text-xs font-semibold px-3 py-1 rounded border transition-colors ${active ? 'bg-black text-white border-black' : 'bg-white text-neutral-700 border-neutral-200 hover:border-neutral-400'}`}
                        >
                            {label}
                        </Link>
                    );
                })}
            </div>

            {/* Search */}
            <Card className="mb-4">
                <form method="get" className="flex gap-2">
                    <input type="hidden" name="filter" value={filter} />
                    {typeFilter !== 'all' && <input type="hidden" name="type" value={typeFilter} />}
                    <input
                        type="text"
                        name="search"
                        placeholder="search by job name, reference or legacy client…"
                        defaultValue={params.search || ''}
                        className="flex-1 px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <button type="submit" className="btn-secondary">search</button>
                </form>
            </Card>

            {/* Ghost rows: production items at artwork stage, not yet started */}
            {ghostRows.length > 0 && (filter === 'all' || filter === 'awaiting_start') && (
                <Card className="mb-4 overflow-hidden">
                    <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500 bg-neutral-50 border-b border-neutral-200">
                        production items awaiting artwork · {ghostRows.length}
                    </div>
                    <ul className="divide-y divide-neutral-100">
                        {ghostRows.map((g) => (
                            <li key={g.jobItemId} className="px-4 py-3 flex items-center justify-between gap-4">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2">
                                        <code className="text-xs font-mono text-[#4e7e8c] font-semibold">
                                            {g.productionJobNumber}{g.itemNumber ? ` · ${g.itemNumber}` : ''}
                                        </code>
                                        {g.priority === 'urgent' && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-red-50 text-red-700">urgent</span>
                                        )}
                                        {g.priority === 'high' && (
                                            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">high</span>
                                        )}
                                    </div>
                                    <p className="text-sm font-medium truncate">{g.clientName}</p>
                                    <p className="text-xs text-neutral-500 truncate">{g.jobItemDescription}</p>
                                </div>
                                <StartArtworkButton jobItemId={g.jobItemId} />
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            {/* Jobs table */}
            {jobs.length === 0 && ghostRows.length === 0 ? (
                <Card>
                    <div className="text-center py-12">
                        <p className="text-neutral-500 mb-4">nothing here.</p>
                        {(params.search || filter !== 'all') ? (
                            <Link href="/admin/artwork" className="text-sm text-neutral-600 hover:text-black underline">
                                clear filters
                            </Link>
                        ) : (
                            <Link href="/admin/artwork/new" className="btn-primary">
                                create your first artwork job
                            </Link>
                        )}
                    </div>
                </Card>
            ) : jobs.length > 0 ? (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-neutral-200 bg-neutral-50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">reference</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">job name</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">status</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">client approval</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">flags</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">last updated</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {jobs.map((job) => (
                                    <tr key={job.id} className="hover:bg-neutral-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/artwork/${job.id}`} className="font-mono text-sm text-neutral-600 hover:text-black">
                                                {job.job_reference}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link href={`/admin/artwork/${job.id}`} className="font-medium text-black hover:underline">
                                                {job.job_name}
                                            </Link>
                                            <span className={`ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                                job.job_type === 'visual_approval' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {job.job_type === 'visual_approval' ? 'Visual' : 'Production'}
                                            </span>
                                            {job.is_orphan && (
                                                <span className="ml-2 text-[10px] uppercase px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 font-semibold">
                                                    orphan
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Chip variant={getJobStatusVariant(job.status as ArtworkJobStatus)}>
                                                {getJobStatusLabel(job.status as ArtworkJobStatus)}
                                            </Chip>
                                        </td>
                                        <td className="px-4 py-3">
                                            {job.client_approved ? (
                                                <Chip variant="approved">approved</Chip>
                                            ) : (
                                                <span className="text-sm text-neutral-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm">
                                            {job.flagged_count > 0 ? (
                                                <span className="text-red-700 font-medium">{job.flagged_count} flagged</span>
                                            ) : (
                                                <span className="text-neutral-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">
                                            {formatDate(job.updated_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            ) : null}

            {jobs.length > 0 && (
                <div className="mt-4 text-sm text-neutral-500">
                    showing {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
                </div>
            )}
        </div>
    );
}
