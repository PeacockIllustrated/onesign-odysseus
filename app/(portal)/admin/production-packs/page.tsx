import { requireAdmin } from '@/lib/auth';
import { getProductionPacks } from '@/lib/production-packs/actions';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import { getRelativeTime, formatDate } from '@/lib/production-packs/utils';
import type { ProductionPackStatus } from '@/lib/production-packs/types';
import Link from 'next/link';
import { NewPackButton } from './NewPackButton';
import { RowActions } from './RowActions';

interface SearchParams {
    status?: string;
    search?: string;
}

export default async function ProductionPacksPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    await requireAdmin();

    const params = await searchParams;
    const packs = await getProductionPacks({
        status: params.status,
        search: params.search,
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="production packs"
                description="build detailed, on-brand signage works packs — modular, repeatable, print-ready"
                action={<NewPackButton />}
            />

            {/* Filters */}
            <Card className="mb-6">
                <form method="get" className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <input
                        type="text"
                        name="search"
                        placeholder="search by title, project or client…"
                        defaultValue={params.search || ''}
                        className="flex-1 min-w-0 px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                    />
                    <div className="flex items-center gap-3">
                        <select
                            name="status"
                            defaultValue={params.status || 'all'}
                            className="flex-1 sm:flex-none px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                        >
                            <option value="all">all statuses</option>
                            <option value="draft">draft</option>
                            <option value="ready">ready</option>
                            <option value="archived">archived</option>
                        </select>
                        <button type="submit" className="btn-secondary whitespace-nowrap">
                            filter
                        </button>
                    </div>
                </form>
            </Card>

            {packs.length === 0 ? (
                <Card>
                    <div className="text-center py-12">
                        <p className="text-neutral-500 mb-4">no production packs yet</p>
                        {params.search || (params.status && params.status !== 'all') ? (
                            <Link
                                href="/admin/production-packs"
                                className="text-sm text-neutral-600 hover:text-black underline"
                            >
                                clear filters
                            </Link>
                        ) : (
                            <NewPackButton label="create your first pack" />
                        )}
                    </div>
                </Card>
            ) : (
                <Card className="overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="border-b border-neutral-200 bg-neutral-50">
                                <tr>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">title</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">client / project</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">signs</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">status</th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">updated</th>
                                    <th className="px-4 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {packs.map((pack) => (
                                    <tr key={pack.id} className="hover:bg-neutral-50 transition-colors">
                                        <td className="px-4 py-3">
                                            <Link
                                                href={`/admin/production-packs/${pack.id}`}
                                                className="font-medium text-black hover:underline"
                                            >
                                                {pack.title}
                                            </Link>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-600">
                                            {pack.client_name || pack.content.cover.clientName || (
                                                <span className="text-neutral-400">—</span>
                                            )}
                                            {(pack.project_name || pack.content.cover.projectName) && (
                                                <span className="block text-xs text-neutral-400">
                                                    {pack.project_name || pack.content.cover.projectName}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500 tabular-nums">
                                            {pack.content.sections.length}
                                        </td>
                                        <td className="px-4 py-3">
                                            <StatusChip status={pack.status} />
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">
                                            <span title={formatDate(pack.updated_at)}>
                                                {getRelativeTime(pack.updated_at)}
                                            </span>
                                        </td>
                                        <td className="px-4 py-3">
                                            <RowActions id={pack.id} title={pack.title} />
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {packs.length > 0 && (
                <div className="mt-4 text-sm text-neutral-500">
                    showing {packs.length} {packs.length === 1 ? 'pack' : 'packs'}
                </div>
            )}
        </div>
    );
}

function StatusChip({ status }: { status: ProductionPackStatus }) {
    const variants: Record<ProductionPackStatus, 'draft' | 'done' | 'paused'> = {
        draft: 'draft',
        ready: 'done',
        archived: 'paused',
    };
    return <Chip variant={variants[status]}>{status}</Chip>;
}
