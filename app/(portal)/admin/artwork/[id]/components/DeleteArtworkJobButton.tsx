'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteArtworkJob } from '@/lib/artwork/actions';

interface Props {
    artworkJobId: string;
    jobReference: string;
}

export function DeleteArtworkJobButton({ artworkJobId, jobReference }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const handleDelete = () => {
        setError(null);

        // Two-step confirm — typed reference to prevent fat-finger deletes.
        const typed = window.prompt(
            `Delete artwork job ${jobReference}?\n\nThis cannot be undone. All components, sub-items, design versions, production checks, and approval links will be removed.\n\nType the job reference exactly to confirm:`
        );
        if (typed === null) return;
        if (typed.trim() !== jobReference) {
            setError('reference did not match — delete cancelled');
            return;
        }

        startTransition(async () => {
            const res = await deleteArtworkJob(artworkJobId);
            if ('error' in res) {
                setError(res.error);
                return;
            }
            router.push('/admin/artwork');
            router.refresh();
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={handleDelete}
                disabled={pending}
                className="btn-secondary inline-flex items-center gap-1.5 text-red-700 border-red-200 hover:border-red-400 hover:bg-red-50 disabled:opacity-50"
                title={`Delete artwork job ${jobReference}`}
            >
                <Trash2 size={14} />
                {pending ? 'deleting…' : 'delete'}
            </button>
            {error && (
                <p className="text-xs text-red-700 mt-1 ml-2 absolute">
                    {error}
                </p>
            )}
        </>
    );
}
