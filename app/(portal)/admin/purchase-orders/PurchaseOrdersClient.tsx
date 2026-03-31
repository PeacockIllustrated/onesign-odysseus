'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, FileText, Loader2, X } from 'lucide-react';
import { getPoListAction, createPoAction } from '@/lib/purchase-orders/actions';
import { getOrgListAction } from '@/lib/production/actions';
import {
    PO_STATUS_LABELS,
    PO_STATUS_COLORS,
    formatPence,
} from '@/lib/purchase-orders/utils';
import type { PurchaseOrder } from '@/lib/purchase-orders/types';

const STATUS_TABS = ['all', 'draft', 'sent', 'acknowledged', 'completed', 'cancelled'] as const;

interface PurchaseOrdersClientProps {
    initialPos: PurchaseOrder[];
}

export function PurchaseOrdersClient({ initialPos }: PurchaseOrdersClientProps) {
    const router = useRouter();
    const [pos, setPos] = useState(initialPos);
    const [activeStatus, setActiveStatus] = useState('all');
    const [search, setSearch] = useState('');
    const [, startTransition] = useTransition();
    const [showNewModal, setShowNewModal] = useState(false);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);

    function handleFilterChange(status: string, searchValue: string) {
        startTransition(async () => {
            const updated = await getPoListAction({
                status: status !== 'all' ? status : undefined,
                search: searchValue || undefined,
            });
            setPos(updated);
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

    function formatDate(dateStr: string) {
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
                    <h1 className="text-xl font-semibold text-neutral-900">Purchase Orders</h1>
                    <p className="text-sm text-neutral-500 mt-0.5">{pos.length} order{pos.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => setShowNewModal(true)}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800"
                >
                    <Plus size={16} />
                    New PO
                </button>
            </div>

            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <span className="text-sm font-medium">{errorMessage}</span>
                    <button onClick={() => setErrorMessage(null)}><X size={14} /></button>
                </div>
            )}

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-4">
                <div className="flex gap-1 flex-wrap">
                    {STATUS_TABS.map(tab => (
                        <button
                            key={tab}
                            onClick={() => handleStatusTab(tab)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                                activeStatus === tab
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                        >
                            {tab === 'all' ? 'All' : PO_STATUS_LABELS[tab as keyof typeof PO_STATUS_LABELS]}
                        </button>
                    ))}
                </div>
                <div className="relative sm:ml-auto">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
                    <input
                        value={search}
                        onChange={e => handleSearch(e.target.value)}
                        placeholder="Search POs..."
                        className="pl-8 pr-3 py-1.5 text-sm border border-neutral-200 rounded-[var(--radius-sm)] w-64 focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>
            </div>

            {/* Table */}
            {pos.length === 0 ? (
                <div className="text-center py-16 text-neutral-400">
                    <FileText size={32} className="mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No purchase orders found</p>
                </div>
            ) : (
                <div className="border border-neutral-200 rounded-[var(--radius-sm)] overflow-hidden">
                    <table className="w-full text-sm">
                        <thead className="bg-neutral-50 border-b border-neutral-200">
                            <tr>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">PO Number</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Supplier</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden md:table-cell">Description</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Status</th>
                                <th className="text-right px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide">Total</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-neutral-500 uppercase tracking-wide hidden lg:table-cell">Issued</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {pos.map(po => (
                                <tr
                                    key={po.id}
                                    onClick={() => router.push(`/admin/purchase-orders/${po.id}`)}
                                    className="hover:bg-neutral-50 cursor-pointer transition-colors"
                                >
                                    <td className="px-4 py-3 font-mono text-xs font-medium text-neutral-900">{po.po_number}</td>
                                    <td className="px-4 py-3 font-medium text-neutral-900">{po.supplier_name}</td>
                                    <td className="px-4 py-3 text-neutral-600 hidden md:table-cell max-w-xs truncate">{po.description}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${PO_STATUS_COLORS[po.status]}`}>
                                            {PO_STATUS_LABELS[po.status]}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-right font-medium text-neutral-900">{formatPence(po.total_pence)}</td>
                                    <td className="px-4 py-3 text-neutral-500 hidden lg:table-cell">{formatDate(po.issue_date)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {/* New PO Modal */}
            {showNewModal && (
                <NewPoModal
                    onClose={() => setShowNewModal(false)}
                    onCreated={(id) => router.push(`/admin/purchase-orders/${id}`)}
                    onError={setErrorMessage}
                />
            )}
        </div>
    );
}

function NewPoModal({
    onClose,
    onCreated,
    onError,
}: {
    onClose: () => void;
    onCreated: (id: string) => void;
    onError: (msg: string) => void;
}) {
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
    const [orgsLoading, setOrgsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        org_id: '',
        supplier_name: '',
        description: '',
        required_by_date: '',
    });

    useEffect(() => {
        getOrgListAction().then(data => {
            setOrgs(data);
            if (data.length > 0) setForm(f => ({ ...f, org_id: data[0].id }));
            setOrgsLoading(false);
        });
    }, []);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.supplier_name.trim() || !form.description.trim() || !form.org_id) return;
        setIsSaving(true);
        try {
            const result = await createPoAction({
                org_id: form.org_id,
                supplier_name: form.supplier_name.trim(),
                description: form.description.trim(),
                required_by_date: form.required_by_date || undefined,
            });
            if ('error' in result) {
                onError(result.error);
                onClose();
            } else {
                onCreated(result.id);
            }
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
            <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2 className="text-base font-semibold text-neutral-900">New Purchase Order</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900"><X size={18} /></button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    {orgs.length > 1 && (
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Client Org</label>
                            <select
                                value={form.org_id}
                                onChange={e => setForm(f => ({ ...f, org_id: e.target.value }))}
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                            >
                                {orgs.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                    )}
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Name <span className="text-red-500">*</span></label>
                        <input
                            required
                            value={form.supplier_name}
                            onChange={e => setForm(f => ({ ...f, supplier_name: e.target.value }))}
                            placeholder="e.g. Invacare Print Supplies"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Description <span className="text-red-500">*</span></label>
                        <input
                            required
                            value={form.description}
                            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                            placeholder="e.g. Vinyl wrap for HQ fascia"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Required By</label>
                        <input
                            type="date"
                            value={form.required_by_date}
                            onChange={e => setForm(f => ({ ...f, required_by_date: e.target.value }))}
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div className="flex justify-end gap-3 pt-2">
                        <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
                        <button
                            type="submit"
                            disabled={isSaving || orgsLoading}
                            className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-50"
                        >
                            {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                            Create PO
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
