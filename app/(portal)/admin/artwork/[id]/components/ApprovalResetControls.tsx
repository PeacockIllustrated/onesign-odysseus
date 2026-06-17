'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resetArtworkApproval, cloneArtworkJob } from '@/lib/artwork/actions';
import { Card } from '@/app/(portal)/components/ui';
import { RotateCcw, Copy } from 'lucide-react';

export function ApprovalResetControls({ jobId }: { jobId: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [confirmReset, setConfirmReset] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const doReset = () => {
        setError(null);
        if (!confirmReset) {
            setConfirmReset(true);
            setTimeout(() => setConfirmReset(false), 4000);
            return;
        }
        startTransition(async () => {
            const r = await resetArtworkApproval(jobId);
            if ('error' in r) setError(r.error);
            else {
                setConfirmReset(false);
                router.refresh();
            }
        });
    };

    const doClone = () => {
        setError(null);
        startTransition(async () => {
            const r = await cloneArtworkJob(jobId);
            if ('error' in r) setError(r.error);
            else router.push(`/admin/artwork/${r.id}`);
        });
    };

    return (
        <Card>
            <h3 className="text-sm font-semibold text-neutral-900 mb-1">re-do approval</h3>
            <p className="text-xs text-neutral-500 mb-3">
                Reset this job to “as if never approved”, or clone it as a fresh draft.
            </p>
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={doReset}
                    disabled={isPending}
                    className={`text-xs font-medium px-3 py-1.5 rounded-[var(--radius-sm)] inline-flex items-center gap-1.5 border disabled:opacity-50 ${
                        confirmReset
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50'
                    }`}
                >
                    <RotateCcw size={14} />
                    {confirmReset ? 'click again to confirm reset' : 'reset approval'}
                </button>
                <button
                    type="button"
                    onClick={doClone}
                    disabled={isPending}
                    className="text-xs font-medium px-3 py-1.5 rounded-[var(--radius-sm)] inline-flex items-center gap-1.5 border bg-white text-[#4e7e8c] border-[#c9d9df] hover:bg-[#e8f0f3] disabled:opacity-50"
                >
                    <Copy size={14} />
                    clone as new
                </button>
            </div>
            <p className="mt-2 text-[11px] text-neutral-400">
                <strong>Reset</strong> un-approves this job in place — un-chooses variants and re-opens the link as pending.
                <strong> Clone</strong> makes a fresh draft copy and leaves this one untouched.
            </p>
            {error && <p className="mt-2 text-[11px] text-red-600">{error}</p>}
        </Card>
    );
}
