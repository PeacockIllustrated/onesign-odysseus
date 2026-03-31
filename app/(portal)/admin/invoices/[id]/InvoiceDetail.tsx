'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Printer, Edit2, X, Save, Loader2,
    Plus, Trash2, AlertCircle, ExternalLink,
} from 'lucide-react';
import {
    updateInvoiceAction,
    updateInvoiceStatusAction,
    addInvoiceItemAction,
    updateInvoiceItemAction,
    deleteInvoiceItemAction,
    deleteInvoiceAction,
    getInvoiceWithItemsAction,
} from '@/lib/invoices/actions';
import {
    INVOICE_STATUS_LABELS,
    INVOICE_STATUS_COLORS,
    INVOICE_STATUS_TRANSITIONS,
    formatPence,
    calcLineTotal,
} from '@/lib/invoices/utils';
import type { InvoiceWithItems, InvoiceItem, InvoiceStatus } from '@/lib/invoices/types';

interface InvoiceDetailProps {
    initialInvoice: InvoiceWithItems;
}

function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit', month: 'short', year: 'numeric',
    });
}

export function InvoiceDetail({ initialInvoice }: InvoiceDetailProps) {
    const router = useRouter();
    const [invoice, setInvoice] = useState(initialInvoice);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [isEditing, setIsEditing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

    async function refresh() {
        const updated = await getInvoiceWithItemsAction(invoice.id);
        if (updated) setInvoice(updated);
    }

    function handleStatusChange(newStatus: InvoiceStatus) {
        setErrorMessage(null);
        startTransition(async () => {
            const result = await updateInvoiceStatusAction(invoice.id, newStatus);
            if ('error' in result) {
                setErrorMessage(result.error);
            } else {
                await refresh();
            }
        });
    }

    async function handleDelete() {
        const result = await deleteInvoiceAction(invoice.id);
        if ('error' in result) {
            setErrorMessage(result.error);
            setShowDeleteConfirm(false);
        } else {
            router.push('/admin/invoices');
        }
    }

    const allowedTransitions = INVOICE_STATUS_TRANSITIONS[invoice.status];

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-6">
                <Link href="/admin/invoices" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
                    <ArrowLeft size={14} />
                    Invoices
                </Link>
                <span className="text-neutral-300">/</span>
                <span className="text-sm font-medium text-neutral-900 font-mono">{invoice.invoice_number}</span>
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
                            <h1 className="text-lg font-semibold font-mono text-neutral-900">{invoice.invoice_number}</h1>
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${INVOICE_STATUS_COLORS[invoice.status]}`}>
                                {INVOICE_STATUS_LABELS[invoice.status]}
                            </span>
                        </div>
                        <p className="text-sm text-neutral-600 mt-1">{invoice.customer_name}</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={`/admin/invoices/${invoice.id}/print`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50"
                        >
                            <Printer size={12} />
                            Print / PDF
                        </a>
                        {invoice.status === 'draft' && !isEditing && (
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
                    <InvoiceEditForm
                        invoice={invoice}
                        onSaved={async () => { setIsEditing(false); await refresh(); }}
                        onCancel={() => setIsEditing(false)}
                        onError={setErrorMessage}
                    />
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Customer</div>
                            <div className="font-medium text-neutral-900">{invoice.customer_name}</div>
                            {invoice.customer_email && <div className="text-neutral-500 text-xs">{invoice.customer_email}</div>}
                            {invoice.customer_phone && <div className="text-neutral-500 text-xs">{invoice.customer_phone}</div>}
                            {invoice.customer_reference && <div className="text-neutral-500 text-xs">Ref: {invoice.customer_reference}</div>}
                        </div>
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Invoice Date</div>
                            <div className="text-neutral-900">{formatDate(invoice.invoice_date)}</div>
                            {invoice.project_name && (
                                <>
                                    <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5 mt-2">Project</div>
                                    <div className="text-neutral-900">{invoice.project_name}</div>
                                </>
                            )}
                        </div>
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Due Date</div>
                            <div className="text-neutral-900">{invoice.due_date ? formatDate(invoice.due_date) : 'Not set'}</div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5 mt-2">Payment Terms</div>
                            <div className="text-neutral-900">{invoice.payment_terms_days} days</div>
                        </div>
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Total</div>
                            <div className="text-lg font-semibold text-neutral-900">{formatPence(invoice.total_pence)}</div>
                        </div>
                    </div>
                )}

                {/* Linked records */}
                {(invoice.linked_job || invoice.linked_quote) && (
                    <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-neutral-100">
                        {invoice.linked_quote && (
                            <Link href={`/admin/quotes/${invoice.linked_quote.id}`} className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900">
                                <ExternalLink size={11} />
                                Quote {invoice.linked_quote.quote_number}{invoice.linked_quote.customer_name ? ` — ${invoice.linked_quote.customer_name}` : ''}
                            </Link>
                        )}
                        {invoice.linked_job && (
                            <Link href="/admin/jobs" className="flex items-center gap-1.5 text-xs text-neutral-600 hover:text-neutral-900">
                                <ExternalLink size={11} />
                                Job {invoice.linked_job.job_number} ({invoice.linked_job.status})
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
                            className={`px-4 py-2 text-sm font-medium border rounded disabled:opacity-50 ${
                                next === 'paid'
                                    ? 'border-green-300 text-green-700 hover:bg-green-50'
                                    : next === 'sent'
                                      ? 'border-blue-300 text-blue-700 hover:bg-blue-50'
                                      : next === 'overdue'
                                        ? 'border-amber-300 text-amber-700 hover:bg-amber-50'
                                        : next === 'cancelled'
                                          ? 'border-red-200 text-red-600 hover:bg-red-50'
                                          : 'border-neutral-200 text-neutral-700 hover:bg-neutral-50'
                            }`}
                        >
                            {next === 'sent' && 'Mark Sent'}
                            {next === 'paid' && 'Mark Paid'}
                            {next === 'overdue' && 'Mark Overdue'}
                            {next === 'cancelled' && 'Cancel'}
                            {next === 'draft' && 'Reopen as Draft'}
                        </button>
                    ))}
                </div>
            )}

            {/* Line items */}
            <LineItemsSection invoice={invoice} onRefresh={refresh} onError={setErrorMessage} />

            {/* Totals */}
            {invoice.items.length > 0 && (
                <div className="border border-neutral-200 rounded-lg p-5 mt-4">
                    <div className="flex flex-col items-end gap-1 text-sm">
                        <div className="flex justify-between w-48">
                            <span className="text-neutral-500">Subtotal</span>
                            <span className="text-neutral-900">{formatPence(invoice.subtotal_pence)}</span>
                        </div>
                        <div className="flex justify-between w-48">
                            <span className="text-neutral-500">VAT (20%)</span>
                            <span className="text-neutral-900">{formatPence(invoice.vat_pence)}</span>
                        </div>
                        <div className="flex justify-between w-48 pt-2 mt-1 border-t border-neutral-200">
                            <span className="font-semibold text-neutral-900">Total</span>
                            <span className="text-lg font-bold text-neutral-900">{formatPence(invoice.total_pence)}</span>
                        </div>
                    </div>
                </div>
            )}

            {/* Notes */}
            {(invoice.notes_customer || invoice.notes_internal) && (
                <div className="border border-neutral-200 rounded-lg p-5 mt-4 space-y-3">
                    {invoice.notes_customer && (
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Customer Notes</div>
                            <p className="text-sm text-neutral-700 whitespace-pre-wrap">{invoice.notes_customer}</p>
                        </div>
                    )}
                    {invoice.notes_internal && (
                        <div>
                            <div className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Internal Notes</div>
                            <p className="text-sm text-neutral-600 whitespace-pre-wrap">{invoice.notes_internal}</p>
                        </div>
                    )}
                </div>
            )}

            {/* Danger zone */}
            {invoice.status === 'draft' && (
                <div className="mt-6 pt-6 border-t border-neutral-100">
                    {!showDeleteConfirm ? (
                        <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="text-xs text-red-600 hover:text-red-800"
                        >
                            Delete this invoice
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

function InvoiceEditForm({
    invoice,
    onSaved,
    onCancel,
    onError,
}: {
    invoice: InvoiceWithItems;
    onSaved: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        customer_name: invoice.customer_name,
        customer_email: invoice.customer_email || '',
        customer_phone: invoice.customer_phone || '',
        customer_reference: invoice.customer_reference || '',
        project_name: invoice.project_name || '',
        payment_terms_days: String(invoice.payment_terms_days),
        due_date: invoice.due_date || '',
        notes_customer: invoice.notes_customer || '',
        notes_internal: invoice.notes_internal || '',
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
            const result = await updateInvoiceAction({
                id: invoice.id,
                customer_name: form.customer_name,
                customer_email: form.customer_email,
                customer_phone: form.customer_phone,
                customer_reference: form.customer_reference,
                project_name: form.project_name,
                payment_terms_days: parseInt(form.payment_terms_days) || 30,
                due_date: form.due_date,
                notes_customer: form.notes_customer,
                notes_internal: form.notes_internal,
            });
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
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Name</label>
                    <input required {...field('customer_name')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Email</label>
                    <input type="email" {...field('customer_email')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Phone</label>
                    <input {...field('customer_phone')} className={inputCls} />
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Reference</label>
                    <input {...field('customer_reference')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Project Name</label>
                    <input {...field('project_name')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Payment Terms (days)</label>
                    <input type="number" min="0" {...field('payment_terms_days')} className={inputCls} />
                </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Due Date</label>
                    <input type="date" {...field('due_date')} className={inputCls} />
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Customer Notes <span className="normal-case text-neutral-400">(appears on invoice print)</span></label>
                <textarea {...field('notes_customer')} rows={2} className={inputCls} />
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
    invoice,
    onRefresh,
    onError,
}: {
    invoice: InvoiceWithItems;
    onRefresh: () => Promise<void>;
    onError: (msg: string) => void;
}) {
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const isEditable = invoice.status === 'draft';

    function handleDelete(itemId: string) {
        startTransition(async () => {
            const result = await deleteInvoiceItemAction(invoice.id, itemId);
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

            {invoice.items.length === 0 && !showAddForm ? (
                <div className="px-5 py-8 text-center text-sm text-neutral-400">
                    No line items yet.{isEditable && ' Add items to build the invoice total.'}
                </div>
            ) : (
                <table className="w-full text-sm">
                    <thead className="border-b border-neutral-100">
                        <tr>
                            <th className="text-left px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-8">#</th>
                            <th className="text-left px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase">Description</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-20">Qty</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-28">Unit Price</th>
                            <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-28">Line Total</th>
                            {isEditable && <th className="w-16" />}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-50">
                        {invoice.items.map((item, idx) => (
                            editingId === item.id ? (
                                <LineItemEditRow
                                    key={item.id}
                                    item={item}
                                    invoiceId={invoice.id}
                                    onSaved={async () => { setEditingId(null); await onRefresh(); }}
                                    onCancel={() => setEditingId(null)}
                                    onError={onError}
                                />
                            ) : (
                                <tr key={item.id} className="hover:bg-neutral-50">
                                    <td className="px-5 py-3 text-neutral-400 text-xs">{idx + 1}</td>
                                    <td className="px-5 py-3 text-neutral-800">{item.description}</td>
                                    <td className="px-5 py-3 text-right text-neutral-600">{item.quantity}</td>
                                    <td className="px-5 py-3 text-right text-neutral-600">{formatPence(item.unit_price_pence)}</td>
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
                                invoiceId={invoice.id}
                                onAdded={async () => { setShowAddForm(false); await onRefresh(); }}
                                onCancel={() => setShowAddForm(false)}
                                onError={onError}
                            />
                        )}
                    </tbody>
                </table>
            )}
        </div>
    );
}

function LineItemAddRow({
    invoiceId,
    onAdded,
    onCancel,
    onError,
}: {
    invoiceId: string;
    onAdded: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({ description: '', quantity: '1', unit_price: '' });
    const preview = calcLineTotal(Number(form.quantity) || 0, Math.round((parseFloat(form.unit_price) || 0) * 100));

    async function handleSave() {
        if (!form.description.trim()) return;
        setIsSaving(true);
        try {
            const result = await addInvoiceItemAction({
                invoice_id: invoiceId,
                description: form.description.trim(),
                quantity: parseInt(form.quantity) || 1,
                unit_price_pence: Math.round((parseFloat(form.unit_price) || 0) * 100),
            });
            if ('error' in result) { onError(result.error); } else { onAdded(); }
        } finally { setIsSaving(false); }
    }

    const cellCls = 'px-2 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black w-full';

    return (
        <tr className="bg-neutral-50">
            <td className="px-5 py-2 text-neutral-400 text-xs" />
            <td className="px-3 py-2">
                <input placeholder="Item description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={cellCls} />
            </td>
            <td className="px-3 py-2 w-20">
                <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-3 py-2 w-28">
                <input type="number" min="0" step="0.01" placeholder="0.00" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} className={cellCls + ' text-right'} />
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
    invoiceId,
    onSaved,
    onCancel,
    onError,
}: {
    item: InvoiceItem;
    invoiceId: string;
    onSaved: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        description: item.description,
        quantity: String(item.quantity),
        unit_price: (item.unit_price_pence / 100).toFixed(2),
    });
    const preview = calcLineTotal(Number(form.quantity) || 0, Math.round((parseFloat(form.unit_price) || 0) * 100));

    async function handleSave() {
        setIsSaving(true);
        try {
            const result = await updateInvoiceItemAction({
                id: item.id,
                invoice_id: invoiceId,
                description: form.description.trim(),
                quantity: parseInt(form.quantity) || 1,
                unit_price_pence: Math.round((parseFloat(form.unit_price) || 0) * 100),
            });
            if ('error' in result) { onError(result.error); } else { onSaved(); }
        } finally { setIsSaving(false); }
    }

    const cellCls = 'px-2 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-1 focus:ring-black w-full';

    return (
        <tr className="bg-blue-50">
            <td className="px-5 py-2 text-neutral-400 text-xs" />
            <td className="px-3 py-2">
                <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className={cellCls} />
            </td>
            <td className="px-3 py-2 w-20">
                <input type="number" min="1" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} className={cellCls + ' text-right'} />
            </td>
            <td className="px-3 py-2 w-28">
                <input type="number" min="0" step="0.01" value={form.unit_price} onChange={e => setForm(f => ({ ...f, unit_price: e.target.value }))} className={cellCls + ' text-right'} />
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
