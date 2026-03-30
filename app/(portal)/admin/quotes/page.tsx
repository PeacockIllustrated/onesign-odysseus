import { createServerClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { Plus, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { Quote } from '@/lib/quoter/types';

const PAGE_SIZE = 25;

interface SearchParams {
    status?: string;
    search?: string;
    page?: string;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function formatPence(pence: number): string {
    return `£${(pence / 100).toFixed(2)}`;
}

function getStatusVariant(status: string): 'draft' | 'review' | 'approved' | 'done' | 'default' {
    switch (status) {
        case 'draft': return 'draft';
        case 'sent': return 'review';
        case 'accepted': return 'approved';
        case 'rejected': return 'default';
        case 'expired': return 'default';
        default: return 'default';
    }
}

function buildPageUrl(params: SearchParams, page: number): string {
    const searchParams = new URLSearchParams();
    if (params.status && params.status !== 'all') searchParams.set('status', params.status);
    if (params.search) searchParams.set('search', params.search);
    if (page > 1) searchParams.set('page', String(page));
    const qs = searchParams.toString();
    return `/app/admin/quotes${qs ? `?${qs}` : ''}`;
}

export default async function AdminQuotesPage({
    searchParams,
}: {
    searchParams: Promise<SearchParams>;
}) {
    await requireAdmin();

    const params = await searchParams;
    const currentPage = Math.max(1, parseInt(params.page || '1', 10) || 1);
    const from = (currentPage - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const supabase = await createServerClient();

    // Build query with count
    let query = supabase
        .from('quotes')
        .select(`
            *,
            quote_items (line_total_pence)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (params.status && params.status !== 'all') {
        query = query.eq('status', params.status);
    }

    if (params.search) {
        const safe = params.search.replace(/[,()]/g, '').trim();
        if (safe) {
            query = query.or(`quote_number.ilike.%${safe}%,customer_name.ilike.%${safe}%`);
        }
    }

    const { data: quotes, error, count } = await query;

    if (error) {
        console.error('Error fetching quotes:', error);
    }

    const totalCount = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    // Calculate totals for each quote
    const quotesWithTotals = (quotes || []).map((q) => {
        const items = q.quote_items as Array<{ line_total_pence: number }> || [];
        const total = items.reduce((sum, item) => sum + (item.line_total_pence || 0), 0);
        return { ...q, total_pence: total };
    });

    return (
        <div>
            <PageHeader
                title="Quotes"
                description="Internal quoter for signage projects"
                action={
                    <Link
                        href="/app/admin/quotes/new"
                        className="btn-primary flex items-center gap-2"
                    >
                        <Plus size={16} />
                        New Quote
                    </Link>
                }
            />

            {/* Filters */}
            <Card className="mb-6">
                <form method="get" className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                    <div className="flex-1 relative min-w-0">
                        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                        <input
                            type="text"
                            name="search"
                            placeholder="Search by quote number or customer..."
                            defaultValue={params.search || ''}
                            className="w-full pl-10 pr-4 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>

                    <div className="flex items-center gap-3">
                        <select
                            name="status"
                            defaultValue={params.status || 'all'}
                            className="flex-1 sm:flex-none px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        >
                            <option value="all">All Statuses</option>
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="accepted">Accepted</option>
                            <option value="rejected">Rejected</option>
                            <option value="expired">Expired</option>
                        </select>

                        <button
                            type="submit"
                            className="px-4 py-2 text-sm font-medium bg-neutral-100 hover:bg-neutral-200 rounded-[var(--radius-sm)] whitespace-nowrap"
                        >
                            Filter
                        </button>
                    </div>
                </form>
            </Card>

            {/* Quotes List */}
            <Card>
                {quotesWithTotals.length === 0 ? (
                    <div className="py-12 text-center">
                        <p className="text-sm text-neutral-500 mb-4">No quotes found</p>
                        <Link
                            href="/app/admin/quotes/new"
                            className="text-sm text-blue-600 hover:underline"
                        >
                            Create your first quote
                        </Link>
                    </div>
                ) : (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-neutral-200">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Quote #</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Customer</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Items</th>
                                        <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase tracking-wide">Total</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {quotesWithTotals.map((quote) => (
                                        <tr
                                            key={quote.id}
                                            className="hover:bg-neutral-50 cursor-pointer"
                                        >
                                            <td className="px-4 py-3">
                                                <Link
                                                    href={`/app/admin/quotes/${quote.id}`}
                                                    className="text-sm font-medium text-blue-600 hover:underline"
                                                >
                                                    {quote.quote_number}
                                                </Link>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-700">
                                                {quote.customer_name || <span className="text-neutral-400">—</span>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Chip variant={getStatusVariant(quote.status)}>
                                                    {quote.status}
                                                </Chip>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-700">
                                                {(quote.quote_items as unknown[])?.length || 0}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-900 font-medium text-right">
                                                {formatPence(quote.total_pence)}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-500">
                                                {formatDate(quote.created_at)}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between px-4 py-3 border-t border-neutral-200">
                                <p className="text-xs text-neutral-500">
                                    Showing {from + 1}–{Math.min(from + PAGE_SIZE, totalCount)} of {totalCount} quotes
                                </p>
                                <div className="flex items-center gap-1">
                                    {currentPage > 1 ? (
                                        <Link
                                            href={buildPageUrl(params, currentPage - 1)}
                                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-[var(--radius-sm)]"
                                        >
                                            <ChevronLeft size={16} />
                                        </Link>
                                    ) : (
                                        <span className="p-1.5 text-neutral-300 cursor-not-allowed">
                                            <ChevronLeft size={16} />
                                        </span>
                                    )}

                                    {Array.from({ length: totalPages }, (_, i) => i + 1)
                                        .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                        .reduce<(number | 'ellipsis')[]>((acc, p, i, arr) => {
                                            if (i > 0 && p - (arr[i - 1] as number) > 1) {
                                                acc.push('ellipsis');
                                            }
                                            acc.push(p);
                                            return acc;
                                        }, [])
                                        .map((item, i) =>
                                            item === 'ellipsis' ? (
                                                <span key={`ellipsis-${i}`} className="px-2 text-xs text-neutral-400">…</span>
                                            ) : (
                                                <Link
                                                    key={item}
                                                    href={buildPageUrl(params, item)}
                                                    className={`px-2.5 py-1 text-xs font-medium rounded-[var(--radius-sm)] ${
                                                        item === currentPage
                                                            ? 'bg-black text-white'
                                                            : 'text-neutral-600 hover:bg-neutral-100'
                                                    }`}
                                                >
                                                    {item}
                                                </Link>
                                            )
                                        )}

                                    {currentPage < totalPages ? (
                                        <Link
                                            href={buildPageUrl(params, currentPage + 1)}
                                            className="p-1.5 text-neutral-500 hover:text-neutral-900 hover:bg-neutral-100 rounded-[var(--radius-sm)]"
                                        >
                                            <ChevronRight size={16} />
                                        </Link>
                                    ) : (
                                        <span className="p-1.5 text-neutral-300 cursor-not-allowed">
                                            <ChevronRight size={16} />
                                        </span>
                                    )}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </Card>
        </div>
    );
}
