'use client';

import { useState, useTransition } from 'react';
import { RouteCard } from './components/RouteCard';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowLeft, Printer, Edit2, X, Save, Loader2,
    Trash2, AlertCircle, ExternalLink, MapPin, User,
    Briefcase, ClipboardCheck, Copy, Check, Link2, Truck, Calendar,
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
            if ('error' in result) setErrorMessage(result.error);
            else await refresh();
        });
    }

    function handleDelete() {
        startTransition(async () => {
            const result = await deleteDeliveryAction(delivery.id);
            if ('error' in result) { setErrorMessage(result.error); setShowDeleteConfirm(false); }
            else router.push('/admin/deliveries');
        });
    }

    function handleGeneratePod() {
        setErrorMessage(null);
        startTransition(async () => {
            const result = await generatePodLink(delivery.id);
            if ('error' in result) setErrorMessage(result.error);
            else await refresh();
        });
    }

    function handleCopyPodLink() {
        if (!delivery.pod_token) return;
        const url = `${window.location.origin}/delivery/${delivery.pod_token}`;
        navigator.clipboard.writeText(url);
        setCopiedPodLink(true);
        setTimeout(() => setCopiedPodLink(false), 2000);
    }

    // Status transitions
    const transitionButtons: Array<{ status: DeliveryStatus; label: string; cls: string }> = [];
    if (delivery.status === 'scheduled') {
        if (canTransitionTo(delivery.status, 'in_transit'))
            transitionButtons.push({ status: 'in_transit', label: 'Mark In Transit', cls: 'bg-amber-600 hover:bg-amber-700 text-white' });
        if (canTransitionTo(delivery.status, 'failed'))
            transitionButtons.push({ status: 'failed', label: 'Cancel', cls: 'bg-white border border-red-300 text-red-600 hover:bg-red-50' });
    } else if (delivery.status === 'in_transit') {
        if (canTransitionTo(delivery.status, 'delivered'))
            transitionButtons.push({ status: 'delivered', label: 'Mark Delivered', cls: 'bg-green-700 hover:bg-green-800 text-white' });
        if (canTransitionTo(delivery.status, 'failed'))
            transitionButtons.push({ status: 'failed', label: 'Mark Failed', cls: 'bg-white border border-red-300 text-red-600 hover:bg-red-50' });
    } else if (delivery.status === 'failed') {
        if (canTransitionTo(delivery.status, 'scheduled'))
            transitionButtons.push({ status: 'scheduled', label: 'Reschedule', cls: 'bg-[#4e7e8c] hover:bg-[#3a5f6a] text-white' });
    }

    const podUrl = delivery.pod_token
        ? `${typeof window !== 'undefined' ? window.location.origin : ''}/delivery/${delivery.pod_token}`
        : null;

    const site = delivery.delivery_site;
    const contact = delivery.delivery_contact;
    const job = delivery.linked_job;

    return (
        <div className="max-w-6xl mx-auto">
            {/* ── Header bar ── */}
            <div className="px-4 md:px-6 py-4 flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200">
                <div className="flex items-center gap-3">
                    <Link href="/admin/deliveries" className="text-neutral-400 hover:text-neutral-900">
                        <ArrowLeft size={18} />
                    </Link>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-bold font-mono text-neutral-900">{delivery.delivery_number}</h1>
                            <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full ${DELIVERY_STATUS_COLORS[delivery.status]}`}>
                                {DELIVERY_STATUS_LABELS[delivery.status]}
                            </span>
                            {overdue && (
                                <span className="px-2 py-0.5 text-xs font-semibold rounded-full text-red-700 bg-red-50">
                                    Overdue
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-neutral-500 mt-0.5">
                            {formatDeliveryDate(delivery.scheduled_date)}
                            {delivery.driver_name && ` · ${delivery.driver_name}`}
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {transitionButtons.map((btn) => (
                        <button
                            key={btn.status}
                            onClick={() => handleStatusChange(btn.status)}
                            disabled={isPending}
                            className={`px-4 py-2 text-sm font-semibold rounded-lg disabled:opacity-50 ${btn.cls}`}
                        >
                            {isPending && <Loader2 size={14} className="animate-spin inline mr-1" />}
                            {btn.label}
                        </button>
                    ))}
                    <a
                        href={`/admin/deliveries/${delivery.id}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 border border-neutral-200 rounded-lg hover:bg-neutral-50"
                        title="Print delivery note"
                    >
                        <Printer size={16} className="text-neutral-600" />
                    </a>
                </div>
            </div>

            {errorMessage && (
                <div className="mx-4 md:mx-6 mt-4 bg-red-50 border border-red-200 text-red-800 rounded-lg p-3 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <AlertCircle size={14} className="flex-shrink-0" />
                        <span className="text-sm font-medium">{errorMessage}</span>
                    </div>
                    <button onClick={() => setErrorMessage(null)}><X size={14} /></button>
                </div>
            )}

            {/* ── Route map — full width, prominent ── */}
            {site?.latitude != null && site?.longitude != null && (
                <div className="border-b border-neutral-200">
                    <RouteCard
                        destLat={site.latitude}
                        destLng={site.longitude}
                        siteName={site.name}
                    />
                </div>
            )}

            {/* ── Info grid ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-b border-neutral-200">
                {/* Left: delivery info + items */}
                <div className="md:border-r border-neutral-200">
                    {/* Driver + date + notes */}
                    <div className="px-4 md:px-6 py-5 border-b border-neutral-100">
                        <div className="flex items-center justify-between mb-3">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Delivery Info</h2>
                            {delivery.status === 'scheduled' && !isEditing && (
                                <button onClick={() => setIsEditing(true)} className="text-xs text-[#4e7e8c] hover:underline flex items-center gap-1">
                                    <Edit2 size={11} /> edit
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
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div className="flex items-start gap-2">
                                    <Truck size={14} className="text-neutral-400 mt-0.5 shrink-0" />
                                    <div>
                                        <div className="font-semibold text-neutral-900">{delivery.driver_name || 'Unassigned'}</div>
                                        {delivery.driver_phone && <div className="text-xs text-neutral-500">{delivery.driver_phone}</div>}
                                    </div>
                                </div>
                                <div className="flex items-start gap-2">
                                    <Calendar size={14} className="text-neutral-400 mt-0.5 shrink-0" />
                                    <div>
                                        <div className="font-semibold text-neutral-900">{formatDeliveryDate(delivery.scheduled_date)}</div>
                                    </div>
                                </div>
                                {delivery.notes_internal && (
                                    <div className="col-span-2 text-xs text-neutral-600 bg-neutral-50 rounded p-2 whitespace-pre-wrap">
                                        {delivery.notes_internal}
                                    </div>
                                )}
                                {delivery.notes_driver && (
                                    <div className="col-span-2 text-xs text-amber-800 bg-amber-50 rounded p-2 whitespace-pre-wrap">
                                        <span className="font-semibold">Driver notes:</span> {delivery.notes_driver}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Items */}
                    <div className="px-4 md:px-6 py-5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3">
                            Items ({delivery.items.length})
                        </h2>
                        {delivery.items.length === 0 ? (
                            <p className="text-sm text-neutral-400 italic">No items</p>
                        ) : (
                            <ul className="space-y-1">
                                {delivery.items.map((item, idx) => (
                                    <li key={item.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-neutral-50">
                                        <div className="flex items-center gap-2">
                                            <span className="text-neutral-400 font-mono text-xs w-4">{idx + 1}</span>
                                            <span className="text-neutral-800">{item.description}</span>
                                        </div>
                                        <span className="text-neutral-500 text-xs">×{item.quantity}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                </div>

                {/* Right: destination + contact + linked job */}
                <div>
                    {/* Destination */}
                    <div className="px-4 md:px-6 py-5 border-b border-neutral-100">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
                            <MapPin size={12} /> Destination
                        </h2>
                        {site ? (
                            <div className="text-sm space-y-0.5">
                                <div className="font-semibold text-neutral-900">{site.name}</div>
                                {site.address_line_1 && <div className="text-neutral-600">{site.address_line_1}</div>}
                                {site.address_line_2 && <div className="text-neutral-600">{site.address_line_2}</div>}
                                {(site.city || site.county) && (
                                    <div className="text-neutral-600">{[site.city, site.county].filter(Boolean).join(', ')}</div>
                                )}
                                {site.postcode && <div className="text-neutral-600 font-mono text-xs">{site.postcode}</div>}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-400 italic">No address set</p>
                        )}
                    </div>

                    {/* Contact */}
                    <div className="px-4 md:px-6 py-5 border-b border-neutral-100">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
                            <User size={12} /> Contact
                        </h2>
                        {contact ? (
                            <div className="text-sm space-y-0.5">
                                <div className="font-semibold text-neutral-900">{contact.first_name} {contact.last_name}</div>
                                {contact.email && <div className="text-neutral-500 text-xs">{contact.email}</div>}
                                {contact.phone && <div className="text-neutral-500 text-xs">{contact.phone}</div>}
                            </div>
                        ) : (
                            <p className="text-sm text-neutral-400 italic">No contact set</p>
                        )}
                    </div>

                    {/* Linked job */}
                    {job && (
                        <div className="px-4 md:px-6 py-5 border-b border-neutral-100">
                            <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
                                <Briefcase size={12} /> Linked Job
                            </h2>
                            <div className="text-sm space-y-1">
                                <Link href="/admin/jobs" className="font-mono text-[#4e7e8c] hover:underline flex items-center gap-1">
                                    {job.job_number} <ExternalLink size={11} />
                                </Link>
                                <div className="text-neutral-600">{job.title}</div>
                                <div className="text-neutral-400 text-xs">{job.client_name}</div>
                            </div>
                        </div>
                    )}

                    {/* POD */}
                    <div className="px-4 md:px-6 py-5">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-1.5">
                            <ClipboardCheck size={12} /> Proof of Delivery
                        </h2>

                        {!delivery.pod_token && (
                            <button
                                onClick={handleGeneratePod}
                                disabled={isPending}
                                className="btn-secondary text-xs inline-flex items-center gap-1.5"
                            >
                                {isPending ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
                                Generate POD Link
                            </button>
                        )}

                        {delivery.pod_token && delivery.pod_status === 'pending' && (
                            <div className="space-y-2">
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${POD_STATUS_COLORS.pending}`}>
                                    {POD_STATUS_LABELS.pending}
                                </span>
                                <div className="bg-neutral-50 rounded p-2 text-[11px] font-mono text-neutral-500 break-all">
                                    {podUrl}
                                </div>
                                <button onClick={handleCopyPodLink} className="btn-secondary text-xs inline-flex items-center gap-1.5">
                                    {copiedPodLink ? <><Check size={12} className="text-green-600" /> Copied</> : <><Copy size={12} /> Copy Link</>}
                                </button>
                            </div>
                        )}

                        {delivery.pod_status === 'signed' && (
                            <div className="space-y-2">
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${POD_STATUS_COLORS.signed}`}>
                                    {POD_STATUS_LABELS.signed}
                                </span>
                                {delivery.pod_signed_by && (
                                    <div className="text-sm">
                                        <span className="text-neutral-500 text-xs">Signed by </span>
                                        <span className="font-semibold">{delivery.pod_signed_by}</span>
                                        {delivery.pod_signed_at && (
                                            <span className="text-neutral-400 text-xs ml-1">
                                                {new Date(delivery.pod_signed_at).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                        )}
                                    </div>
                                )}
                                {delivery.pod_signature_data && (
                                    <div className="border border-neutral-200 rounded bg-white p-2 inline-block">
                                        <img src={delivery.pod_signature_data} alt="Signature" className="max-h-16 w-auto" />
                                    </div>
                                )}
                                {delivery.pod_notes && (
                                    <p className="text-xs text-neutral-600 whitespace-pre-wrap">{delivery.pod_notes}</p>
                                )}
                            </div>
                        )}

                        {delivery.pod_status === 'refused' && (
                            <div className="space-y-2">
                                <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${POD_STATUS_COLORS.refused}`}>
                                    {POD_STATUS_LABELS.refused}
                                </span>
                                {delivery.pod_notes && <p className="text-xs text-neutral-600 whitespace-pre-wrap">{delivery.pod_notes}</p>}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── Delete (scheduled only) ── */}
            {delivery.status === 'scheduled' && (
                <div className="px-4 md:px-6 py-4">
                    {!showDeleteConfirm ? (
                        <button onClick={() => setShowDeleteConfirm(true)} className="text-xs text-red-600 hover:underline flex items-center gap-1">
                            <Trash2 size={12} /> Delete this delivery
                        </button>
                    ) : (
                        <div className="flex items-center gap-3">
                            <span className="text-sm text-neutral-700">Are you sure?</span>
                            <button onClick={handleDelete} disabled={isPending}
                                className="px-3 py-1.5 text-xs font-medium bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50">
                                Delete
                            </button>
                            <button onClick={() => setShowDeleteConfirm(false)} className="text-xs text-neutral-500 hover:text-neutral-900">
                                Cancel
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Inline edit form ──

function DeliveryEditForm({
    delivery, onSaved, onCancel, onError,
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
            if ('error' in result) onError(result.error);
            else onSaved();
        } finally {
            setIsSaving(false);
        }
    }

    const inputCls = 'w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <form onSubmit={handleSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Driver</label>
                    <input {...field('driver_name')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Phone</label>
                    <input type="tel" {...field('driver_phone')} className={inputCls} />
                </div>
                <div>
                    <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Date</label>
                    <input type="date" required {...field('scheduled_date')} className={inputCls} />
                </div>
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Internal Notes</label>
                <textarea {...field('notes_internal')} rows={2} className={inputCls} />
            </div>
            <div>
                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">Driver Notes</label>
                <textarea {...field('notes_driver')} rows={2} className={inputCls} />
            </div>
            <div className="flex justify-end gap-2">
                <button type="button" onClick={onCancel} className="text-xs text-neutral-500 hover:text-neutral-900">Cancel</button>
                <button type="submit" disabled={isSaving} className="btn-primary text-xs inline-flex items-center gap-1">
                    {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                </button>
            </div>
        </form>
    );
}
