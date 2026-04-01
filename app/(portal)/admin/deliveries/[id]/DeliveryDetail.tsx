'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Printer, Edit2, X, Save, Loader2,
    Trash2, AlertCircle, ExternalLink, MapPin, User,
    Briefcase, ClipboardCheck, Copy, Check, Link2,
} from 'lucide-react';
import {
    getDeliveryWithItemsAction,
    updateDeliveryAction,
    updateDeliveryStatusAction,
    deleteDeliveryAction,
    generatePodLink,
} from '@/lib/deliveries/actions';
import {
    DELIVERY_STATUS_LABELS,
    DELIVERY_STATUS_COLORS,
    POD_STATUS_LABELS,
    POD_STATUS_COLORS,
    formatDeliveryDate,
    canTransitionTo,
    isDeliveryOverdue,
} from '@/lib/deliveries/utils';
import type { DeliveryWithItems, DeliveryStatus } from '@/lib/deliveries/types';

interface DeliveryDetailProps {
    delivery: DeliveryWithItems;
}

export function DeliveryDetail({ delivery: initialDelivery }: DeliveryDetailProps) {
    const router = useRouter();
    const [delivery, setDelivery] = useState(initialDelivery);
    const [errorMessage, setErrorMessage] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();
    const [isEditing, setIsEditing] = useState(false);
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [copiedPodLink, setCopiedPodLink] = useState(false);

    const overdue = isDeliveryOverdue(delivery.scheduled_date, delivery.status);

    async function refresh() {
        const updated = await getDeliveryWithItemsAction(delivery.id);
        if (updated) setDelivery(updated);
    }

    function handleStatusChange(newStatus: DeliveryStatus) {
        setErrorMessage(null);
        startTransition(async () => {
            const result = await updateDeliveryStatusAction(delivery.id, newStatus);
            if ('error' in result) {
                setErrorMessage(result.error);
            } else {
                await refresh();
            }
        });
    }

    function handleDelete() {
        startTransition(async () => {
            const result = await deleteDeliveryAction(delivery.id);
            if ('error' in result) {
                setErrorMessage(result.error);
                setShowDeleteConfirm(false);
            } else {
                router.push('/admin/deliveries');
            }
        });
    }

    function handleGeneratePod() {
        setErrorMessage(null);
        startTransition(async () => {
            const result = await generatePodLink(delivery.id);
            if ('error' in result) {
                setErrorMessage(result.error);
            } else {
                await refresh();
            }
        });
    }

    function handleCopyPodLink() {
        if (!delivery.pod_token) return;
        const url = `${window.location.origin}/delivery/${delivery.pod_token}`;
        navigator.clipboard.writeText(url);
        setCopiedPodLink(true);
        setTimeout(() => setCopiedPodLink(false), 2000);
    }

    // Build status transition buttons
    const transitionButtons: Array<{ status: DeliveryStatus; label: string; colorCls: string }> = [];
    if (delivery.status === 'scheduled') {
        if (canTransitionTo(delivery.status, 'in_transit')) {
            transitionButtons.push({ status: 'in_transit', label: 'Mark In Transit', colorCls: 'border-amber-300 text-amber-700 hover:bg-amber-50' });
        }
        if (canTransitionTo(delivery.status, 'failed')) {
            transitionButtons.push({ status: 'failed', label: 'Cancel', colorCls: 'border-red-200 text-red-600 hover:bg-red-50' });
        }
    } else if (delivery.status === 'in_transit') {
        if (canTransitionTo(delivery.status, 'delivered')) {
            transitionButtons.push({ status: 'delivered', label: 'Mark Delivered', colorCls: 'border-green-300 text-green-700 hover:bg-green-50' });
        }
        if (canTransitionTo(delivery.status, 'failed')) {
            transitionButtons.push({ status: 'failed', label: 'Mark Failed', colorCls: 'border-red-200 text-red-600 hover:bg-red-50' });
        }
    } else if (delivery.status === 'failed') {
        if (canTransitionTo(delivery.status, 'scheduled')) {
            transitionButtons.push({ status: 'scheduled', label: 'Reschedule', colorCls: 'border-blue-300 text-blue-700 hover:bg-blue-50' });
        }
    }

    const podUrl = delivery.pod_token
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/delivery/${delivery.pod_token}`
        : null;

    return (
        <div className="p-6 max-w-5xl mx-auto">
            {/* Breadcrumb */}
            <div className="flex items-center gap-2 mb-6">
                <Link href="/admin/deliveries" className="flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-900">
                    <ArrowLeft size={14} />
                    Deliveries
                </Link>
                <span className="text-neutral-300">/</span>
                <span className="text-sm font-medium text-neutral-900 font-mono">{delivery.delivery_number}</span>
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
                <div className="flex items-start justify-between">
                    <div>
                        <div className="flex items-center gap-3">
                            <h1 className="text-lg font-semibold font-mono text-neutral-900">{delivery.delivery_number}</h1>
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${DELIVERY_STATUS_COLORS[delivery.status]}`}>
                                {DELIVERY_STATUS_LABELS[delivery.status]}
                            </span>
                            {overdue && (
                                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full text-red-700 bg-red-50">
                                    Overdue
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-neutral-500 mt-1">
                            Scheduled {formatDeliveryDate(delivery.scheduled_date)}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        <a
                            href={`/admin/deliveries/${delivery.id}/print`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50"
                        >
                            <Printer size={12} />
                            Print Delivery Note
                        </a>
                    </div>
                </div>
            </div>

            {/* Status transition buttons */}
            {transitionButtons.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                    {transitionButtons.map(btn => (
                        <button
                            key={btn.status}
                            onClick={() => handleStatusChange(btn.status)}
                            disabled={isPending}
                            className={`px-4 py-2 text-sm font-medium border rounded disabled:opacity-50 ${btn.colorCls}`}
                        >
                            {isPending ? <Loader2 size={14} className="animate-spin inline mr-1" /> : null}
                            {btn.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Two-column layout */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Left column (2/3) */}
                <div className="lg:col-span-2 space-y-4">
                    {/* Delivery Info card */}
                    <div className="border border-neutral-200 rounded-lg p-5">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-sm font-semibold text-neutral-900">Delivery Info</h2>
                            {delivery.status === 'scheduled' && !isEditing && (
                                <button
                                    onClick={() => setIsEditing(true)}
                                    className="flex items-center gap-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                                >
                                    <Edit2 size={12} />
                                    Edit
                                </button>
                            )}
                        </div>

                        {isEditing ? (
                            <DeliveryEditForm
                                delivery={delivery}
                                onSaved={async () => { setIsEditing(false); await refresh(); }}
                                onCancel={() => setIsEditing(false)}
                                onError={setErrorMessage}
                            />
                        ) : (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Driver</div>
                                    <div className="text-neutral-900">{delivery.driver_name || 'Not assigned'}</div>
                                    {delivery.driver_phone && (
                                        <div className="text-neutral-500 text-xs">{delivery.driver_phone}</div>
                                    )}
                                </div>
                                <div>
                                    <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Scheduled Date</div>
                                    <div className="text-neutral-900">{formatDeliveryDate(delivery.scheduled_date)}</div>
                                </div>
                                {delivery.notes_internal && (
                                    <div className="sm:col-span-2">
                                        <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Internal Notes</div>
                                        <p className="text-neutral-600 whitespace-pre-wrap">{delivery.notes_internal}</p>
                                    </div>
                                )}
                                {delivery.notes_driver && (
                                    <div className="sm:col-span-2">
                                        <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Notes for Driver</div>
                                        <p className="text-neutral-600 whitespace-pre-wrap">{delivery.notes_driver}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Items table */}
                    <div className="border border-neutral-200 rounded-lg overflow-hidden">
                        <div className="px-5 py-3 bg-neutral-50 border-b border-neutral-200">
                            <h2 className="text-sm font-semibold text-neutral-900">Items</h2>
                        </div>

                        {delivery.items.length === 0 ? (
                            <div className="px-5 py-8 text-center text-sm text-neutral-400">
                                No items on this delivery.
                            </div>
                        ) : (
                            <table className="w-full text-sm">
                                <thead className="border-b border-neutral-100">
                                    <tr>
                                        <th className="text-left px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-8">#</th>
                                        <th className="text-left px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase">Description</th>
                                        <th className="text-right px-5 py-2 text-[10px] font-semibold text-neutral-400 uppercase w-20">Qty</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-50">
                                    {delivery.items.map((item, idx) => (
                                        <tr key={item.id} className="hover:bg-neutral-50">
                                            <td className="px-5 py-3 text-neutral-400 text-xs">{idx + 1}</td>
                                            <td className="px-5 py-3 text-neutral-800">{item.description}</td>
                                            <td className="px-5 py-3 text-right text-neutral-600">{item.quantity}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* Delete button (scheduled only) */}
                    {delivery.status === 'scheduled' && (
                        <div className="pt-4 border-t border-neutral-100">
                            {!showDeleteConfirm ? (
                                <button
                                    onClick={() => setShowDeleteConfirm(true)}
                                    className="flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800"
                                >
                                    <Trash2 size={12} />
                                    Delete this delivery
                                </button>
                            ) : (
                                <div className="flex items-center gap-3">
                                    <span className="text-sm text-neutral-700">Are you sure? This cannot be undone.</span>
                                    <button
                                        onClick={handleDelete}
                                        disabled={isPending}
                                        className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                                    >
                                        Delete
                                    </button>
                                    <button
                                        onClick={() => setShowDeleteConfirm(false)}
                                        className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Right column (1/3) */}
                <div className="space-y-4">
                    {/* Delivery Address card */}
                    <div className="border border-neutral-200 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <MapPin size={14} className="text-neutral-400" />
                            <h2 className="text-sm font-semibold text-neutral-900">Delivery Address</h2>
                        </div>
                        {delivery.delivery_site ? (
                            <div className="text-sm space-y-1">
                                <div className="font-medium text-neutral-900">{delivery.delivery_site.name}</div>
                                {delivery.delivery_site.address_line_1 && (
                                    <div className="text-neutral-600">{delivery.delivery_site.address_line_1}</div>
                                )}
                                {delivery.delivery_site.address_line_2 && (
                                    <div className="text-neutral-600">{delivery.delivery_site.address_line_2}</div>
                                )}
                                {(delivery.delivery_site.city || delivery.delivery_site.county) && (
                                    <div className="text-neutral-600">
                                        {[delivery.delivery_site.city, delivery.delivery_site.county].filter(Boolean).join(', ')}
                                    </div>
                                )}
                                {delivery.delivery_site.postcode && (
                                    <div className="text-neutral-600">{delivery.delivery_site.postcode}</div>
                                )}
                                {delivery.delivery_site.phone && (
                                    <div className="text-neutral-500 text-xs mt-2">{delivery.delivery_site.phone}</div>
                                )}
                                {delivery.delivery_site.postcode && (
                                    <a
                                        href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(delivery.delivery_site.postcode)}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 mt-2"
                                    >
                                        <ExternalLink size={11} />
                                        View on Map
                                    </a>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-400">No delivery address set</p>
                        )}
                    </div>

                    {/* Contact card */}
                    <div className="border border-neutral-200 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <User size={14} className="text-neutral-400" />
                            <h2 className="text-sm font-semibold text-neutral-900">Contact</h2>
                        </div>
                        {delivery.delivery_contact ? (
                            <div className="text-sm space-y-1">
                                <div className="font-medium text-neutral-900">
                                    {delivery.delivery_contact.first_name} {delivery.delivery_contact.last_name}
                                </div>
                                {delivery.delivery_contact.email && (
                                    <div className="text-neutral-500 text-xs">{delivery.delivery_contact.email}</div>
                                )}
                                {delivery.delivery_contact.phone && (
                                    <div className="text-neutral-500 text-xs">{delivery.delivery_contact.phone}</div>
                                )}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-400">No delivery contact set</p>
                        )}
                    </div>

                    {/* Linked Job card */}
                    {delivery.linked_job && (
                        <div className="border border-neutral-200 rounded-lg p-5">
                            <div className="flex items-center gap-2 mb-3">
                                <Briefcase size={14} className="text-neutral-400" />
                                <h2 className="text-sm font-semibold text-neutral-900">Linked Job</h2>
                            </div>
                            <div className="text-sm space-y-1">
                                <Link
                                    href="/admin/jobs"
                                    className="flex items-center gap-1.5 font-medium text-neutral-900 hover:text-blue-700"
                                >
                                    <span className="font-mono">{delivery.linked_job.job_number}</span>
                                    <ExternalLink size={11} />
                                </Link>
                                <div className="text-neutral-600">{delivery.linked_job.title}</div>
                                <div className="text-neutral-500 text-xs">{delivery.linked_job.client_name}</div>
                                <span className="inline-flex items-center px-2 py-0.5 text-[10px] font-medium rounded-full bg-neutral-100 text-neutral-600 mt-1">
                                    {delivery.linked_job.status}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* POD Section card */}
                    <div className="border border-neutral-200 rounded-lg p-5">
                        <div className="flex items-center gap-2 mb-3">
                            <ClipboardCheck size={14} className="text-neutral-400" />
                            <h2 className="text-sm font-semibold text-neutral-900">Proof of Delivery</h2>
                        </div>

                        {!delivery.pod_token && (
                            <div>
                                <button
                                    onClick={handleGeneratePod}
                                    disabled={isPending}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50 disabled:opacity-50"
                                >
                                    {isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                                    Generate POD Link
                                </button>
                            </div>
                        )}

                        {delivery.pod_token && delivery.pod_status === 'pending' && (
                            <div className="space-y-2">
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${POD_STATUS_COLORS.pending}`}>
                                    {POD_STATUS_LABELS.pending}
                                </span>
                                <div className="bg-neutral-50 rounded p-2 text-xs font-mono text-neutral-600 break-all">
                                    {podUrl}
                                </div>
                                <button
                                    onClick={handleCopyPodLink}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-neutral-200 rounded hover:bg-neutral-50"
                                >
                                    {copiedPodLink ? (
                                        <>
                                            <Check size={12} className="text-green-600" />
                                            Copied
                                        </>
                                    ) : (
                                        <>
                                            <Copy size={12} />
                                            Copy Link
                                        </>
                                    )}
                                </button>
                            </div>
                        )}

                        {delivery.pod_status === 'signed' && (
                            <div className="space-y-3">
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${POD_STATUS_COLORS.signed}`}>
                                    {POD_STATUS_LABELS.signed}
                                </span>
                                {delivery.pod_signed_by && (
                                    <div className="text-sm">
                                        <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Signed by</div>
                                        <div className="text-neutral-900">{delivery.pod_signed_by}</div>
                                    </div>
                                )}
                                {delivery.pod_signed_at && (
                                    <div className="text-sm">
                                        <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Signed at</div>
                                        <div className="text-neutral-600">
                                            {new Date(delivery.pod_signed_at).toLocaleString('en-GB', {
                                                day: '2-digit', month: 'short', year: 'numeric',
                                                hour: '2-digit', minute: '2-digit',
                                            })}
                                        </div>
                                    </div>
                                )}
                                {delivery.pod_signature_data && (
                                    <div>
                                        <div className="text-[10px] font-medium text-neutral-400 uppercase mb-1">Signature</div>
                                        <div className="border border-neutral-200 rounded bg-white p-2">
                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                            <img
                                                src={delivery.pod_signature_data}
                                                alt="Signature"
                                                className="max-h-24 w-auto"
                                            />
                                        </div>
                                    </div>
                                )}
                                {delivery.pod_notes && (
                                    <div className="text-sm">
                                        <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Notes</div>
                                        <p className="text-neutral-600 whitespace-pre-wrap">{delivery.pod_notes}</p>
                                    </div>
                                )}
                            </div>
                        )}

                        {delivery.pod_status === 'refused' && (
                            <div className="space-y-3">
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${POD_STATUS_COLORS.refused}`}>
                                    {POD_STATUS_LABELS.refused}
                                </span>
                                {delivery.pod_notes && (
                                    <div className="text-sm">
                                        <div className="text-[10px] font-medium text-neutral-400 uppercase mb-0.5">Refusal Notes</div>
                                        <p className="text-neutral-600 whitespace-pre-wrap">{delivery.pod_notes}</p>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// ---- Inline edit form --------------------------------------------------------

function DeliveryEditForm({
    delivery,
    onSaved,
    onCancel,
    onError,
}: {
    delivery: DeliveryWithItems;
    onSaved: () => void;
    onCancel: () => void;
    onError: (msg: string) => void;
}) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        driver_name: delivery.driver_name || '',
        driver_phone: delivery.driver_phone || '',
        scheduled_date: delivery.scheduled_date || '',
        notes_internal: delivery.notes_internal || '',
        notes_driver: delivery.notes_driver || '',
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
            const result = await updateDeliveryAction({
                id: delivery.id,
                driver_name: form.driver_name || undefined,
                driver_phone: form.driver_phone || undefined,
                scheduled_date: form.scheduled_date || undefined,
                notes_internal: form.notes_internal || undefined,
                notes_driver: form.notes_driver || undefined,
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
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Driver Name</label>
                    <input {...field('driver_name')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Driver Phone</label>
                    <input type="tel" {...field('driver_phone')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Scheduled Date</label>
                    <input type="date" required {...field('scheduled_date')} className={inputCls} />
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Internal Notes</label>
                <textarea {...field('notes_internal')} rows={2} className={inputCls} />
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Notes for Driver</label>
                <textarea {...field('notes_driver')} rows={2} className={inputCls} />
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
