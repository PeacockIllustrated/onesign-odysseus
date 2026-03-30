'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Loader2 } from 'lucide-react';
import { duplicateQuoteAction } from '@/lib/quoter/actions';

interface DuplicateQuoteButtonProps {
    quoteId: string;
}

export function DuplicateQuoteButton({ quoteId }: DuplicateQuoteButtonProps) {
    const router = useRouter();
    const [isLoading, setIsLoading] = useState(false);

    const handleDuplicate = async () => {
        if (!confirm('Create a copy of this quote with all line items?')) return;

        setIsLoading(true);
        try {
            const result = await duplicateQuoteAction(quoteId);

            if ('error' in result) {
                alert(result.error);
                return;
            }

            router.push(`/app/admin/quotes/${result.id}`);
        } catch (err) {
            alert(err instanceof Error ? err.message : 'Failed to duplicate');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <button
            onClick={handleDuplicate}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-neutral-600 bg-neutral-100 hover:bg-neutral-200 rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
        >
            {isLoading ? (
                <Loader2 size={14} className="animate-spin" />
            ) : (
                <Copy size={14} />
            )}
            Duplicate
        </button>
    );
}
