'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { createDraftPricingSetFromActiveAction } from '@/lib/quoter/pricing-actions';

export function PricingListClient() {
    const router = useRouter();
    const [isCreating, setIsCreating] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [name, setName] = useState('');
    const [error, setError] = useState<string | null>(null);

    const handleCreate = async () => {
        if (!name.trim()) {
            setError('Name is required');
            return;
        }

        setIsCreating(true);
        setError(null);

        try {
            const result = await createDraftPricingSetFromActiveAction(name.trim());

            if ('error' in result) {
                setError(result.error);
                return;
            }

            setShowModal(false);
            setName('');
            router.push(`/app/admin/pricing/${result.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create');
        } finally {
            setIsCreating(false);
        }
    };

    return (
        <>
            <button
                onClick={() => setShowModal(true)}
                className="btn-primary flex items-center gap-2"
            >
                <Plus size={16} />
                New Draft
            </button>

            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                    <div className="bg-white rounded-[var(--radius-md)] p-6 w-full max-w-md">
                        <h2 className="text-lg font-semibold text-neutral-900 mb-4">
                            Create Draft Pricing Set
                        </h2>

                        <p className="text-sm text-neutral-600 mb-4">
                            This will create a new draft by copying the active pricing set (if one exists).
                        </p>

                        <div className="mb-4">
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Name
                            </label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="e.g. Rate Card v2.1"
                                className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                                autoFocus
                            />
                        </div>

                        {error && (
                            <div className="mb-4 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
                                {error}
                            </div>
                        )}

                        <div className="flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    setShowModal(false);
                                    setName('');
                                    setError(null);
                                }}
                                className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
                                disabled={isCreating}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                onClick={handleCreate}
                                disabled={isCreating}
                                className="px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isCreating && <Loader2 size={14} className="animate-spin" />}
                                Create Draft
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
