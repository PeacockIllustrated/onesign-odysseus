// app/(portal)/admin/quotes/[id]/CreateJobButton.tsx
'use client';

import { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutGrid, Loader2, CheckCircle2 } from 'lucide-react';
import { createJobFromQuote, getOrgListAction } from '@/lib/production/actions';

interface CreateJobButtonProps {
    quoteId: string;
    existingJobId: string | null;
    existingJobNumber: string | null;
}

export function CreateJobButton({ quoteId, existingJobId, existingJobNumber }: CreateJobButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);
    const [orgId, setOrgId] = useState('');
    const [showPicker, setShowPicker] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (showPicker) {
            getOrgListAction().then(setOrgs);
        }
    }, [showPicker]);

    if (existingJobId) {
        return (
            <Link
                href={`/app/admin/jobs`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 border border-green-200 hover:bg-green-100 rounded-[var(--radius-sm)] transition-colors"
            >
                <CheckCircle2 size={14} />
                Job {existingJobNumber}
            </Link>
        );
    }

    if (!showPicker) {
        return (
            <button
                onClick={() => setShowPicker(true)}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] rounded-[var(--radius-sm)] transition-colors"
            >
                <LayoutGrid size={14} />
                Create Production Job
            </button>
        );
    }

    async function handleCreate() {
        if (!orgId) return;
        startTransition(async () => {
            const result = await createJobFromQuote(quoteId, orgId);
            if ('error' in result) {
                setError(result.error);
            } else {
                router.push(`/app/admin/jobs`);
            }
        });
    }

    return (
        <div className="flex items-center gap-2">
            {error && <span className="text-xs text-red-600">{error}</span>}
            <select
                value={orgId}
                onChange={e => setOrgId(e.target.value)}
                className="text-sm border border-neutral-200 rounded px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
            >
                <option value="">Select org…</option>
                {orgs.map(o => (
                    <option key={o.id} value={o.id}>{o.name}</option>
                ))}
            </select>
            <button
                onClick={handleCreate}
                disabled={!orgId || isPending}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] disabled:opacity-50 rounded-[var(--radius-sm)] transition-colors"
            >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <LayoutGrid size={14} />}
                Create Job
            </button>
            <button
                onClick={() => setShowPicker(false)}
                className="text-xs text-neutral-500 hover:text-neutral-700"
            >
                Cancel
            </button>
        </div>
    );
}
