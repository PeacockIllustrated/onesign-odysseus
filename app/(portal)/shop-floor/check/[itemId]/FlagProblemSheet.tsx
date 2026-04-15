'use client';

import { useState, useTransition } from 'react';
import { Loader2, X, AlertTriangle } from 'lucide-react';
import type { ShopFloorSubItem } from '@/lib/production/shop-floor-actions';
import { reportShopFloorProblem } from '@/lib/production/shop-floor-actions';

interface Props {
    subItem: ShopFloorSubItem;
    jobItemId: string;
    stageId: string | null;
    onClose: () => void;
    onSubmitted: () => void;
}

export function FlagProblemSheet({ subItem, jobItemId, stageId, onClose, onSubmitted }: Props) {
    const [notes, setNotes] = useState('');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const submit = () => {
        const trimmed = notes.trim();
        if (!trimmed) {
            setError('Please describe the problem in a sentence or two.');
            return;
        }
        setError(null);
        startTransition(async () => {
            const res = await reportShopFloorProblem({
                subItemId: subItem.id,
                jobItemId,
                stageId,
                notes: trimmed,
            });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            onSubmitted();
        });
    };

    return (
        <div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60" onClick={onClose}>
            <div
                className="w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-xl p-5 space-y-4"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between">
                    <h3 className="text-lg font-bold text-neutral-900 flex items-center gap-2">
                        <AlertTriangle size={18} className="text-red-600" />
                        Report a problem
                    </h3>
                    <button onClick={onClose} className="p-1 text-neutral-500 hover:text-neutral-900" aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <p className="text-xs text-neutral-500">
                    Flagging sub-item <strong>{subItem.label}{subItem.name ? ` · ${subItem.name}` : ''}</strong>.
                    The item will be paused and an admin will pick this up.
                </p>

                <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    maxLength={500}
                    placeholder="What's wrong? e.g. material is the wrong colour, dimensions don't match, artwork file missing…"
                    rows={5}
                    className="w-full p-3 rounded-lg border border-neutral-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#4e7e8c]"
                />
                <div className="text-[10px] text-neutral-400 text-right">{notes.length}/500</div>

                {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-800">
                        {error}
                    </div>
                )}

                <button
                    type="button"
                    onClick={submit}
                    disabled={pending}
                    className="w-full py-4 rounded-lg bg-red-600 hover:bg-red-700 text-white text-base font-bold flex items-center justify-center gap-2 disabled:opacity-60"
                >
                    {pending && <Loader2 className="animate-spin" size={16} />}
                    Flag & pause this item
                </button>
            </div>
        </div>
    );
}
