// app/(portal)/admin/visualiser/page.tsx
import Link from 'next/link';
import { Ruler } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { listDesigns, prefillFromQuoteItem } from '@/lib/visualiser/actions';
import { VisualiserClient } from './VisualiserClient';

export const metadata = { title: 'Panel Visualiser · Onesign Odysseus' };

export default async function VisualiserPage({
    searchParams,
}: {
    searchParams: Promise<{ quoteItemId?: string; id?: string }>;
}) {
    await requireAdmin();

    const { quoteItemId, id } = await searchParams;

    const designsRes = await listDesigns();
    const designs = designsRes.ok ? designsRes.data : [];

    let prefill = null;
    if (quoteItemId) {
        const res = await prefillFromQuoteItem(quoteItemId);
        if (res.ok) {
            prefill = { patch: res.data, quoteItemId };
        }
    }

    // QR codes on every exported PDF point back here with ?id=<design>.
    // Surface the id so the client auto-loads it on mount; falls through
    // silently if the id is unknown (e.g. design was deleted).
    const initialLoadId = id && designs.some((d) => d.id === id) ? id : null;

    return (
        // Pin the whole tool to the viewport so the visualiser stays on
        // screen — only the inner panels scroll. Calc offsets the topbar
        // (h-16) + main padding so we don't overlap or get a page scroll.
        // The min-height applies on desktop only; on phones / landscape
        // mobile the available height is honoured directly.
        <div className="flex flex-col gap-2 md:gap-3 h-[calc(100dvh-7rem)] md:min-h-[560px] overflow-hidden">
            <header className="shrink-0 flex items-baseline justify-between gap-4">
                <div>
                    <h1 className="text-base md:text-lg font-bold tracking-tight text-neutral-900">
                        Panel Visualiser
                    </h1>
                    <p className="hidden sm:block text-xs text-neutral-500">
                        Folded aluminium — 3D preview, unfold &amp;
                        production-ready cut files
                    </p>
                </div>
                <Link
                    href="/admin/visualiser/neon"
                    className="flex shrink-0 items-center gap-1.5 self-center rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                >
                    <Ruler size={14} />
                    Neon length tool
                </Link>
            </header>
            <VisualiserClient
                initialDesigns={designs}
                prefill={prefill}
                initialLoadId={initialLoadId}
            />
        </div>
    );
}
