'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Wand2, Loader2 } from 'lucide-react';
import { createProductionPackFromJob } from '@/lib/production-packs/actions';

/**
 * Scaffold a works pack from an artwork job — pick a job and it pulls every
 * component + sub-item (and the job's linked visualiser design) into a fresh,
 * editable pack, then opens it.
 */
export function GenerateFromJobButton({
    jobs,
}: {
    jobs: Array<{ id: string; name: string; reference: string }>;
}) {
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const router = useRouter();

    if (jobs.length === 0) return null;

    const generate = (jobId: string) => {
        startTransition(async () => {
            const res = await createProductionPackFromJob(jobId);
            setOpen(false);
            if (res.ok) router.push(`/admin/production-packs/${res.data.id}`);
        });
    };

    return (
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                disabled={pending}
                className="btn-secondary text-xs"
            >
                {pending ? (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                ) : (
                    <Wand2 size={14} aria-hidden />
                )}
                {pending ? 'generating…' : 'from job'}
            </button>
            {open && (
                <>
                    <div
                        className="fixed inset-0 z-10"
                        onClick={() => setOpen(false)}
                    />
                    <div className="absolute right-0 top-full z-20 mt-1 max-h-80 w-72 overflow-auto rounded-lg border border-neutral-200 bg-white py-1 shadow-lg">
                        <p className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                            scaffold from artwork job
                        </p>
                        {jobs.map((j) => (
                            <button
                                key={j.id}
                                type="button"
                                onClick={() => generate(j.id)}
                                className="w-full px-3 py-2 text-left hover:bg-neutral-50"
                            >
                                <span className="block truncate text-sm font-medium text-neutral-800">
                                    {j.name}
                                </span>
                                {j.reference && (
                                    <span className="block text-[11px] text-neutral-400">
                                        {j.reference}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
