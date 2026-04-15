'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';
import { createProductionFromVisual } from '@/lib/artwork/visual-approval-actions';

interface Props {
    visualJobId: string;
    /** Defined once a production job has already been spawned. */
    existingProductionJobId?: string | null;
}

export function CreateProductionFromVisualButton({ visualJobId, existingProductionJobId }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    if (existingProductionJobId) {
        return (
            <button
                type="button"
                onClick={() => router.push(`/admin/artwork/${existingProductionJobId}`)}
                className="btn-secondary w-full inline-flex items-center justify-center gap-2"
            >
                <ArrowRight size={14} />
                view production artwork →
            </button>
        );
    }

    const spawn = () => {
        setErr(null);
        startTransition(async () => {
            const res = await createProductionFromVisual(visualJobId);
            if ('error' in res) {
                setErr(res.error);
                return;
            }
            router.push(`/admin/artwork/${res.productionJobId}`);
        });
    };

    return (
        <div className="space-y-2">
            <button
                type="button"
                onClick={spawn}
                disabled={pending}
                className="w-full py-3 rounded-lg bg-green-700 hover:bg-green-800 text-white text-sm font-bold inline-flex items-center justify-center gap-2 disabled:opacity-60"
            >
                {pending ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                Create production artwork from this
            </button>
            {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
    );
}
