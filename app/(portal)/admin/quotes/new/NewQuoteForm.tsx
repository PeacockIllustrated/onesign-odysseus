'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createQuoteAction } from '@/lib/quoter/actions';
import { getContactsForOrgAction } from '@/lib/clients/actions';
import { OrgPicker } from '@/components/admin/OrgPicker';
import { ContactPicker } from '@/components/admin/ContactPicker';
import { SitePicker } from '@/components/admin/SitePicker';

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

    // FK picker state
    const [orgId, setOrgId] = useState<string | null>(null);
    const [contactId, setContactId] = useState<string | null>(null);
    const [siteId, setSiteId] = useState<string | null>(null);

    const handleOrgChange = async (newOrgId: string | null, orgName: string) => {
        setOrgId(newOrgId);
        setContactId(null);
        setSiteId(null);

        if (orgName) {
            setCustomerName(orgName);
        }

        // Auto-fill email/phone from primary contact
        if (newOrgId) {
            try {
                const contacts = await getContactsForOrgAction(newOrgId);
                const primary = contacts.find(c => c.is_primary) || contacts[0];
                if (primary) {
                    if (primary.email) setCustomerEmail(primary.email);
                    if (primary.phone) setCustomerPhone(primary.phone);
                }
            } catch {
                // Silently ignore — freeform fields still work
            }
        }
    };

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
                org_id: orgId || undefined,
                contact_id: contactId || undefined,
                site_id: siteId || undefined,
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
            {/* Client Picker */}
            <div className="space-y-4">
                <h3 className="text-sm font-semibold text-neutral-900">Client</h3>

                <div>
                    <label className="block text-xs font-medium text-neutral-600 mb-1">
                        Select Client
                    </label>
                    <OrgPicker value={orgId} onChange={handleOrgChange} />
                    <p className="text-xs text-neutral-400 mt-1">
                        Optional &mdash; selecting a client auto-fills name, email and phone below
                    </p>
                </div>

                {orgId && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Contact
                            </label>
                            <ContactPicker orgId={orgId} value={contactId} onChange={setContactId} />
                        </div>
                        <div>
                            <label className="block text-xs font-medium text-neutral-600 mb-1">
                                Site
                            </label>
                            <SitePicker orgId={orgId} value={siteId} onChange={setSiteId} />
                        </div>
                    </div>
                )}
            </div>

            {/* Customer Details (freeform, auto-filled from picker) */}
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
                        className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
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
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
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
                            placeholder="0191 123 4567"
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
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
                            className="w-full px-3 py-2 text-sm border border-neutral-200 rounded-[var(--radius-sm)] focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
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
