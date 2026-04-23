'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/app/(portal)/components/ui';
import { createExternalOrder } from '@/lib/external-orders/actions';
import type { ExternalOrderSource } from '@/lib/external-orders/types';

const SOURCE_OPTIONS: Array<{ value: ExternalOrderSource; label: string }> = [
    { value: 'mapleleaf', label: 'Mapleleaf' },
    { value: 'persimmon', label: 'Persimmon' },
    { value: 'lynx', label: 'Lynx shop' },
    { value: 'other', label: 'Other' },
];

export function NewExternalOrderForm() {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [source, setSource] = useState<ExternalOrderSource>('mapleleaf');
    const [externalRef, setExternalRef] = useState('');
    const [clientName, setClientName] = useState('');
    const [clientEmail, setClientEmail] = useState('');
    const [clientPhone, setClientPhone] = useState('');
    const [siteAddress, setSiteAddress] = useState('');
    const [sitePostcode, setSitePostcode] = useState('');
    const [itemSummary, setItemSummary] = useState('');
    const [itemCount, setItemCount] = useState('');
    const [totalPounds, setTotalPounds] = useState('');
    const [notes, setNotes] = useState('');

    const handleSubmit = () => {
        setError(null);
        if (!clientName.trim() && !clientEmail.trim()) {
            return setError('please enter a client name or email');
        }

        const totalPence = totalPounds.trim()
            ? Math.round(parseFloat(totalPounds) * 100)
            : null;
        if (totalPence !== null && (isNaN(totalPence) || totalPence < 0)) {
            return setError('total must be a valid amount');
        }

        startTransition(async () => {
            const result = await createExternalOrder({
                source_app: source,
                external_ref: externalRef.trim() || null,
                client_name: clientName.trim() || null,
                client_email: clientEmail.trim() || null,
                client_phone: clientPhone.trim() || null,
                site_address: siteAddress.trim() || null,
                site_postcode: sitePostcode.trim() || null,
                item_summary: itemSummary.trim() || null,
                item_count: itemCount.trim() ? parseInt(itemCount, 10) : null,
                total_pence: totalPence,
                notes: notes.trim() || null,
            });
            if (!result.ok) return setError(result.error);
            router.push('/admin/external-orders');
        });
    };

    return (
        <Card>
            {error && (
                <div className="mb-4 p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
                    {error}
                </div>
            )}

            <div className="space-y-4">
                <Field label="Source" required>
                    <select value={source} onChange={(e) => setSource(e.target.value as ExternalOrderSource)}
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400">
                        {SOURCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                </Field>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="External order ref">
                        <input type="text" value={externalRef} onChange={(e) => setExternalRef(e.target.value)}
                            placeholder="their order number" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" />
                    </Field>
                    <Field label="Client name">
                        <input type="text" value={clientName} onChange={(e) => setClientName(e.target.value)}
                            placeholder="Full name or company" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" />
                    </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <Field label="Client email">
                        <input type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)}
                            placeholder="email@company.com" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" />
                    </Field>
                    <Field label="Client phone">
                        <input type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)}
                            placeholder="" className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" />
                    </Field>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-[1fr_140px] gap-4">
                    <Field label="Site address">
                        <textarea value={siteAddress} onChange={(e) => setSiteAddress(e.target.value)}
                            rows={3} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" placeholder="" />
                    </Field>
                    <Field label="Postcode">
                        <input type="text" value={sitePostcode} onChange={(e) => setSitePostcode(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" placeholder="NE11 0QG" />
                    </Field>
                </div>

                <Field label="What's being ordered" hint="a short line staff can scan — materials, sizes, quantities">
                    <textarea value={itemSummary} onChange={(e) => setItemSummary(e.target.value)}
                        rows={3} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400"
                        placeholder="3× post-paint standing signs, 600×400mm acrylic panels…" />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                    <Field label="Item count">
                        <input type="number" min="0" value={itemCount}
                            onChange={(e) => setItemCount(e.target.value)} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" placeholder="0" />
                    </Field>
                    <Field label="Total (£)">
                        <input type="number" min="0" step="0.01" value={totalPounds}
                            onChange={(e) => setTotalPounds(e.target.value)} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" placeholder="0.00" />
                    </Field>
                </div>

                <Field label="Internal notes">
                    <textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                        rows={3} className="w-full px-3 py-2 text-sm border border-neutral-200 rounded bg-white focus:outline-none focus:border-neutral-400" placeholder="anything staff should know…" />
                </Field>
            </div>

            <div className="mt-6 flex gap-2">
                <button type="button" onClick={handleSubmit} disabled={isPending}
                    className="btn-primary">
                    {isPending ? 'saving…' : 'log order'}
                </button>
                <button type="button" onClick={() => router.push('/admin/external-orders')}
                    className="btn-secondary">
                    cancel
                </button>
            </div>
        </Card>
    );
}

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
    return (
        <label className="block">
            <span className="block text-xs font-semibold text-neutral-700 mb-1">
                {label}{required && <span className="text-red-500 ml-0.5">*</span>}
            </span>
            {hint && <span className="block text-[11px] text-neutral-500 mb-1.5">{hint}</span>}
            {children}
        </label>
    );
}
