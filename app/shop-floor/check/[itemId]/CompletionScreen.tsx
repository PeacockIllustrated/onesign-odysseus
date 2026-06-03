'use client';

import { useState, useTransition } from 'react';
import { ArrowRight, Loader2, Pause } from 'lucide-react';
import type { ShopFloorCheckContext } from '@/lib/production/shop-floor-actions';
import { advanceItemToNextRoutedStage, pauseItem } from '@/lib/production/actions';

interface Props {
    ctx: ShopFloorCheckContext;
    onDone: () => void;
}

export function CompletionScreen({ ctx, onDone }: Props) {
    const [pendingKind, setPendingKind] = useState<'advance' | 'pause' | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const doAdvance = () => {
        setError(null);
        setPendingKind('advance');
        startTransition(async () => {
            const res = await advanceItemToNextRoutedStage(ctx.item.id);
            if ('error' in res) {
                setError(res.error);
                setPendingKind(null);
                return;
            }
            onDone();
        });
    };

    const doPause = () => {
        setError(null);
        setPendingKind('pause');
        startTransition(async () => {
            const res = await pauseItem(ctx.item.id);
            if ('error' in res) {
                setError(res.error);
                setPendingKind(null);
                return;
            }
            onDone();
        });
    };

    const nextLabel = ctx.nextStage ? `Send to ${ctx.nextStage.name}` : 'Complete item';

    return (
        <div className="min-h-screen bg-neutral-50 p-4">
            <div className="max-w-xl mx-auto pt-8 space-y-4">
                <h1 className="text-2xl font-bold text-neutral-900">
                    {ctx.item.job_number}{ctx.item.item_number ? ` / ${ctx.item.item_number}` : ''}
                </h1>
                <p className="text-sm text-neutral-600">
                    All sub-items for <strong>{ctx.stage?.name ?? 'this stage'}</strong> are signed off. Ready to hand this item on.
                </p>

                <div className="flex flex-wrap gap-2">
                    {ctx.subItems.map((si) => (
                        <span
                            key={si.id}
                            className="px-3 py-1.5 rounded bg-green-700 text-white text-xs font-semibold"
                        >
                            ✓ {si.label}{si.name ? ` · ${si.name}` : ''}
                        </span>
                    ))}
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                <button
                    type="button"
                    onClick={doAdvance}
                    disabled={pendingKind !== null}
                    className="w-full py-5 rounded-lg bg-green-700 hover:bg-green-800 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    {pendingKind === 'advance' ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                    → Complete &amp; {nextLabel}
                </button>

                <button
                    type="button"
                    onClick={doPause}
                    disabled={pendingKind !== null}
                    className="w-full py-3 rounded-lg bg-white border border-neutral-300 hover:bg-neutral-100 text-neutral-700 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    {pendingKind === 'pause' ? <Loader2 className="animate-spin" size={16} /> : <Pause size={16} />}
                    Stay on {ctx.stage?.name ?? 'this stage'} (pause)
                </button>
            </div>
        </div>
    );
}
