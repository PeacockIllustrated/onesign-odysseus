'use client';

import { useState, useTransition } from 'react';
import { linkJobToOrg, markJobAsOrphan } from '@/lib/artwork/reconcile-actions';
import { useRouter } from 'next/navigation';
import { CreateOrgModal, CreatedOrg } from '@/app/(portal)/admin/orgs/CreateOrgModal';
import { Plus } from 'lucide-react';

interface Props {
    jobId: string;
    jobReference: string;
    legacyName: string;
    orgs: { id: string; name: string }[];
}

export function ReconcileRow({ jobId, jobReference, legacyName, orgs: initialOrgs }: Props) {
    const [orgs, setOrgs] = useState(initialOrgs);
    const [selectedOrg, setSelectedOrg] = useState('');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const router = useRouter();

    const handleOrgCreated = (newOrg?: CreatedOrg) => {
        if (!newOrg) return;
        setOrgs((prev) => [{ id: newOrg.id, name: newOrg.name }, ...prev]);
        setSelectedOrg(newOrg.id);
    };

    const submit = (action: 'link' | 'orphan') => {
        setError(null);
        // Linking requires a client. Orphaning doesn't — reconciliation rows
        // exist precisely because the client is unknown. If one IS selected
        // we'll still record it alongside the orphan flag.
        if (action === 'link' && !selectedOrg) {
            setError('pick a client first');
            return;
        }
        startTransition(async () => {
            const res =
                action === 'link'
                    ? await linkJobToOrg(jobId, selectedOrg)
                    : await markJobAsOrphan(jobId, selectedOrg || null);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    return (
        <tr className="hover:bg-neutral-50">
            <td className="px-4 py-3 font-mono text-sm">{jobReference}</td>
            <td className="px-4 py-3 text-sm text-neutral-600">{legacyName}</td>
            <td className="px-4 py-3">
                <div className="flex items-center gap-2">
                    <select
                        className="flex-1 min-w-0 px-2 py-1 text-sm border border-neutral-200 rounded"
                        value={selectedOrg}
                        onChange={(e) => setSelectedOrg(e.target.value)}
                        disabled={pending}
                    >
                        <option value="">— select —</option>
                        {orgs.map((o) => (
                            <option key={o.id} value={o.id}>{o.name}</option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={() => setModalOpen(true)}
                        title="add new client"
                        className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-[#4e7e8c] hover:underline whitespace-nowrap"
                    >
                        <Plus size={12} />
                        new
                    </button>
                </div>
                {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </td>
            <td className="px-4 py-3 text-right">
                <button
                    className="btn-primary text-xs mr-2"
                    disabled={pending || !selectedOrg}
                    onClick={() => submit('link')}
                    title="link this design to the selected client"
                >
                    link
                </button>
                <button
                    className="btn-secondary text-xs"
                    disabled={pending}
                    onClick={() => submit('orphan')}
                    title={
                        selectedOrg
                            ? 'mark orphan and attach to the selected client'
                            : 'mark orphan with no client link'
                    }
                >
                    orphan
                </button>
            </td>
            <CreateOrgModal
                open={modalOpen}
                onClose={() => setModalOpen(false)}
                onSuccess={handleOrgCreated}
            />
        </tr>
    );
}
