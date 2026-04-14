'use client';

import { useState, useTransition } from 'react';
import { linkJobToOrg, markJobAsOrphan } from '@/lib/artwork/reconcile-actions';
import { useRouter } from 'next/navigation';

interface Props {
    jobId: string;
    jobReference: string;
    legacyName: string;
    orgs: { id: string; name: string }[];
}

export function ReconcileRow({ jobId, jobReference, legacyName, orgs }: Props) {
    const [selectedOrg, setSelectedOrg] = useState('');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const router = useRouter();

    const submit = (action: 'link' | 'orphan') => {
        setError(null);
        if (!selectedOrg) {
            setError('pick an organisation first');
            return;
        }
        startTransition(async () => {
            const fn = action === 'link' ? linkJobToOrg : markJobAsOrphan;
            const res = await fn(jobId, selectedOrg);
            if ('error' in res) setError(res.error);
            else router.refresh();
        });
    };

    return (
        <tr className="hover:bg-neutral-50">
            <td className="px-4 py-3 font-mono text-sm">{jobReference}</td>
            <td className="px-4 py-3 text-sm text-neutral-600">{legacyName}</td>
            <td className="px-4 py-3">
                <select
                    className="w-full px-2 py-1 text-sm border border-neutral-200 rounded"
                    value={selectedOrg}
                    onChange={(e) => setSelectedOrg(e.target.value)}
                    disabled={pending}
                >
                    <option value="">— select —</option>
                    {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                </select>
                {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
            </td>
            <td className="px-4 py-3 text-right">
                <button
                    className="btn-primary text-xs mr-2"
                    disabled={pending || !selectedOrg}
                    onClick={() => submit('link')}
                >
                    link
                </button>
                <button
                    className="btn-secondary text-xs"
                    disabled={pending || !selectedOrg}
                    onClick={() => submit('orphan')}
                    title="mark as orphan (no production link)"
                >
                    orphan
                </button>
            </td>
        </tr>
    );
}
