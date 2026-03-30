import { requireAdmin, isSuperAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { Plus, Settings } from 'lucide-react';
import { redirect } from 'next/navigation';
import { PricingListClient } from './PricingListClient';

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function getStatusVariant(status: string): 'draft' | 'approved' | 'default' {
    switch (status) {
        case 'draft': return 'draft';
        case 'active': return 'approved';
        case 'archived': return 'default';
        default: return 'default';
    }
}

export default async function AdminPricingPage() {
    await requireAdmin();

    // Super-admin only for pricing
    const superAdmin = await isSuperAdmin();
    if (!superAdmin) {
        redirect('/app/admin');
    }

    const supabase = await createServerClient();

    const { data: pricingSets, error } = await supabase
        .from('pricing_sets')
        .select('id, name, status, effective_from, created_at')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching pricing sets:', error);
    }

    // Group by status
    const active = (pricingSets || []).filter(p => p.status === 'active');
    const drafts = (pricingSets || []).filter(p => p.status === 'draft');
    const archived = (pricingSets || []).filter(p => p.status === 'archived');

    return (
        <div>
            <PageHeader
                title="Pricing Sets"
                description="Manage rate cards for the internal quoter"
                action={<PricingListClient />}
            />

            {/* Active Pricing Set */}
            <Card className="mb-6">
                <h2 className="text-sm font-semibold text-neutral-900 mb-4">Active Pricing Set</h2>
                {active.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">
                        No active pricing set. Create a draft and activate it.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {active.map((set) => (
                            <div
                                key={set.id}
                                className="flex items-center justify-between p-4 bg-green-50 rounded-[var(--radius-sm)] border border-green-200"
                            >
                                <div>
                                    <div className="flex items-center gap-2">
                                        <p className="text-sm font-medium text-neutral-900">{set.name}</p>
                                        <Chip variant="approved">Active</Chip>
                                    </div>
                                    <p className="text-xs text-neutral-500 mt-1">
                                        Effective from {set.effective_from ? formatDate(set.effective_from) : 'N/A'}
                                    </p>
                                </div>
                                <Link
                                    href={`/app/admin/pricing/${set.id}`}
                                    className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                                >
                                    <Settings size={14} />
                                    View
                                </Link>
                            </div>
                        ))}
                    </div>
                )}
            </Card>

            {/* Draft Pricing Sets */}
            <Card className="mb-6">
                <h2 className="text-sm font-semibold text-neutral-900 mb-4">Draft Pricing Sets</h2>
                {drafts.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-4 text-center">
                        No draft pricing sets. Click "New Draft" to create one.
                    </p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Status</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Created</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {drafts.map((set) => (
                                    <tr key={set.id} className="hover:bg-neutral-50">
                                        <td className="px-4 py-3 text-sm font-medium text-neutral-900">{set.name}</td>
                                        <td className="px-4 py-3">
                                            <Chip variant={getStatusVariant(set.status)}>{set.status}</Chip>
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(set.created_at)}</td>
                                        <td className="px-4 py-3 text-right space-x-3">
                                            <Link
                                                href={`/app/admin/pricing/${set.id}`}
                                                className="text-sm text-blue-600 hover:underline"
                                            >
                                                Edit
                                            </Link>
                                            <Link
                                                href={`/app/admin/pricing/${set.id}/activate`}
                                                className="text-sm text-green-600 hover:underline"
                                            >
                                                Activate
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            {/* Archived Pricing Sets */}
            {archived.length > 0 && (
                <Card>
                    <h2 className="text-sm font-semibold text-neutral-900 mb-4">Archived Pricing Sets</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Effective From</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase">Created</th>
                                    <th className="px-4 py-3 text-right text-xs font-medium text-neutral-500 uppercase">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {archived.map((set) => (
                                    <tr key={set.id} className="hover:bg-neutral-50">
                                        <td className="px-4 py-3 text-sm text-neutral-700">{set.name}</td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">
                                            {set.effective_from ? formatDate(set.effective_from) : '—'}
                                        </td>
                                        <td className="px-4 py-3 text-sm text-neutral-500">{formatDate(set.created_at)}</td>
                                        <td className="px-4 py-3 text-right">
                                            <Link
                                                href={`/app/admin/pricing/${set.id}`}
                                                className="text-sm text-neutral-500 hover:underline"
                                            >
                                                View
                                            </Link>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}
        </div>
    );
}

