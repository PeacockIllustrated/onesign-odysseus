'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createQuoteAction } from '@/lib/quoter/actions';

interface NewQuoteFormProps {
    defaultPricingSetId: string;
    pricingSets: Array<{ id: string; name: string; status: string }>;
    showPricingSetSelector: boolean;
}

export function NewQuoteForm({
    defaultPricingSetId,
    pricingSets,
    showPricingSetSelector,
}: NewQuoteFormProps) {
    const router = useRouter();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [customerName, setCustomerName] = useState('');
    const [customerEmail, setCustomerEmail] = useState('');
    const [customerPhone, setCustomerPhone] = useState('');
    const [pricingSetId, setPricingSetId] = useState(defaultPricingSetId);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError(null);

        try {
            const result = await createQuoteAction({
                customer_name: customerName || undefined,
                customer_email: customerEmail || undefined,
                customer_phone: customerPhone || undefined,
                pricing_set_id: pricingSetId,
            });

            if ('error' in result) {
                setError(result.error);
                return;
            }

            router.push(`/admin/quotes/${result.id}`);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create quote');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6 max-w-xl">
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-neutral-900">Customer Details</h3>

                <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                        Name
                    </label>
                    <input
                        type="text"
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="Customer or company name"
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                    />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Email
                        </label>
                        <input
                            type="email"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            placeholder="email@example.com"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Phone
                        </label>
                        <input
                            type="tel"
                            value={customerPhone}
                            onChange={(e) => setCustomerPhone(e.target.value)}
                            placeholder="01onal 123 456"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        />
                    </div>
                </div>
            </div>

            {showPricingSetSelector && pricingSets.length > 1 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-neutral-900">Pricing Configuration</h3>
                    <div>
                        <label className="block text-xs font-medium text-neutral-600 mb-1">
                            Pricing Set
                        </label>
                        <select
                            value={pricingSetId}
                            onChange={(e) => setPricingSetId(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-black"
                        >
                            {pricingSets.map((ps) => (
                                <option key={ps.id} value={ps.id}>
                                    {ps.name} {ps.status === 'draft' ? '(Draft)' : ''}
                                </option>
                            ))}
                        </select>
                        <p className="text-xs text-neutral-500 mt-1">
                            Draft pricing sets are for testing only
                        </p>
                    </div>
                </div>
            )}

            {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-[var(--radius-sm)]">
                    <p className="text-sm text-red-700">{error}</p>
                </div>
            )}

            <div className="flex justify-end gap-3 pt-4 border-t border-neutral-200">
                <button
                    type="button"
                    onClick={() => router.push('/admin/quotes')}
                    className="px-4 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900"
                    disabled={isSubmitting}
                >
                    Cancel
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-2 text-sm font-medium bg-black text-white rounded-[var(--radius-sm)] hover:bg-neutral-800 disabled:opacity-50 flex items-center gap-2"
                >
                    {isSubmitting && <Loader2 size={14} className="animate-spin" />}
                    Create Quote
                </button>
            </div>
        </form>
    );
}
