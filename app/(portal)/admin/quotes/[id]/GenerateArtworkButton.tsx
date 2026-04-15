'use client';

/**
 * Generate Artwork button — visible on accepted quotes. Creates artwork jobs
 * + skeleton components from the quote's production-work line items.
 * Idempotent: re-clicking reuses existing artwork jobs and only creates
 * components that don't already exist.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileCheck, Loader2 } from 'lucide-react';
import { generateArtworkFromQuote } from '@/lib/artwork/actions';

interface Props {
    quoteId: string;
    alreadyGenerated?: boolean;
}

export function GenerateArtworkButton({ quoteId, alreadyGenerated }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [msg, setMsg] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleClick = () => {
        setMsg(null);
        setError(null);
        startTransition(async () => {
            const res = await generateArtworkFromQuote(quoteId);
            if ('error' in res) {
                setError(res.error);
                return;
            }
            const msgs: string[] = [];
            if (res.artworkJobIds.length > 0) {
                msgs.push(`${res.artworkJobIds.length} artwork job${res.artworkJobIds.length === 1 ? '' : 's'} ready`);
            }
            if (res.skipped > 0) {
                msgs.push(`${res.skipped} service line${res.skipped === 1 ? '' : 's'} skipped`);
            }
            setMsg(msgs.join(' · ') || 'nothing to generate');
            router.refresh();
        });
    };

    return (
        <div>
            <button
                type="button"
                onClick={handleClick}
                disabled={pending}
                className="btn-secondary inline-flex items-center gap-2"
                title={alreadyGenerated ? 're-sync artwork jobs with quote items' : 'generate artwork jobs from this quote'}
            >
                {pending ? <Loader2 size={14} className="animate-spin" /> : <FileCheck size={14} />}
                {alreadyGenerated ? 'sync artwork' : 'generate artwork'}
            </button>
            {msg && <p className="text-xs text-green-700 mt-1">{msg}</p>}
            {error && <p className="text-xs text-red-700 mt-1">{error}</p>}
        </div>
    );
}
