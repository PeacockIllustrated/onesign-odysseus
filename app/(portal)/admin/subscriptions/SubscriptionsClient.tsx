'use client';

import { useState } from 'react';
import { type Org, type Subscription, type SubscriptionAccelerator } from '@/lib/supabase';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { AssignSubscriptionModal } from './AssignSubscriptionModal';
import { DIGITAL_PACKAGES, getAcceleratorByKey } from '@/lib/offers/onesignDigital';
import { useRouter } from 'next/navigation';
import { Plus, Zap } from 'lucide-react';

interface SubscriptionsClientProps {
    orgs: Org[];
    subscriptions: (Subscription & { org: Org; accelerators: SubscriptionAccelerator[] })[];
}

const statusFilters = ['all', 'active', 'paused', 'cancelled'] as const;
type StatusFilter = typeof statusFilters[number];

export function SubscriptionsClient({ orgs, subscriptions }: SubscriptionsClientProps) {
    const router = useRouter();
    const [assignOpen, setAssignOpen] = useState(false);
    const [filter, setFilter] = useState<StatusFilter>('all');

    const filtered = filter === 'all'
        ? subscriptions
        : subscriptions.filter(s => s.status === filter);

    function handleSuccess() {
        router.refresh();
    }

    function getPackageName(key: string) {
        const pkg = DIGITAL_PACKAGES.find(p => p.id === key);
        return pkg?.name || key;
    }

    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex gap-2 flex-wrap">
                    {statusFilters.map(s => (
                        <button
                            key={s}
                            onClick={() => setFilter(s)}
                            className={`
                                px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                                ${filter === s
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}
                            `}
                        >
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                        </button>
                    ))}
                </div>
                <button onClick={() => setAssignOpen(true)} className="btn-primary flex items-center gap-2 shrink-0">
                    <Plus size={16} />
                    Assign Package
                </button>
            </div>

            <Card>
                {filtered.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-8 text-center">No subscriptions found</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Organisation</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Package</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Term</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Ad Spend</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Accelerators</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Start Date</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {filtered.map(sub => (
                                    <tr key={sub.id} className="hover:bg-neutral-50">
                                        <td className="px-4 py-3 font-medium text-neutral-900">{sub.org?.name || '—'}</td>
                                        <td className="px-4 py-3">
                                            <span className="font-bold">{getPackageName(sub.package_key)}</span>
                                        </td>
                                        <td className="px-4 py-3 text-sm">{sub.term_months} months</td>
                                        <td className="px-4 py-3 text-sm">
                                            {sub.ad_spend_included
                                                ? `£${(sub.ad_spend_included / 100).toLocaleString()}/mo`
                                                : '—'}
                                        </td>
                                        <td className="px-4 py-3">
                                            {sub.accelerators && sub.accelerators.length > 0 ? (
                                                <div className="flex items-center gap-1">
                                                    <Zap size={12} className="text-amber-500" />
                                                    <span className="text-sm">{sub.accelerators.length}</span>
                                                </div>
                                            ) : (
                                                <span className="text-neutral-400">—</span>
                                            )}
                                        </td>
                                        <td className="px-4 py-3">
                                            <Chip variant={sub.status === 'active' ? 'active' : sub.status === 'paused' ? 'paused' : 'default'}>
                                                {sub.status}
                                            </Chip>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">
                                            {new Date(sub.start_date).toLocaleDateString('en-GB')}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <AssignSubscriptionModal
                orgs={orgs}
                open={assignOpen}
                onClose={() => setAssignOpen(false)}
                onSuccess={handleSuccess}
            />
        </>
    );
}

