'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { createSubItem } from '@/lib/artwork/sub-item-actions';
import type { ProductionStage } from '@/lib/production/types';

interface Props {
    componentId: string;
    // Kept for API compatibility with the page; unused now — target department
    // is filled in later inside the sub-item card when it actually matters.
    stages?: ProductionStage[];
}

/**
 * One-click add. Previously a modal-like form asked for name + material +
 * target department before creating anything. That was friction: staff
 * always want to create the sub-item first, then fill fields in the card
 * where they can also drop an image and see the full context.
 */
export function AddSubItemForm({ componentId }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const add = () => {
        setError(null);
        startTransition(async () => {
            const res = await createSubItem({ component_id: componentId });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            router.refresh();
        });
    };

    return (
        <div>
            <button
                onClick={add}
                disabled={pending}
                className="w-full border-2 border-dashed border-neutral-200 hover:border-neutral-400 rounded-[var(--radius-md)] px-4 py-3 text-sm text-neutral-500 hover:text-neutral-700 inline-flex items-center justify-center gap-1.5 disabled:opacity-50"
            >
                {pending
                    ? <><Loader2 size={14} className="animate-spin" /> adding…</>
                    : <><Plus size={14} /> add sub-item</>}
            </button>
            {error && <p className="mt-2 text-xs text-red-700">{error}</p>}
        </div>
    );
}
