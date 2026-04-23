import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { AlertCircle, Bell, LayoutGrid, FileText, ShoppingCart, Zap, Receipt, Truck } from 'lucide-react';
import Link from 'next/link';
import { getProductionStats } from '@/lib/production/queries';
import { getAttentionItems } from '@/lib/notifications/queries';
import { formatPence, INVOICE_STATUS_COLORS, INVOICE_STATUS_LABELS } from '@/lib/invoices/utils';
import type { InvoiceStatus } from '@/lib/invoices/types';

export default async function AdminPage() {
    await requireAdmin();
    const supabase = createAdminClient();

    const attention = await getAttentionItems().catch(() => ({ items: [], counts: {} as Record<string, number> }));
    const urgentCount = attention.items.filter(i => i.severity === 'urgent').length;
    const actionCount = attention.items.filter(i => i.severity === 'action').length;

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

    // Invoice stats
    const { data: invoiceStats } = await supabase
        .from('invoices')
        .select('id, status, total_pence');

    const invoiceCounts = {
        draft: 0,
        sent: 0,
        paid: 0,
        overdue: 0,
    };
    let totalOutstanding = 0;
    let totalPaid = 0;
    (invoiceStats || []).forEach((inv: { id: string; status: string; total_pence: number }) => {
        if (inv.status in invoiceCounts) {
            invoiceCounts[inv.status as keyof typeof invoiceCounts]++;
        }
        if (inv.status === 'sent' || inv.status === 'overdue') {
            totalOutstanding += inv.total_pence;
        }
        if (inv.status === 'paid') {
            totalPaid += inv.total_pence;
        }
    });

    const { data: recentInvoices } = await supabase
        .from('invoices')
        .select('id, invoice_number, customer_name, status, total_pence, invoice_date')
        .order('created_at', { ascending: false })
        .limit(5);

    // Delivery stats
    const { data: deliveryStats } = await supabase
        .from('deliveries')
        .select('id, status, scheduled_date');

    const deliveryCounts = { scheduled: 0, in_transit: 0, delivered: 0, failed: 0 };
    let overdueDeliveries = 0;
    const todayStr = new Date().toISOString().split('T')[0];
    (deliveryStats || []).forEach((d: any) => {
        if (d.status in deliveryCounts) deliveryCounts[d.status as keyof typeof deliveryCounts]++;
        if ((d.status === 'scheduled' || d.status === 'in_transit') && d.scheduled_date < todayStr) overdueDeliveries++;
    });

    const { data: upcomingDeliveries } = await supabase
        .from('deliveries')
        .select('id, delivery_number, scheduled_date, status, driver_name')
        .in('status', ['scheduled', 'in_transit'])
        .order('scheduled_date', { ascending: true })
        .limit(5);

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

            {/* Needs Attention */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Bell size={16} className="text-[#4e7e8c]" />
                        <h2 className="text-sm font-semibold text-neutral-900">Needs Attention</h2>
                        {urgentCount > 0 && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                                {urgentCount} urgent
                            </span>
                        )}
                        {actionCount > 0 && (
                            <span className="text-[10px] font-semibold uppercase tracking-wider bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                                {actionCount} action
                            </span>
                        )}
                    </div>
                </div>

                <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 divide-y divide-neutral-100">
                    {attention.items.length === 0 ? (
                        <p className="text-sm text-neutral-400 text-center py-6">Nothing needs attention right now ✓</p>
                    ) : (
                        attention.items.slice(0, 8).map((item, idx) => {
                            const dot =
                                item.severity === 'urgent' ? 'bg-red-500'
                                : item.severity === 'action' ? 'bg-amber-500'
                                : 'bg-neutral-300';
                            return (
                                <Link
                                    key={`${item.kind}-${idx}`}
                                    href={item.href}
                                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition-colors"
                                >
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${dot}`} aria-hidden />
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm text-neutral-900 truncate">{item.title}</p>
                                        {item.detail && (
                                            <p className="text-xs text-neutral-500 truncate">{item.detail}</p>
                                        )}
                                    </div>
                                    {item.timestamp && (
                                        <span className="text-[11px] text-neutral-400 shrink-0">
                                            {new Date(item.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                                        </span>
                                    )}
                                </Link>
                            );
                        })
                    )}
                    {attention.items.length > 8 && (
                        <div className="px-4 py-2 text-xs text-neutral-500 text-center">
                            +{attention.items.length - 8} more
                        </div>
                    )}
                </div>
            </div>

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
                                        href="/admin/jobs"
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

            {/* Invoices */}
            <div className="mb-6">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <Receipt size={15} className="text-neutral-500" />
                        <h2 className="text-sm font-semibold text-neutral-900">Invoices</h2>
                    </div>
                    <Link href="/admin/invoices" className="text-xs text-neutral-500 hover:underline">View all</Link>
                </div>

                <div className="bg-white rounded-[var(--radius-md)] border border-neutral-200 p-4">
                    {/* Stats grid */}
                    <div className="grid grid-cols-4 gap-3 mb-4">
                        {([
                            { key: 'draft' as const, color: 'bg-neutral-50 border-neutral-200', textColor: 'text-neutral-600' },
                            { key: 'sent' as const, color: 'bg-blue-50 border-blue-200', textColor: 'text-blue-700' },
                            { key: 'overdue' as const, color: 'bg-red-50 border-red-200', textColor: 'text-red-600' },
                            { key: 'paid' as const, color: 'bg-green-50 border-green-200', textColor: 'text-green-700' },
                        ]).map(({ key, color, textColor }) => (
                            <div key={key} className={`rounded border p-2.5 text-center ${color}`}>
                                <span className={`text-2xl font-bold ${textColor}`}>{invoiceCounts[key]}</span>
                                <p className={`text-[10px] font-medium mt-0.5 ${textColor}`}>{INVOICE_STATUS_LABELS[key]}</p>
                            </div>
                        ))}
                    </div>

                    {/* Outstanding / Paid summary */}
                    <div className="flex items-center gap-4 mb-4 text-sm">
                        <div>
                            <span className="text-neutral-500">Outstanding:</span>{' '}
                            <span className="font-semibold text-neutral-900">{formatPence(totalOutstanding)}</span>
                        </div>
                        <div>
                            <span className="text-neutral-500">Collected:</span>{' '}
                            <span className="font-semibold text-green-700">{formatPence(totalPaid)}</span>
                        </div>
                    </div>

                    {/* Recent invoices mini-table */}
                    {(recentInvoices && recentInvoices.length > 0) ? (
                        <div className="border-t border-neutral-100 pt-3">
                            <p className="text-[10px] font-medium text-neutral-400 uppercase tracking-wider mb-2">Recent Invoices</p>
                            <div className="space-y-1.5">
                                {recentInvoices.map((inv: { id: string; invoice_number: string; customer_name: string; status: string; total_pence: number; invoice_date: string }) => (
                                    <Link
                                        key={inv.id}
                                        href={`/admin/invoices/${inv.id}`}
                                        className="flex items-center justify-between p-1.5 rounded hover:bg-neutral-50 transition-colors"
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <span className="text-xs font-medium text-neutral-900 shrink-0">{inv.invoice_number}</span>
                                            <span className="text-xs text-neutral-500 truncate">{inv.customer_name}</span>
                                        </div>
                                        <div className="flex items-center gap-2 shrink-0 ml-2">
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${INVOICE_STATUS_COLORS[inv.status as InvoiceStatus] || ''}`}>
                                                {INVOICE_STATUS_LABELS[inv.status as InvoiceStatus] || inv.status}
                                            </span>
                                            <span className="text-xs font-medium text-neutral-700">{formatPence(inv.total_pence)}</span>
                                        </div>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-neutral-400 text-center py-2">No invoices yet</p>
                    )}
                </div>
            </div>

            {/* Deliveries */}
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-4">
                    <Truck size={18} className="text-neutral-500" />
                    <h2 className="text-sm font-semibold text-neutral-900">Deliveries</h2>
                    <Link href="/admin/deliveries" className="ml-auto text-xs text-[#4e7e8c] hover:underline">View all →</Link>
                </div>

                {/* Stats grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                    <div className="bg-blue-50 rounded-lg p-3">
                        <p className="text-2xl font-bold text-blue-700">{deliveryCounts.scheduled}</p>
                        <p className="text-xs text-blue-600">Scheduled</p>
                    </div>
                    <div className="bg-amber-50 rounded-lg p-3">
                        <p className="text-2xl font-bold text-amber-700">{deliveryCounts.in_transit}</p>
                        <p className="text-xs text-amber-600">In Transit</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-3">
                        <p className="text-2xl font-bold text-green-700">{deliveryCounts.delivered}</p>
                        <p className="text-xs text-green-600">Delivered</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-3">
                        <p className="text-2xl font-bold text-red-700">{overdueDeliveries}</p>
                        <p className="text-xs text-red-600">Overdue</p>
                    </div>
                </div>

                {/* Upcoming deliveries */}
                {upcomingDeliveries && upcomingDeliveries.length > 0 && (
                    <div className="bg-white rounded-lg border border-neutral-200 divide-y divide-neutral-100">
                        {upcomingDeliveries.map((d: any) => (
                            <Link key={d.id} href={`/admin/deliveries/${d.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-neutral-50 transition-colors">
                                <div>
                                    <code className="text-xs font-mono text-[#4e7e8c] font-semibold">{d.delivery_number}</code>
                                    {d.driver_name && <span className="text-xs text-neutral-500 ml-2">{d.driver_name}</span>}
                                </div>
                                <span className="text-xs text-neutral-500">{new Date(d.scheduled_date + 'T12:00:00').toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}</span>
                            </Link>
                        ))}
                    </div>
                )}
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
