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
        <div className="flex flex-col h-full">
            <div className="mb-4">
                <h1 className="text-xl font-bold text-neutral-900 tracking-tight">
                    Panel Visualiser
                </h1>
                <p className="text-sm text-neutral-500 mt-0.5">
                    Folded aluminium panels — 3D preview &amp; production-ready cut
                    files
                </p>
            </div>
            <VisualiserClient initialDesigns={designs} prefill={prefill} />
        </div>
    );
}
