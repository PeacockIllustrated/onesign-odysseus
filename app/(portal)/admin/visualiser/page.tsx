// app/(portal)/admin/visualiser/page.tsx
import { requireAdmin } from '@/lib/auth';
import { listDesigns, prefillFromQuoteItem } from '@/lib/visualiser/actions';
import { VisualiserClient } from './VisualiserClient';

export const metadata = { title: 'Panel Visualiser · Onesign Odysseus' };

export default async function VisualiserPage({
    searchParams,
}: {
    searchParams: Promise<{ quoteItemId?: string }>;
}) {
    await requireAdmin();

    const { quoteItemId } = await searchParams;

    const designsRes = await listDesigns();
    const designs = designsRes.ok ? designsRes.data : [];

    let prefill = null;
    if (quoteItemId) {
        const res = await prefillFromQuoteItem(quoteItemId);
        if (res.ok) {
            prefill = { patch: res.data, quoteItemId };
        }
    }

    return (
        // Pin the whole tool to the viewport so the visualiser stays on
        // screen — only the inner panels scroll. Calc offsets the topbar
        // (h-16) + main padding so we don't overlap or get a page scroll.
        // The min-height keeps it usable on short windows.
        <div className="flex flex-col gap-3 h-[calc(100dvh-7rem)] min-h-[560px] overflow-hidden">
            <header className="shrink-0 flex items-baseline justify-between gap-4">
                <div>
                    <h1 className="text-lg font-bold tracking-tight text-neutral-900">
                        Panel Visualiser
                    </h1>
                    <p className="text-xs text-neutral-500">
                        Folded aluminium — 3D preview, unfold &amp;
                        production-ready cut files
                    </p>
                </div>
            </header>
            <VisualiserClient initialDesigns={designs} prefill={prefill} />
        </div>
    );
}
