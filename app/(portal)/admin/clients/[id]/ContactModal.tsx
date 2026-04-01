'use client';

import { useState } from 'react';
import { X, Loader2, Save } from 'lucide-react';
import type { Contact, ContactType } from '@/lib/clients/types';

interface ContactModalProps {
    contact: Contact | null;
    onSave: (data: Record<string, unknown>) => Promise<void>;
    onClose: () => void;
}

const CONTACT_TYPES: { value: ContactType; label: string }[] = [
    { value: 'general', label: 'General' },
    { value: 'primary', label: 'Primary' },
    { value: 'billing', label: 'Billing' },
    { value: 'site', label: 'Site' },
];

const inputCls =
    'w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]';

export function ContactModal({ contact, onSave, onClose }: ContactModalProps) {
    const isEdit = !!contact;
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        first_name: contact?.first_name ?? '',
        last_name: contact?.last_name ?? '',
        email: contact?.email ?? '',
        phone: contact?.phone ?? '',
        mobile: contact?.mobile ?? '',
        job_title: contact?.job_title ?? '',
        contact_type: (contact?.contact_type ?? 'general') as ContactType,
        is_primary: contact?.is_primary ?? false,
    });

    function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
        const { name, value, type } = e.target;
        setForm((f) => ({
            ...f,
            [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value,
        }));
    }

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.first_name.trim() || !form.last_name.trim()) return;
        setIsSaving(true);
        try {
            await onSave({
                first_name: form.first_name.trim(),
                last_name: form.last_name.trim(),
                email: form.email.trim() || undefined,
                phone: form.phone.trim() || undefined,
                mobile: form.mobile.trim() || undefined,
                job_title: form.job_title.trim() || undefined,
                contact_type: form.contact_type,
                is_primary: form.is_primary,
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
            <div className="relative bg-white rounded-lg shadow-xl w-full max-w-lg mx-4">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2 className="text-sm font-semibold text-neutral-900">
                        {isEdit ? 'Edit Contact' : 'Add Contact'}
                    </h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-900">
                        <X size={16} />
                    </button>
                </div>

                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                First Name *
                            </label>
                            <input
                                name="first_name"
                                value={form.first_name}
                                onChange={handleChange}
                                required
                                className={inputCls}
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Last Name *
                            </label>
                            <input
                                name="last_name"
                                value={form.last_name}
                                onChange={handleChange}
                                required
                                className={inputCls}
                            />
                        </div>
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
                                Mobile
                            </label>
                            <input
                                name="mobile"
                                value={form.mobile}
                                onChange={handleChange}
                                className={inputCls}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                            Job Title
                        </label>
                        <input
                            name="job_title"
                            value={form.job_title}
                            onChange={handleChange}
                            className={inputCls}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Contact Type
                            </label>
                            <select
                                name="contact_type"
                                value={form.contact_type}
                                onChange={handleChange}
                                className={inputCls}
                            >
                                {CONTACT_TYPES.map((ct) => (
                                    <option key={ct.value} value={ct.value}>
                                        {ct.label}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end pb-2">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input
                                    name="is_primary"
                                    type="checkbox"
                                    checked={form.is_primary}
                                    onChange={handleChange}
                                    className="rounded border-neutral-300 text-[#4e7e8c] focus:ring-[#4e7e8c]"
                                />
                                <span className="text-sm text-neutral-700">Primary contact</span>
                            </label>
                        </div>
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
                            {isEdit ? 'Save Changes' : 'Add Contact'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
