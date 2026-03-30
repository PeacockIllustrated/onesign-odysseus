import { requireAdmin } from '@/lib/auth';
import { getDesignPacks } from '@/lib/design-packs/actions';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { formatDate, getRelativeTime } from '@/lib/design-packs/utils';
import { DesignPackStatus } from '@/lib/design-packs/types';

interface SearchParams {
    status?: string;
    search?: string;
}

export default async function DesignPacksPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    await requireAdmin();

    const params = await searchParams;
    const packs = await getDesignPacks({
        status: params.status,
        search: params.search,
    });

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="design packs"
                description="interactive design presentation tool for client sessions"
                action={
                    <Link href="/admin/design-packs/new" className="btn-primary">
                        new design pack
                    </Link>
                }
            />

            {/* Filters */}
            <Card className="mb-6">
                <form method="get" className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <input
                        type="text"
                        name="search"
                        placeholder="search by project or client name..."
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
                            <option value="in_progress">in progress</option>
                            <option value="completed">completed</option>
                            <option value="exported">exported</option>
                        </select>
                        <button type="submit" className="btn-secondary whitespace-nowrap">
                            filter
                        </button>
                    </div>
                </form>
            </Card>

            {/* Design Packs Table */}
            {packs.length === 0 ? (
                <Card>
                    <div className="text-center py-12">
                        <p className="text-neutral-500 mb-4">no design packs found</p>
                        {params.search || (params.status && params.status !== 'all') ? (
                            <Link
                                href="/admin/design-packs"
                                className="text-sm text-neutral-600 hover:text-black underline"
                            >
                                clear filters
                            </Link>
                        ) : (
                            <Link href="/admin/design-packs/new" className="btn-primary">
                                create your first design pack
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
                                        project
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        client
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        status
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        progress
                                    </th>
                                    <th className="text-left px-4 py-3 text-xs font-medium text-neutral-500 uppercase tracking-wider">
                                        last updated
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {packs.map((pack) => {
                                    // Calculate progress
                                    const sectionsCompleted = [
                                        pack.data_json.typography?.locked,
                                        pack.data_json.colours?.locked,
                                        pack.data_json.graphic_style?.locked,
                                        pack.data_json.materials?.locked,
                                        pack.data_json.sign_types?.length > 0,
                                        pack.data_json.environment_previews?.length > 0,
                                    ].filter(Boolean).length;
                                    const totalSections = 6;
                                    const progressPercent = Math.round(
                                        (sectionsCompleted / totalSections) * 100
                                    );

                                    return (
                                        <tr
                                            key={pack.id}
                                            className="hover:bg-neutral-50 transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={`/admin/design-packs/${pack.id}`}
                                                    className="font-medium text-black hover:underline"
                                                >
                                                    {pack.project_name}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-600">
                                                {pack.client_name}
                                                {pack.client_email && (
                                                    <span className="block text-xs text-neutral-400">
                                                        {pack.client_email}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusChip status={pack.status} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-2">
                                                    <div className="flex-1 h-2 bg-neutral-100 rounded-full overflow-hidden max-w-[120px]">
                                                        <div
                                                            className="h-full bg-black transition-all duration-300"
                                                            style={{
                                                                width: `${progressPercent}%`,
                                                            }}
                                                        />
                                                    </div>
                                                    <span className="text-xs text-neutral-500 tabular-nums">
                                                        {sectionsCompleted}/{totalSections}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-500">
                                                <span title={formatDate(pack.updated_at)}>
                                                    {getRelativeTime(pack.updated_at)}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* Stats Summary */}
            {packs.length > 0 && (
                <div className="mt-4 text-sm text-neutral-500">
                    showing {packs.length} design {packs.length === 1 ? 'pack' : 'packs'}
                </div>
            )}
        </div>
    );
}

function StatusChip({ status }: { status: DesignPackStatus }) {
    const variants: Record<DesignPackStatus, 'default' | 'draft' | 'done'> = {
        in_progress: 'draft',
        completed: 'default',
        exported: 'done',
    };

    const labels: Record<DesignPackStatus, string> = {
        in_progress: 'in progress',
        completed: 'completed',
        exported: 'exported',
    };

    return <Chip variant={variants[status]}>{labels[status]}</Chip>;
}
