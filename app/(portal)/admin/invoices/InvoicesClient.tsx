'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, FileText, Loader2, X } from 'lucide-react';
import {
    getInvoiceListAction,
    getQuotesAvailableForInvoicing,
    createInvoiceFromQuote,
} from '@/lib/invoices/actions';
import { getOrgListAction } from '@/lib/production/actions';
import {
    INVOICE_STATUS_LABELS,
    INVOICE_STATUS_COLORS,
    formatPence,
} from '@/lib/invoices/utils';
import type { Invoice, InvoiceStatus } from '@/lib/invoices/types';

const STATUS_TABS = ['all', 'draft', 'sent', 'paid', 'overdue', 'cancelled'] as const;

interface InvoicesClientProps {
    initialInvoices: Invoice[];
}

export function InvoicesClient({ initialInvoices }: InvoicesClientProps) {
    const router = useRouter();
    const [invoices, setInvoices] = useState(initialInvoices);
    const [activeStatus, setActiveStatus] = useState('all');
    const [search, setSearch] = useState('');
    const [, startTransition] = useTransition();
    const [showNewModal, setShowNewModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function handleFilterChange(status: string, searchValue: string) {
        startTransition(async () => {
            const updated = await getInvoiceListAction({
                status: status !== 'all' ? status : undefined,
                search: searchValue || undefined,
            });
            setInvoices(updated);
        });
    }

    function handleStatusTab(status: string) {
        setActiveStatus(status);
        handleFilterChange(status, search);
    }

    function handleSearch(value: string) {
        setSearch(value);
        handleFilterChange(activeStatus, value);
    }

    function formatDate(dateStr: string | null) {
        if (!dateStr) return '—';
        return new Date(dateStr).toLocaleDateString('en-GB', {
            day: '2-digit',
            month: 'short',
            year: 'numeric',
        });
    }

    return (
        <div className="p-6 max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-semibold text-neutral-900">Invoices</h1>
                    <p className="text-sm text-neutral-500 mt-0.5">
                        {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
                    </p>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800"
                >
                    <Plus size={16} />
                    New Invoice
                </button>
            </div>

            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{errorMessage}</span>
                    <button onClick={() => setErrorMessage(null)}>
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex gap-1 flex-wrap">
                    {STATUS_TABS.map((tab) => (
                        <button
                            key={tab}
                            onClick={() => handleStatusTab(tab)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                activeStatus === tab
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                        >
                            {tab === 'all'
                                ? 'All'
                                : INVOICE_STATUS_LABELS[tab as InvoiceStatus]}
                        </button>
                    ))}
                </div>
                <div className="relative sm:ml-auto">
                    <Search
                        size={14}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                    />
                    <input
                        value={search}
                        onChange={(e) => handleSearch(e.target.value)}
                        placeholder="Search invoices..."
                        className="pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] w-64 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
            </div>

            {/* Table */}
            {invoices.length === 0 ? (
                <div className="text-center py-16 text-neutral-400">
                    <FileText size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No invoices found</p>
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Invoice #
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Customer
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">
                                    Project
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Status
                                </th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">
                                    Total
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">
                                    Date
                                </th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">
                                    Due
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {invoices.map((invoice) => (
                                <tr
                                    key={invoice.id}
                                    onClick={() =>
                                        router.push(`/admin/invoices/${invoice.id}`)
                                    }
                                    className="hover:bg-neutral-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-900">
                                        {invoice.invoice_number}
                                    </td>
                                    <td className="px-4 py-3 font-medium text-neutral-900">
                                        {invoice.customer_name}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-600 hidden md:table-cell max-w-xs truncate">
                                        {invoice.project_name || '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span
                                            className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${INVOICE_STATUS_COLORS[invoice.status]}`}
                                        >
                                            {INVOICE_STATUS_LABELS[invoice.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-neutral-900">
                                        {formatPence(invoice.total_pence)}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">
                                        {formatDate(invoice.invoice_date)}
                                    </td>
                                    <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">
                                        {formatDate(invoice.due_date)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* New Invoice Modal */}
            {showNewModal && (
                <NewInvoiceModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={(id) => router.push(`/admin/invoices/${id}`)}
                    onError={setErrorMessage}
                />
            )}
        </div>
    );
}

function NewInvoiceModal({
    onClose,
    onCreated,
    onError,
}: {
    onClose: () => void;
    onCreated: (id: string) => void;
    onError: (msg: string) => void;
}) {
    const [quotes, setQuotes] = useState<
        Array<{
            id: string;
            quote_number: string;
            customer_name: string | null;
            total_pence: number;
            org_id: string | null;
        }>
    >([]);
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [creatingId, setCreatingId] = useState<string | null>(null);

    useEffect(() => {
        Promise.all([getQuotesAvailableForInvoicing(), getOrgListAction()]).then(
            ([quotesData, orgsData]) => {
                setQuotes(quotesData);
                setOrgs(orgsData);
                setLoading(false);
            }
        );
    }, []);

    async function handleSelect(quote: {
        id: string;
        org_id: string | null;
    }) {
        const orgId = quote.org_id || orgs[0]?.id;
        if (!orgId) {
            onError('No organisation found');
            onClose();
            return;
        }

        setCreatingId(quote.id);
        try {
            const result = await createInvoiceFromQuote({
                quote_id: quote.id,
                org_id: orgId,
            });
            if ('error' in result) {
                onError(result.error);
                onClose();
            } else {
                onCreated(result.id);
            }
        } finally {
            setCreatingId(null);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2 className="text-base font-semibold text-neutral-900">
                        New Invoice
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-900"
                    >
                        <X size={18} />
                    </button>
                </div>
                <div className="p-5">
                    <p className="text-sm text-neutral-500 mb-4">
                        Select an accepted quote to generate an invoice from.
                    </p>

                    {loading ? (
                        <div className="flex items-center justify-center py-8">
                            <Loader2
                                size={20}
                                className="animate-spin text-neutral-400"
                            />
                        </div>
                    ) : quotes.length === 0 ? (
                        <div className="text-center py-8 text-neutral-400">
                            <FileText
                                size={24}
                                className="mx-auto mb-2 opacity-30"
                            />
                            <p className="text-sm">
                                No accepted quotes available for invoicing
                            </p>
                        </div>
                    ) : (
                        <ul className="divide-y divide-neutral-100 max-h-72 overflow-y-auto -mx-5 px-5">
                            {quotes.map((q) => (
                                <li key={q.id}>
                                    <button
                                        onClick={() => handleSelect(q)}
                                        disabled={creatingId !== null}
                                        className="w-full flex items-center justify-between py-3 px-2 -mx-2 rounded hover:bg-neutral-50 transition-colors disabled:opacity-50 text-left"
                                    >
                                        <div>
                                            <span className="font-mono text-xs font-medium text-neutral-900">
                                                {q.quote_number}
                                            </span>
                                            {q.customer_name && (
                                                <span className="ml-2 text-sm text-neutral-600">
                                                    {q.customer_name}
                                                </span>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm font-medium text-neutral-900">
                                                {formatPence(q.total_pence)}
                                            </span>
                                            {creatingId === q.id && (
                                                <Loader2
                                                    size={14}
                                                    className="animate-spin text-neutral-400"
                                                />
                                            )}
                                        </div>
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}

                    <div className="flex justify-end pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
