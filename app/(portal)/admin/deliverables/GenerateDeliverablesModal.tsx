'use client';

import { useState } from 'react';
import { createBrowserClient, type Org } from '@/lib/supabase';
import { Modal } from '@/app/(portal)/components/ui';
import { DIGITAL_PACKAGES } from '@/lib/offers/onesignDigital';
import { Loader2, Check } from 'lucide-react';

interface GenerateDeliverablesModalProps {
    orgs: Org[];
    subscriptions: Record<string, string>; // org_id -> package_key
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

export function GenerateDeliverablesModal({ orgs, subscriptions, open, onClose, onSuccess }: GenerateDeliverablesModalProps) {
    const [selectedOrgs, setSelectedOrgs] = useState<string[]>([]);
    const [month, setMonth] = useState(() => {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [generated, setGenerated] = useState(0);

    function toggleOrg(orgId: string) {
        setSelectedOrgs(prev =>
            prev.includes(orgId)
                ? prev.filter(id => id !== orgId)
                : [...prev, orgId]
        );
    }

    function selectAll() {
        setSelectedOrgs(orgs.filter(o => subscriptions[o.id]).map(o => o.id));
    }

    async function handleGenerate() {
        if (selectedOrgs.length === 0) return;

        setLoading(true);
        setError(null);
        setGenerated(0);

        const supabase = createBrowserClient();
        const monthDate = `${month}-01`;

        try {
            for (const orgId of selectedOrgs) {
                const packageKey = subscriptions[orgId];
                const pkg = DIGITAL_PACKAGES.find(p => p.id === packageKey);

                if (!pkg) continue;

                // Generate deliverables based on package
                const deliverables = pkg.deliverables
                    .filter(d => !d.isBold) // Skip "Everything in X" lines
                    .map(d => ({
                        org_id: orgId,
                        month: monthDate,
                        title: d.text,
                        status: 'draft' as const,
                        category: categorizeDeliverable(d.text),
                        template_key: pkg.id,
                    }));

                const { error: insertError } = await supabase
                    .from('deliverables')
                    .insert(deliverables);

                if (insertError) {
                    console.warn(`Failed to generate for org ${orgId}:`, insertError.message);
                } else {
                    setGenerated(prev => prev + 1);
                }
            }

            // TODO: Email seam - Notify clients of new deliverables

            onSuccess();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to generate deliverables');
        } finally {
            setLoading(false);
        }
    }

    function categorizeDeliverable(text: string): 'creative' | 'campaign' | 'reporting' | 'support' {
        const lower = text.toLowerCase();
        if (lower.includes('creative') || lower.includes('video') || lower.includes('ad')) return 'creative';
        if (lower.includes('report') || lower.includes('performance') || lower.includes('review')) return 'reporting';
        if (lower.includes('support') || lower.includes('call') || lower.includes('strategy')) return 'support';
        return 'campaign';
    }

    const orgsWithSubs = orgs.filter(o => subscriptions[o.id]);

    return (
        <Modal open={open} onClose={onClose} title="Generate Monthly Deliverables">
            <div className="space-y-4 min-w-[400px]">
                {error && (
                    <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
                )}

                <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-1">
                        Month
                    </label>
                    <input
                        type="month"
                        value={month}
                        onChange={(e) => setMonth(e.target.value)}
                        className="w-full px-3 py-2 border border-neutral-200 rounded-md"
                    />
                </div>

                <div>
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-neutral-700">
                            Select Organisations
                        </label>
                        <button
                            type="button"
                            onClick={selectAll}
                            className="text-xs text-blue-600 hover:underline"
                        >
                            Select all with subscriptions
                        </button>
                    </div>

                    {orgsWithSubs.length === 0 ? (
                        <p className="text-sm text-neutral-500 py-4 text-center bg-neutral-50 rounded-lg">
                            No organisations with active subscriptions
                        </p>
                    ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto border border-neutral-100 rounded-lg p-3">
                            {orgsWithSubs.map(org => {
                                const pkgKey = subscriptions[org.id];
                                const pkg = DIGITAL_PACKAGES.find(p => p.id === pkgKey);
                                const isSelected = selectedOrgs.includes(org.id);

                                return (
                                    <label
                                        key={org.id}
                                        className={`
                                            flex items-center gap-3 p-2 rounded-md cursor-pointer
                                            ${isSelected ? 'bg-neutral-100' : 'hover:bg-neutral-50'}
                                        `}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() => toggleOrg(org.id)}
                                            className="rounded"
                                        />
                                        <div className="flex-1">
                                            <span className="text-sm font-medium">{org.name}</span>
                                            {pkg && (
                                                <span className="ml-2 text-xs text-neutral-500">
                                                    ({pkg.name} — {pkg.deliverables.filter(d => !d.isBold).length} items)
                                                </span>
                                            )}
                                        </div>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 pt-4 border-t border-neutral-200">
                    <button type="button" onClick={onClose} className="btn-secondary">
                        Cancel
                    </button>
                    <button
                        onClick={handleGenerate}
                        disabled={loading || selectedOrgs.length === 0}
                        className="btn-primary flex items-center gap-2"
                    >
                        {loading ? (
                            <>
                                <Loader2 size={16} className="animate-spin" />
                                Generating... ({generated}/{selectedOrgs.length})
                            </>
                        ) : (
                            <>Generate for {selectedOrgs.length} org(s)</>
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}

