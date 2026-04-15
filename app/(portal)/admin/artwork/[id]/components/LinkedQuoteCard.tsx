'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Link2, Unlink, Loader2 } from 'lucide-react';
import {
    attachQuoteToVisualJob,
    detachQuoteFromVisualJob,
} from '@/lib/artwork/visual-approval-actions';

interface QuoteOption {
    id: string;
    quote_number: string;
    customer_name: string | null;
}

interface Props {
    artworkJobId: string;
    currentQuote: QuoteOption | null;
    availableQuotes: QuoteOption[];
}

export function LinkedQuoteCard({ artworkJobId, currentQuote, availableQuotes }: Props) {
    const router = useRouter();
    const [pending, startTransition] = useTransition();
    const [err, setErr] = useState<string | null>(null);
    const [pickedId, setPickedId] = useState('');

    const attach = () => {
        if (!pickedId) return;
        setErr(null);
        startTransition(async () => {
            const res = await attachQuoteToVisualJob(artworkJobId, pickedId);
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    const detach = () => {
        setErr(null);
        startTransition(async () => {
            const res = await detachQuoteFromVisualJob(artworkJobId);
            if ('error' in res) setErr(res.error);
            else router.refresh();
        });
    };

    return (
        <div className="rounded-lg border border-neutral-200 bg-white p-4 space-y-2">
            <h4 className="text-xs font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                <Link2 size={12} /> Linked quote
            </h4>

            {currentQuote ? (
                <div className="flex items-center justify-between gap-2">
                    <Link
                        href={`/admin/quotes/${currentQuote.id}`}
                        className="text-sm font-mono text-[#4e7e8c] hover:underline"
                    >
                        {currentQuote.quote_number}
                        {currentQuote.customer_name ? ` · ${currentQuote.customer_name}` : ''}
                    </Link>
                    <button
                        type="button"
                        onClick={detach}
                        disabled={pending}
                        className="text-xs text-red-700 hover:underline inline-flex items-center gap-1"
                    >
                        <Unlink size={10} /> unlink
                    </button>
                </div>
            ) : (
                <div className="space-y-2">
                    <select
                        value={pickedId}
                        onChange={(e) => setPickedId(e.target.value)}
                        className="w-full text-sm border border-neutral-300 rounded px-3 py-2"
                    >
                        <option value="">— pick a quote —</option>
                        {availableQuotes.map((q) => (
                            <option key={q.id} value={q.id}>
                                {q.quote_number}{q.customer_name ? ` · ${q.customer_name}` : ''}
                            </option>
                        ))}
                    </select>
                    <button
                        type="button"
                        onClick={attach}
                        disabled={pending || !pickedId}
                        className="btn-secondary w-full text-xs inline-flex items-center justify-center gap-1"
                    >
                        {pending && <Loader2 size={12} className="animate-spin" />}
                        link quote
                    </button>
                </div>
            )}

            {err && <p className="text-xs text-red-700">{err}</p>}
        </div>
    );
}
