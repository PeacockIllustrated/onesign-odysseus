'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Printer, Edit2, X, Save, Loader2,
    Plus, Trash2, AlertCircle, ExternalLink,
} from 'lucide-react';
import {
    updatePoAction,
    updatePoStatusAction,
    addPoItemAction,
    updatePoItemAction,
    deletePoItemAction,
    deletePoAction,
    getPoWithItemsAction,
} from '@/lib/purchase-orders/actions';
import {
    PO_STATUS_LABELS,
    PO_STATUS_COLORS,
    PO_STATUS_TRANSITIONS,
    formatPence,
    calcLineTotal,
} from '@/lib/purchase-orders/utils';
import type { PoWithItems, PoItem, PoStatus } from '@/lib/purchase-orders/types';

interface PurchaseOrderDetailProps {
    initialPo: PoWithItems;
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

export function PurchaseOrderDetail({ initialPo }: PurchaseOrderDetailProps) {
    const router = useRouter();
    const [po, setPo] = useState(initialPo);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [isEditing, setIsEditing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    async function refresh() {
        const updated = await getPoWithItemsAction(po.id);
        if (updated) setPo(updated);
    }

    function handleStatusChange(newStatus: PoStatus) {
        setErrorMessage(null);
        startTransition(async () => {
            const result = await updatePoStatusAction(po.id, newStatus);
            if ('error' in result) {
                setErrorMessage(result.error);
            } else {
                await refresh();
            }
        });
    }

    async function handleDelete() {
        const result = await deletePoAction(po.id);
        if ('error' in result) {
            setErrorMessage(result.error);
            setShowDeleteConfirm(false);
        } else {
            router.push('/admin/purchase-orders');
        }
    }

    const allowedTransitions = PO_STATUS_TRANSITIONS[po.status];

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-6">
                <Link href="/admin/purchase-orders" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
                    <ArrowLeft size={14} />
                    Purchase Orders
                </Link>
                <span className="text-neutral-300">/</span>
                <span className="text-sm font-medium text-neutral-900 font-mono">{po.po_number}</span>
            </div>

            {errorMessage && (
                <div className="bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span className="text-sm font-medium">{errorMessage}</span>
                    </div>
                    <button onClick={() => setErrorMessage(null)}><X size={14} /></button>
                </div>
            )}

            {/* Header card */}
            <div className="border border-neutral-200 rounded-lg p-5 mb-4">
                <div className="flex items-start justify-between mb-4">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-semibold font-mono text-neutral-900">{po.po_number}</h1>
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${PO_STATUS_COLORS[po.status]}`}>
                                {PO_STATUS_LABELS[po.status]}
                            </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{po.description}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={`/print/admin/purchase-orders/${po.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50"
                        >
                            <Printer size={12} />
                            Print
                        </a>
                        {!isEditing && (
                            <button
                                onClick={() => setIsEditing(true)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded"
                            >
                                <Edit2 size={12} />
                                Edit
                            </button>
                        )}
                    </div>
                </div>

                {isEditing ? (
                    <PoEditForm
                        po={po}
                        onSaved={async () => { setIsEditing(false); await refresh(); }}
                        onCancel={() => setIsEditing(false)}
                        onError={setErrorMessage}
                    />
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Supplier</div>
                            <div className="font-medium text-neutral-900">{po.supplier_name}</div>
                            {po.supplier_email && <div className="text-neutral-500 text-xs">{po.supplier_email}</div>}
                            {po.supplier_reference && <div className="text-neutral-500 text-xs">Ref: {po.supplier_reference}</div>}
                        </div>
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Issued</div>
                            <div className="text-neutral-900">{formatDate(po.issue_date)}</div>
                        </div>
                        {po.required_by_date && (
                            <div>
                                <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Required By</div>
                                <div className="text-neutral-900">{formatDate(po.required_by_date)}</div>
                            </div>
                        )}
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Total</div>
                            <div className="text-lg font-semibold text-neutral-900">{formatPence(po.total_pence)}</div>
                        </div>
                    </div>
                )}

                {/* Linked records */}
                {(po.linked_job || po.linked_quote) && (
                    <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-neutral-100">
                        {po.linked_job && (
                            <Link href="/admin/jobs" className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900">
                                <ExternalLink size={11} />
                                Job {po.linked_job.job_number}: {po.linked_job.title}
                            </Link>
                        )}
                        {po.linked_quote && (
                            <Link href={`/admin/quotes/${po.linked_quote.id}`} className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900">
                                <ExternalLink size={11} />
                                Quote {po.linked_quote.quote_number}{po.linked_quote.customer_name ? ` — ${po.linked_quote.customer_name}` : ''}
                            </Link>
                        )}
                    </div>
                )}
            </div>

            {/* Status workflow */}
            {allowedTransitions.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {allowedTransitions.map(next => (
                        <button
                            key={next}
                            onClick={() => handleStatusChange(next)}
                            disabled={isPending}
                            className="px-4 py-2 text-sm font-medium border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-50"
                        >
                            {next === 'sent' && 'Mark as Sent'}
                            {next === 'acknowledged' && 'Mark Acknowledged'}
                            {next === 'completed' && 'Mark Completed'}
                            {next === 'cancelled' && 'Cancel PO'}
                            {next === 'draft' && 'Reopen as Draft'}
                        </button>
                    ))}
                </div>
            )}

            {/* Line items */}
            <LineItemsSection po={po} onRefresh={refresh} onError={setErrorMessage} />

            {/* Notes */}
            {(po.notes_supplier || po.notes_internal) && (
                <div className="border border-neutral-200 rounded-lg p-5 mt-4 space-y-3">
                    {po.notes_supplier && (
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Supplier Notes</div>
                            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{po.notes_supplier}</p>
                        </div>
                    )}
                    {po.notes_internal && (
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Internal Notes</div>
                            <p className="text-sm text-neutral-600 whitespace-pre-wrap">{po.notes_internal}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Danger zone */}
            {po.status === 'draft' && (
                <div className="mt-6 pt-6 border-t border-neutral-100">
                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="text-xs text-red-600 hover:text-red-800"
                        >
                            Delete this purchase order
                        </button>
                    ) : (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-neutral-700">Are you sure? This cannot be undone.</span>
                            <button onClick={handleDelete} className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700">Delete</button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ---- Inline edit form --------------------------------------------------------

function PoEditForm({
    po,
    onSaved,
    onCancel,
    onError,
}: {
    po: PoWithItems;
    onSaved: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        supplier_name: po.supplier_name,
        supplier_email: po.supplier_email || '',
        supplier_reference: po.supplier_reference || '',
        description: po.description,
        required_by_date: po.required_by_date || '',
        notes_supplier: po.notes_supplier || '',
        notes_internal: po.notes_internal || '',
    });

    function field(name: keyof typeof form) {
        return {
            value: form[name],
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
                setForm(f => ({ ...f, [name]: e.target.value })),
        };
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setIsSaving(true);
        try {
            const result = await updatePoAction({ id: po.id, ...form });
            if ('error' in result) {
                onError(result.error);
            } else {
                onSaved();
            }
        } finally {
            setIsSaving(false);
        }
    }

    const inputCls = 'w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <form onSubmit={handleSubmit} className="space-y-4 pt-4 border-t border-neutral-100">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Name</label>
                    <input required {...field('supplier_name')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Email</label>
                    <input type="email" {...field('supplier_email')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Reference</label>
                    <input {...field('supplier_reference')} className={inputCls} />
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Description</label>
                    <input required {...field('description')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Required By</label>
                    <input type="date" {...field('required_by_date')} className={inputCls} />
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Supplier Notes <span className="normal-case text-neutral-400">(appears on PO print)</span></label>
                <textarea {...field('notes_supplier')} rows={2} className={inputCls} />
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Internal Notes</label>
                <textarea {...field('notes_internal')} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-3">
                <button type="button" onClick={onCancel} className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900">Cancel</button>
                <button type="submit" disabled={isSaving} className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-50">
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    Save
                </button>
            </div>
        </form>
    );
}

// ---- Line items section ------------------------------------------------------

function LineItemsSection({
    po,
    onRefresh,
    onError,
}: {
    po: PoWithItems;
    onRefresh: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const isEditable = po.status === 'draft';

    function handleDelete(itemId: string) {
        startTransition(async () => {
            const result = await deletePoItemAction(po.id, itemId);
            if ('error' in result) {
                onError(result.error);
            } else {
                await onRefresh();
            }
        });
    }

    return (
        <div className="border border-neutral-200 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                <h2 className="text-sm font-semibold text-neutral-900">Line Items</h2>
                {isEditable && !showAddForm && (
                    <button
                        onClick={() => setShowAddForm(true)}
                        className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                    >
                        <Plus size={14} />
                        Add Item
                    </button>
                )}
            </div>

            {po.items.length === 0 && !showAddForm ? (
                <div className="px-5 py-8 text-center text-sm text-neutral-400">
                    No line items yet.{isEditable && ' Add items to build the PO total.'}
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="border-b border-neutral-100">
                        <tr>
                            <th className="text-left px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase">Description</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-20">Qty</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-28">Unit Cost</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-28">Total</th>
                            {isEditable && <th className="w-16" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50">
                        {po.items.map(item => (
                            editingId === item.id ? (
                                <LineItemEditRow
                                    key={item.id}
                                    item={item}
                                    poId={po.id}
                                    onSaved={async () => { setEditingId(null); await onRefresh(); }}
                                    onCancel={() => setEditingId(null)}
                                    onError={onError}
                                />
                            ) : (
                                <tr key={item.id} className="hover:bg-neutral-50">
                                    <td className="px-5 py-3 text-neutral-800">{item.description}</td>
                                    <td className="px-5 py-3 text-right text-neutral-600">{item.quantity}</td>
                                    <td className="px-5 py-3 text-right text-neutral-600">{formatPence(item.unit_cost_pence)}</td>
                                    <td className="px-5 py-3 text-right font-medium text-neutral-900">{formatPence(item.line_total_pence)}</td>
                                    {isEditable && (
                                        <td className="px-3 py-3">
                                            <div className="flex items-center justify-end gap-1">
                                                <button onClick={() => setEditingId(item.id)} className="p-1 text-neutral-400 hover:text-neutral-900"><Edit2 size={13} /></button>
                                                <button onClick={() => handleDelete(item.id)} className="p-1 text-neutral-400 hover:text-red-600"><Trash2 size={13} /></button>
                                            </div>
                                        </td>
                                    )}
                                </tr>
                            )
                        ))}
                        {showAddForm && (
                            <LineItemAddRow
                                poId={po.id}
                                onAdded={async () => { setShowAddForm(false); await onRefresh(); }}
                                onCancel={() => setShowAddForm(false)}
                                onError={onError}
                            />
                        )}
                    </tbody>
                    {po.items.length > 0 && (
                        <tfoot className="border-t-2 border-neutral-200">
                            <tr>
                                <td colSpan={3} className="px-5 py-3 text-sm font-semibold text-right text-neutral-600">Total</td>
                                <td className="px-5 py-3 text-right text-lg font-bold text-neutral-900">{formatPence(po.total_pence)}</td>
                                {isEditable && <td />}
                            </tr>
                        </tfoot>
                    )}
                </table>
            )}
        </div>
    );
}

function LineItemAddRow({
    poId,
    onAdded,
    onCancel,
    onError,
}: {
    poId: string;
    onAdded: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({ description: '', quantity: '1', unit_cost_pence: '' });
    const preview = calcLineTotal(Number(form.quantity) || 0, Math.round((parseFloat(form.unit_cost_pence) || 0) * 100));

    async function handleSave() {
        if (!form.description.trim()) return;
        setIsSaving(true);
        try {
            const result = await addPoItemAction({
                po_id: poId,
                description: form.description.trim(),
                quantity: parseInt(form.quantity) || 1,
                unit_cost_pence: Math.round((parseFloat(form.unit_cost_pence) || 0) * 100),
            });
            if ('error' in result) { onError(result.error); } else { onAdded(); }
        } finally { setIsSaving(false); }
    }

    const cellCls = 'px-2 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black w-full';

    return (
        <tr className="bg-neutral-50">
            <td className="px-3 py-2">
                <input placeholder="Item description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={cellCls} />
            </td>
            <td className="px-3 py-2 w-20">
                <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-3 py-2 w-28">
                <input type="number" min="0" step="0.01" placeholder="0.00" value={form.unit_cost_pence} onChange={e => setForm(f => ({ ...f, unit_cost_pence: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-5 py-2 text-right text-sm font-medium text-neutral-900">{formatPence(preview)}</td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={handleSave} disabled={isSaving} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50">
                        {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    </button>
                    <button type="button" onClick={onCancel} className="p-1 text-neutral-400 hover:text-neutral-900"><X size={13} /></button>
                </div>
            </td>
        </tr>
    );
}

function LineItemEditRow({
    item,
    poId,
    onSaved,
    onCancel,
    onError,
}: {
    item: PoItem;
    poId: string;
    onSaved: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        description: item.description,
        quantity: String(item.quantity),
        unit_cost_pence: (item.unit_cost_pence / 100).toFixed(2),
    });
    const preview = calcLineTotal(Number(form.quantity) || 0, Math.round((parseFloat(form.unit_cost_pence) || 0) * 100));

    async function handleSave() {
        setIsSaving(true);
        try {
            const result = await updatePoItemAction({
                id: item.id,
                po_id: poId,
                description: form.description.trim(),
                quantity: parseInt(form.quantity) || 1,
                unit_cost_pence: Math.round((parseFloat(form.unit_cost_pence) || 0) * 100),
            });
            if ('error' in result) { onError(result.error); } else { onSaved(); }
        } finally { setIsSaving(false); }
    }

    const cellCls = 'px-2 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black w-full';

    return (
        <tr className="bg-blue-50">
            <td className="px-3 py-2">
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={cellCls} />
            </td>
            <td className="px-3 py-2 w-20">
                <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-3 py-2 w-28">
                <input type="number" min="0" step="0.01" value={form.unit_cost_pence} onChange={e => setForm(f => ({ ...f, unit_cost_pence: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-5 py-2 text-right text-sm font-medium text-neutral-900">{formatPence(preview)}</td>
            <td className="px-3 py-2">
                <div className="flex items-center gap-1">
                    <button type="button" onClick={handleSave} disabled={isSaving} className="p-1 text-green-600 hover:text-green-800 disabled:opacity-50">
                        {isSaving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    </button>
                    <button type="button" onClick={onCancel} className="p-1 text-neutral-400 hover:text-neutral-900"><X size={13} /></button>
                </div>
            </td>
        </tr>
    );
}
