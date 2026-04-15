'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import { createInvoiceFromQuote } from '@/lib/invoices/actions';

interface CreateInvoiceButtonProps {
    quoteId: string;
    orgId: string;
    existingInvoiceId: string | null;
    existingInvoiceNumber: string | null;
}

export function CreateInvoiceButton({ quoteId, orgId, existingInvoiceId, existingInvoiceNumber }: CreateInvoiceButtonProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    if (existingInvoiceId) {
        return (
            <a
                href={`/admin/invoices/${existingInvoiceId}`}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 hover:bg-green-100 rounded-[var(--radius-sm)] transition-colors"
            >
                <FileText size={14} />
                {existingInvoiceNumber}
            </a>
        );
    }

    return (
        <>
            <button
                onClick={() => {
                    setError(null);
                    startTransition(async () => {
                        const result = await createInvoiceFromQuote({ quote_id: quoteId, org_id: orgId });
                        if ('error' in result) {
                            setError(result.error);
                        } else {
                            router.push(`/admin/invoices/${result.id}`);
                        }
                    });
                }}
                disabled={isPending}
                className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#4e7e8c] bg-[#e8f0f3] hover:bg-[#d0e3e9] rounded-[var(--radius-sm)] transition-colors disabled:opacity-50"
            >
                <FileText size={14} />
                {isPending ? 'Creating\u2026' : 'Generate Invoice'}
            </button>
            {error && <span className="text-xs text-red-600">{error}</span>}
        </>
    );
}
