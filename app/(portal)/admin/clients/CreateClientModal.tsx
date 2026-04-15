'use client';

import { useState } from 'react';
import { Plus, Loader2, X } from 'lucide-react';
import { createClientAction } from '@/lib/clients/actions';

interface CreateClientModalProps {
    onClose: () => void;
    onCreated: (id: string) => void;
    onError: (msg: string) => void;
}

export function CreateClientModal({ onClose, onCreated, onError }: CreateClientModalProps) {
    const [isSaving, setIsSaving] = useState(false);
    const [form, setForm] = useState({
        name: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
    });

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!form.name.trim()) return;
        setIsSaving(true);
        try {
            const hasPrimaryContact = form.first_name.trim() && form.last_name.trim();
            const result = await createClientAction({
                name: form.name.trim(),
                primaryContact: hasPrimaryContact
                    ? {
                          first_name: form.first_name.trim(),
                          last_name: form.last_name.trim(),
                          email: form.email.trim() || undefined,
                          phone: form.phone.trim() || undefined,
                      }
                    : undefined,
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
                    <h2 className="text-base font-semibold text-neutral-900">
                        New Client
                    </h2>
                    <button
                        onClick={onClose}
                        className="text-neutral-400 hover:text-neutral-900"
                    >
                        <X size={18} />
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-5 space-y-4">
                    <div>
                        <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                            Company Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            required
                            value={form.name}
                            onChange={e =>
                                setForm(f => ({ ...f, name: e.target.value }))
                            }
                            placeholder="e.g. Acme Signage Ltd"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>

                    <div className="border-t border-neutral-100 pt-4">
                        <p className="text-[10px] font-medium text-neutral-400 uppercase mb-3">
                            Primary Contact (optional)
                        </p>
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                    First Name
                                </label>
                                <input
                                    value={form.first_name}
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            first_name: e.target.value,
                                        }))
                                    }
                                    placeholder="John"
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                    Last Name
                                </label>
                                <input
                                    value={form.last_name}
                                    onChange={e =>
                                        setForm(f => ({
                                            ...f,
                                            last_name: e.target.value,
                                        }))
                                    }
                                    placeholder="Smith"
                                    className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                                />
                            </div>
                        </div>
                        <div className="mt-3">
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Email
                            </label>
                            <input
                                type="email"
                                value={form.email}
                                onChange={e =>
                                    setForm(f => ({
                                        ...f,
                                        email: e.target.value,
                                    }))
                                }
                                placeholder="john@example.com"
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                            />
                        </div>
                        <div className="mt-3">
                            <label className="block text-[10px] font-medium text-neutral-500 uppercase mb-1">
                                Phone
                            </label>
                            <input
                                type="tel"
                                value={form.phone}
                                onChange={e =>
                                    setForm(f => ({
                                        ...f,
                                        phone: e.target.value,
                                    }))
                                }
                                placeholder="0191 123 4567"
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                            />
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
                            className="flex items-center gap-2 px-4 py-1.5 text-xs font-medium bg-black text-white rounded hover:bg-neutral-800 disabled:opacity-50"
                        >
                            {isSaving ? (
                                <Loader2 size={12} className="animate-spin" />
                            ) : (
                                <Plus size={12} />
                            )}
                            Create Client
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
