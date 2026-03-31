import { createServerClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { AlertCircle, LayoutGrid, FileText, ShoppingCart, Zap } from 'lucide-react';
import Link from 'next/link';
import { getProductionStats } from '@/lib/production/queries';

export default async function AdminPage() {
    await requireAdmin();
    const supabase = await createServerClient();

    // Production pipeline stats
    let productionStats: {
        totalActive: number;
        overdueCount: number;
        byStage: Array<{ name: string; color: string; count: number; sortOrder: number }>;
    } | null = null;
    try {
        productionStats = await getProductionStats();
    } catch {
        // Production tables not yet migrated
    }

    // Quotes pipeline by status
    const { data: quotesByStatus } = await supabase
        .from('quotes')
        .select('status')
        .not('status', 'is', null);

    const quoteCounts: Record<string, number> = {};
    for (const q of quotesByStatus || []) {
        if (q.status) quoteCounts[q.status] = (quoteCounts[q.status] || 0) + 1;
    }

    // Recent jobs needing attention (overdue)
    let overdueJobs: Array<{ id: string; title: string; due_date: string | null }> = [];
    try {
        const today = new Date().toISOString().split('T')[0];
        const { data } = await supabase
            .from('production_jobs')
            .select('id, title, due_date')
            .in('status', ['active', 'paused'])
            .lt('due_date', today)
            .order('due_date', { ascending: true })
            .limit(5);
        overdueJobs = (data || []) as typeof overdueJobs;
    } catch {
        // production tables not available
    }

    // Accepted quotes not yet converted to jobs
    let pendingConversions = 0;
    try {
        const { data: existingJobs } = await supabase
            .from('production_jobs')
            .select('quote_id')
            .not('quote_id', 'is', null);
        const convertedIds = (existingJobs || []).map((j: { quote_id: string | null }) => j.quote_id).filter(Boolean);
        const baseQuery = supabase
            .from('quotes')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'accepted');
        const { count } = convertedIds.length > 0
            ? await baseQuery.not('id', 'in', `(${convertedIds.join(',')})`)
            : await baseQuery;
        pendingConversions = count || 0;
    } catch {
        // production tables not available
    }

    const quoteStatusOrder = ['draft', 'sent', 'accepted', 'rejected', 'cancelled'];
    const quoteStatusLabels: Record<string, string> = {
        draft: 'Draft',
        sent: 'Sent',
        accepted: 'Accepted',
        rejected: 'Rejected',
        cancelled: 'Cancelled',
    };
    const quoteStatusColors: Record<string, string> = {
        draft: 'bg-neutral-100 text-neutral-600',
        sent: 'bg-blue-50 text-blue-700',
        accepted: 'bg-green-50 text-green-700',
        rejected: 'bg-red-50 text-red-600',
        cancelled: 'bg-neutral-100 text-neutral-400',
    };

    return (
        <div>
            <PageHeader
                title="Dashboard"
                description="Production pipeline and operations overview"
            />

            {/* Production Pipeline — hero section */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <LayoutGrid size={16} className="text-[#4e7e8c]" />
                        <h2 className="text-sm font-semibold text-neutral-900">Production Pipeline</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <Link href="/shop-floor" className="text-xs text-neutral-500 hover:text-neutral-700">
                            Shop floor →
                        </Link>
                        <Link href="/admin/jobs" className="text-xs text-[#4e7e8c] hover:underline">
                            View board →
                        </Link>
                    </div>
                </div>

                {productionStats === null ? (
                    <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 p-6 text-center text-sm text-neutral-400">
                        Production pipeline not yet set up. Run the database migrations to enable.
                    </div>
                ) : (
                    <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 p-4">
                        {/* Summary row */}
                        <div className="flex items-center gap-6 mb-4">
                            <div>
                                <span className="text-3xl font-bold text-neutral-900">{productionStats.totalActive}</span>
                                <span className="text-sm text-neutral-500 ml-2">jobs in production</span>
                            </div>
                            {productionStats.overdueCount > 0 && (
                                <Link href="/admin/jobs" className="flex items-center gap-1.5 text-red-600 hover:text-red-700">
                                    <AlertCircle size={15} />
                                    <span className="text-sm font-semibold">{productionStats.overdueCount} overdue</span>
                                </Link>
                            )}
                            {pendingConversions > 0 && (
                                <Link href="/admin/quotes" className="flex items-center gap-1.5 text-amber-600 hover:text-amber-700">
                                    <AlertCircle size={15} />
                                    <span className="text-sm font-semibold">{pendingConversions} accepted quote{pendingConversions !== 1 ? 's' : ''} to convert</span>
                                </Link>
                            )}
                        </div>

                        {/* Stage breakdown */}
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                            {productionStats.byStage.map(stage => (
                                <Link
                                    key={stage.name}
                                    href="/admin/jobs"
                                    className="flex flex-col items-center gap-1 p-2.5 rounded border text-center hover:opacity-80 transition-opacity"
                                    style={{
                                        backgroundColor: `${stage.color}12`,
                                        borderColor: `${stage.color}35`,
                                    }}
                                >
                                    <span
                                        className="text-2xl font-bold"
                                        style={{ color: stage.color }}
                                    >
                                        {stage.count}
                                    </span>
                                    <span className="text-[10px] font-medium text-neutral-500 leading-tight">
                                        {stage.name}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    </div>
                )}
            </div>

            {/* Overdue jobs + Quotes pipeline */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {/* Overdue jobs */}
                {productionStats !== null && (
                    <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 p-4">
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <AlertCircle size={15} className="text-red-500" />
                                <h2 className="text-sm font-semibold text-neutral-900">Overdue Jobs</h2>
                            </div>
                            <Link href="/admin/jobs" className="text-xs text-neutral-500 hover:underline">View all</Link>
                        </div>
                        {overdueJobs.length === 0 ? (
                            <p className="text-sm text-green-600 py-3 text-center">No overdue jobs ✓</p>
                        ) : (
                            <div className="space-y-2">
                                {overdueJobs.map(job => (
                                    <Link
                                        key={job.id}
                                        href={`/admin/jobs/${job.id}`}
                                        className="flex items-center justify-between p-2 rounded hover:bg-neutral-50 transition-colors"
                                    >
                                        <span className="text-sm text-neutral-900 truncate">{job.title}</span>
                                        <span className="text-xs text-red-600 shrink-0 ml-2">
                                            {job.due_date ? new Date(job.due_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''}
                                        </span>
                                    </Link>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Quotes pipeline */}
                <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <FileText size={15} className="text-neutral-500" />
                            <h2 className="text-sm font-semibold text-neutral-900">Quotes Pipeline</h2>
                        </div>
                        <Link href="/admin/quotes" className="text-xs text-neutral-500 hover:underline">View all</Link>
                    </div>
                    <div className="space-y-2">
                        {quoteStatusOrder.filter(s => (quoteCounts[s] || 0) > 0).map(status => (
                            <div key={status} className="flex items-center justify-between">
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${quoteStatusColors[status]}`}>
                                    {quoteStatusLabels[status]}
                                </span>
                                <span className="text-sm font-semibold text-neutral-900">{quoteCounts[status]}</span>
                            </div>
                        ))}
                        {Object.keys(quoteCounts).length === 0 && (
                            <p className="text-sm text-neutral-400 py-3 text-center">No quotes yet</p>
                        )}
                    </div>
                </div>
            </div>

            {/* Quick links */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[
                    { href: '/admin/jobs', label: 'Job Board', sublabel: 'Kanban pipeline', icon: LayoutGrid, color: '#4e7e8c' },
                    { href: '/shop-floor', label: 'Shop Floor', sublabel: 'Department queues', icon: Zap, color: '#7c6f4e' },
                    { href: '/admin/quotes', label: 'Quotes', sublabel: 'Create & manage', icon: FileText, color: '#4e6e8c' },
                    { href: '/admin/purchase-orders', label: 'Purchase Orders', sublabel: 'Supplier POs', icon: ShoppingCart, color: '#4e8c6e' },
                ].map(item => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className="bg-white rounded-[var(--radius-md)] border border-neutral-200 p-4 hover:border-neutral-300 hover:shadow-sm transition-all"
                    >
                        <item.icon size={20} style={{ color: item.color }} className="mb-2" />
                        <p className="text-sm font-semibold text-neutral-900">{item.label}</p>
                        <p className="text-xs text-neutral-500 mt-0.5">{item.sublabel}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
