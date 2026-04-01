'use client';

import { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import type { OrgSite } from '@/lib/clients/types';

interface SiteModalProps {
    site: OrgSite | null;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    onClose: () => void;
}

const inputCls =
    'w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]';

export function SiteModal({ site, onSave, onClose }: SiteModalProps) {
    const isEdit = !!site;
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        name: site?.name ?? '',
        address_line_1: site?.address_line_1 ?? '',
        address_line_2: site?.address_line_2 ?? '',
        city: site?.city ?? '',
        county: site?.county ?? '',
        postcode: site?.postcode ?? '',
        country: site?.country ?? 'GB',
        phone: site?.phone ?? '',
        email: site?.email ?? '',
        is_primary: site?.is_primary ?? false,
        is_billing_address: site?.is_billing_address ?? false,
        is_delivery_address: site?.is_delivery_address ?? false,
        notes: site?.notes ?? '',
    });

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
        const { name, value, type } = e.target;
        setForm((f) => ({
            ...f,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
        }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name.trim()) return;
        setIsSaving(true);
        try {
            await onSave({
                name: form.name.trim(),
                address_line_1: form.address_line_1.trim() || undefined,
                address_line_2: form.address_line_2.trim() || undefined,
                city: form.city.trim() || undefined,
                county: form.county.trim() || undefined,
                postcode: form.postcode.trim() || undefined,
                country: form.country,
                phone: form.phone.trim() || undefined,
                email: form.email.trim() || undefined,
                is_primary: form.is_primary,
                is_billing_address: form.is_billing_address,
                is_delivery_address: form.is_delivery_address,
                notes: form.notes.trim() || undefined,
            });
        } finally {
            setIsSaving(false);
        }
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/40" onClick={onClose} />

            {/* Modal */}
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200 sticky top-0 bg-white z-10">
                    <h2 className="text-sm font-semibold text-neutral-900">
                        {isEdit ? 'Edit Site' : 'Add Site'}
                    </h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                            Site Name *
                        </label>
                        <input
                            name="name"
                            value={form.name}
                            onChange={handleChange}
                            required
                            className={inputCls}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                            Address Line 1
                        </label>
                        <input
                            name="address_line_1"
                            value={form.address_line_1}
                            onChange={handleChange}
                            className={inputCls}
                        />
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                            Address Line 2
                        </label>
                        <input
                            name="address_line_2"
                            value={form.address_line_2}
                            onChange={handleChange}
                            className={inputCls}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                City
                            </label>
                            <input
                                name="city"
                                value={form.city}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                County
                            </label>
                            <input
                                name="county"
                                value={form.county}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Postcode
                            </label>
                            <input
                                name="postcode"
                                value={form.postcode}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Country
                            </label>
                            <select
                                name="country"
                                value={form.country}
                                onChange={handleChange}
                                className={inputCls}
                            >
                                <option value="GB">United Kingdom</option>
                                <option value="IE">Ireland</option>
                                <option value="US">United States</option>
                                <option value="FR">France</option>
                                <option value="DE">Germany</option>
                            </select>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Phone
                            </label>
                            <input
                                name="phone"
                                value={form.phone}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Email
                            </label>
                            <input
                                name="email"
                                type="email"
                                value={form.email}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                            Notes
                        </label>
                        <textarea
                            name="notes"
                            value={form.notes}
                            onChange={handleChange}
                            rows={3}
                            className={inputCls}
                        />
                    </div>

                    <div className="flex flex-wrap gap-4 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                name="is_primary"
                                type="checkbox"
                                checked={form.is_primary}
                                onChange={handleChange}
                                className="rounded border-neutral-300 text-[#4e7e8c] focus:ring-[#4e7e8c]"
                            />
                            <span className="text-sm text-neutral-700">Primary site</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                name="is_billing_address"
                                type="checkbox"
                                checked={form.is_billing_address}
                                onChange={handleChange}
                                className="rounded border-neutral-300 text-[#4e7e8c] focus:ring-[#4e7e8c]"
                            />
                            <span className="text-sm text-neutral-700">Billing address</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input
                                name="is_delivery_address"
                                type="checkbox"
                                checked={form.is_delivery_address}
                                onChange={handleChange}
                                className="rounded border-neutral-300 text-[#4e7e8c] focus:ring-[#4e7e8c]"
                            />
                            <span className="text-sm text-neutral-700">Delivery address</span>
                        </label>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium text-neutral-600 hover:text-neutral-900"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSaving}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-medium bg-[#4e7e8c] text-white rounded hover:bg-[#3a5f6a] disabled:opacity-50"
                        >
                            {isSaving ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <Save size={12} />
                            )}
                            {isEdit ? 'Save Changes' : 'Add Site'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
