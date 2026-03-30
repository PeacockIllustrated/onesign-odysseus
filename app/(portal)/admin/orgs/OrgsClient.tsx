'use client';

import { useState } from 'react';
import { type Org } from '@/lib/supabase';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { CreateOrgModal } from './CreateOrgModal';
import { OrgDetailModal } from './OrgDetailModal';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';

interface OrgsClientProps {
    initialOrgs: Org[];
    memberCounts: Record<string, number>;
    subscriptions: Record<string, { package_key: string; status: string }>;
}

export function OrgsClient({ initialOrgs, memberCounts, subscriptions }: OrgsClientProps) {
    const router = useRouter();
    const [createOpen, setCreateOpen] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);

    function handleCreateSuccess() {
        router.refresh();
    }

    return (
        <>
            <div className="flex justify-end mb-4">
                <button onClick={() => setCreateOpen(true)} className="btn-primary flex items-center gap-2">
                    <Plus size={16} />
                    Create Org
                </button>
            </div>

            <Card>
                {initialOrgs.length === 0 ? (
                    <p className="text-sm text-neutral-500 py-8 text-center">No organisations yet</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b border-neutral-200">
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Name</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Slug</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Members</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Package</th>
                                    <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Created</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100">
                                {initialOrgs.map(org => {
                                    const sub = subscriptions[org.id];
                                    return (
                                        <tr
                                            key={org.id}
                                            onClick={() => {
                                                setSelectedOrg(org);
                                                setDetailOpen(true);
                                            }}
                                            className="cursor-pointer hover:bg-neutral-50 transition-colors"
                                        >
                                            <td className="px-4 py-3 font-medium text-neutral-900">{org.name}</td>
                                            <td className="px-4 py-3 font-mono text-sm text-neutral-600">{org.slug}</td>
                                            <td className="px-4 py-3 text-sm">{memberCounts[org.id] || 0}</td>
                                            <td className="px-4 py-3">
                                                {sub ? (
                                                    <Chip variant={sub.status === 'active' ? 'active' : 'paused'}>
                                                        {sub.package_key?.toUpperCase() || '—'}
                                                    </Chip>
                                                ) : (
                                                    <span className="text-neutral-400">—</span>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-500">
                                                {new Date(org.created_at).toLocaleDateString('en-GB')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </Card>

            <CreateOrgModal
                open={createOpen}
                onClose={() => setCreateOpen(false)}
                onSuccess={handleCreateSuccess}
            />

            <OrgDetailModal
                org={selectedOrg}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
            />
        </>
    );
}

