'use client';

import { useState } from 'react';
import { createBrowserClient, type Org } from '@/lib/supabase';
import { Modal } from '@/app/(portal)/components/ui';
import { PackageSummaryCard } from '../components/PackageSummaryCard';
import { DIGITAL_PACKAGES, ACCELERATORS } from '@/lib/offers/onesignDigital';
import { Loader2 } from 'lucide-react';

interface AssignSubscriptionModalProps {
    orgs: Org[];
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
    preselectedOrgId?: string;
}

export function AssignSubscriptionModal({ orgs, open, onClose, onSuccess, preselectedOrgId }: AssignSubscriptionModalProps) {
    const [orgId, setOrgId] = useState(preselectedOrgId || '');
    const [packageId, setPackageId] = useState('');
    const [selectedAccelerators, setSelectedAccelerators] = useState<string[]>([]);
    const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const selectedPackage = DIGITAL_PACKAGES.find(p => p.id === packageId);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!orgId || !packageId || !selectedPackage) return;

        setLoading(true);
        setError(null);

        const supabase = createBrowserClient();

        try {
            const termMonths = parseInt(selectedPackage.term) || 3;
            const adSpendMatch = selectedPackage.adSpendIncluded.match(/£([\d,]+)/);
            const adSpendPence = adSpendMatch ? parseInt(adSpendMatch[1].replace(',', '')) * 100 : null;

            // Create subscription
            const { error: subError } = await supabase
                .from('subscriptions')
                .insert({
                    org_id: orgId,
                    package_key: packageId,
                    term_months: termMonths,
                    ad_spend_included: adSpendPence,
                    status: 'active',
                    start_date: startDate,
                });

            if (subError) throw new Error(subError.message);

            // Create accelerators
            for (const accKey of selectedAccelerators) {
                await supabase
                    .from('subscription_accelerators')
                    .insert({
                        org_id: orgId,
                        accelerator_key: accKey,
                        status: 'active',
                        start_date: startDate,
                    });
            }

            setOrgId('');
            setPackageId('');
            setSelectedAccelerators([]);
            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create subscription');
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal open={open} onClose={onClose} title="Assign Package">
            <form onSubmit={handleSubmit} className="space-y-5 min-w-[500px]">
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
                )}

                {/* Org Selector */}
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Organisation *
                    </label>
                    <select
                        value={orgId}
                        onChange={(e) => setOrgId(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                        required
                    >
                        <option value="">Select an organisation...</option>
                        {orgs.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>

                {/* Package Selection */}
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Package *
                    </label>
                    <div className="space-y-3">
                        {DIGITAL_PACKAGES.map(pkg => (
                            <PackageSummaryCard
                                key={pkg.id}
                                pkg={pkg}
                                selected={packageId === pkg.id}
                                onClick={() => setPackageId(pkg.id)}
                                showDeliverables={packageId === pkg.id}
                            />
                        ))}
                    </div>
                </div>

                {/* Accelerators */}
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">
                        Accelerators
                    </label>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-neutral-100 rounded-lg p-3">
                        {ACCELERATORS.map(cat => (
                            <div key={cat.title}>
                                <p className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-1">{cat.title}</p>
                                {cat.items.map(acc => (
                                    <label key={acc.key} className="flex items-center gap-2 text-sm py-1">
                                        <input
                                            type="checkbox"
                                            checked={selectedAccelerators.includes(acc.key)}
                                            onChange={(e) => {
                                                if (e.target.checked) {
                                                    setSelectedAccelerators([...selectedAccelerators, acc.key]);
                                                } else {
                                                    setSelectedAccelerators(selectedAccelerators.filter(k => k !== acc.key));
                                                }
                                            }}
                                        />
                                        <span>{acc.title}</span>
                                        <span className="text-neutral-400 ml-auto text-xs">{acc.price}</span>
                                    </label>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>

                {/* Start Date */}
                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Start Date
                    </label>
                    <input
                        type="date"
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                    />
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
                    <button type="button" onClick={onClose} className="btn-secondary">
                        Cancel
                    </button>
                    <button type="submit" disabled={loading || !orgId || !packageId} className="btn-primary flex items-center gap-2">
                        {loading && <Loader2 size={16} className="animate-spin" />}
                        Assign Package
                    </button>
                </div>
            </form>
        </Modal>
    );
}

