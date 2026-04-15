'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createArtworkJobForItem } from '@/lib/artwork/actions';

export function StartArtworkButton({ jobItemId }: { jobItemId: string }) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();

    function handleClick() {
        startTransition(async () => {
            const result = await createArtworkJobForItem(jobItemId);
            if ('id' in result) {
                router.push(`/admin/artwork/${result.id}`);
            }
        });
    }

    return (
        <button
            onClick={handleClick}
            disabled={isPending}
            className="text-xs font-medium px-3 py-1.5 bg-[#D85A30] text-white rounded-[var(--radius-sm)] hover:bg-[#c14e28] disabled:opacity-50 transition-colors"
        >
            {isPending ? 'Creating...' : 'Start Artwork Pack'}
        </button>
    );
}
