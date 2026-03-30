import { requireAdmin } from '@/lib/auth';
import { getArtworkJobs } from '@/lib/artwork/actions';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { formatDate } from '@/lib/artwork/utils';
import {
    getJobStatusLabel,
    getJobStatusVariant,
    getJobProgress,
} from '@/lib/artwork/utils';
import { ArtworkJob, ArtworkJobStatus } from '@/lib/artwork/types';

interface SearchParams {
    status?: string;
    search?: string;
}

export default async function ArtworkJobsPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    await requireAdmin();

    const params = await searchParams;
    const jobs = await getArtworkJobs({
        status: params.status,
        search: params.search,
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="artwork compliance"
                description="design-to-production verification for signage jobs"
                action={
                    <Link href="/admin/artwork/new" className="btn-primary">
                        new artwork job
                    </Link>
                }
            />

            {/* Filters */}
            <Card className="mb-6">
                <form method="get" className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <input
                        type="text"
                        name="search"
                        placeholder="search by job name, reference or client..."
                        defaultValue={params.search || ''}
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                    />
                    <div className="flex items-center gap-3">
                        <select
                            name="status"
                            defaultValue={params.status || 'all'}
                            className="flex-1 sm:flex-none px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        >
                            <option value="all">all statuses</option>
                            <option value="draft">draft</option>
                            <option value="in_progress">in progress</option>
                            <option value="design_complete">design complete</option>
                            <option value="in_production">in production</option>
                            <option value="completed">completed</option>
                        </select>
                        <button type="submit" className="btn-secondary whitespace-nowrap">
                            filter
                        </button>
                    </div>
                </form>
            </Card>

            {/* Jobs Table */}
            {jobs.length === 0 ? (
                <Card>
                    <div className="text-center py-12">
                        <p className="text-neutral-500 mb-4">no artwork jobs found</p>
                        {params.search || (params.status && params.status !== 'all') ? (
                            <Link
                                href="/admin/artwork"
                                className="text-sm text-neutral-600 hover:text-black underline"
                            >
                                clear filters
                            </Link>
                        ) : (
                            <Link href="/admin/artwork/new" className="btn-primary">
                                create your first artwork job
                            </Link>
                        )}
                    </div>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-neutral-200 bg-neutral-50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        reference
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        job name
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        client
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        status
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        client
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        last updated
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {jobs.map((job) => (
                                    <tr
                                        key={job.id}
                                        className="hover:bg-neutral-50 transition-colors"
                                    >
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/admin/artwork/${job.id}`}
                                                className="font-mono text-sm text-neutral-600 hover:text-black"
                                            >
                                                {job.job_reference}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/admin/artwork/${job.id}`}
                                                className="font-medium text-black hover:underline"
                                            >
                                                {job.job_name}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-600">
                                            {job.client_name || '-'}
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
                                        <td className="px-4 py-3 text-sm text-neutral-500">
                                            {formatDate(job.updated_at)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {jobs.length > 0 && (
                <div className="mt-4 text-sm text-neutral-500">
                    showing {jobs.length} {jobs.length === 1 ? 'job' : 'jobs'}
                </div>
            )}
        </div>
    );
}
