'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2 } from 'lucide-react';
import { addVariantToComponent } from '@/lib/artwork/visual-approval-actions';
import type { ArtworkVariant } from '@/lib/artwork/variant-types';
import { VariantCard } from './VariantCard';

interface Props {
    componentId: string;
    variants: ArtworkVariant[];
    readOnly?: boolean;
}

export function VariantsPanel({ componentId, variants, readOnly = false }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);

    const add = () => {
        setErr(null);
        startTransition(async () => {
            const res = await addVariantToComponent({ componentId });
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    return (
        <section className="space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-sm font-bold text-neutral-900">Variants</h3>
                    <p className="text-xs text-neutral-500">
                        add one design option per variant · the client picks one at approval
                    </p>
                </div>
                {!readOnly && (
                    <button
                        type="button"
                        onClick={add}
                        disabled={pending}
                        className="btn-secondary text-xs inline-flex items-center gap-1"
                    >
                        {pending ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                        add variant
                    </button>
                )}
            </div>

            {variants.length === 0 ? (
                <p className="text-xs italic text-neutral-400 border border-dashed border-neutral-300 rounded-lg p-6 text-center">
                    no variants yet — add one or more design options for the client to pick from
                </p>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {variants.map((v) => (
                        <VariantCard key={v.id} variant={v} readOnly={readOnly} />
                    ))}
                </div>
            )}

            {err && <p className="text-xs text-red-700">{err}</p>}
        </section>
    );
}
