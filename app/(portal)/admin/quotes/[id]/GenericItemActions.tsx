'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { deleteQuoteItemAction } from '@/lib/quoter/actions';

/**
 * Remove a generic or service line from a draft quote.
 *
 * The panel_letters_v1 lines always had edit / duplicate / delete; generic
 * lines — which is every line the sign calculator creates — had nothing, so a
 * wrong line could only be fixed by deleting the whole quote. The question is
 * asked in place rather than with confirm(), which a browser can be told to
 * suppress (and then the button silently does nothing).
 */
export function GenericItemActions({ quoteId, itemId }: { quoteId: string; itemId: string }) {
    const router = useRouter();
    const [asking, setAsking] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const remove = async () => {
        setBusy(true);
        setError(null);
        const res = await deleteQuoteItemAction(quoteId, itemId);
        setBusy(false);
        if ('error' in res) {
            setError(res.error);
            setAsking(false);
            return;
        }
        router.refresh();
    };

    return (
        <div className="mt-1 flex items-center justify-end gap-1.5 text-xs">
            {error && <span className="text-red-600">{error}</span>}
            {asking ? (
                <>
                    <span className="text-neutral-600">Delete this line?</span>
                    <button
                        type="button"
                        disabled={busy}
                        onClick={remove}
                        className="rounded bg-red-600 px-2 py-0.5 font-semibold text-white disabled:opacity-50"
                    >
                        {busy ? 'Deleting…' : 'Delete'}
                    </button>
                    <button
                        type="button"
                        onClick={() => setAsking(false)}
                        className="rounded border border-neutral-200 px-2 py-0.5 font-semibold text-neutral-700"
                    >
                        Keep
                    </button>
                </>
            ) : (
                <button
                    type="button"
                    onClick={() => setAsking(true)}
                    aria-label="Delete line"
                    className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-neutral-500 hover:bg-red-50 hover:text-red-600"
                >
                    <Trash2 size={12} /> Delete
                </button>
            )}
        </div>
    );
}
