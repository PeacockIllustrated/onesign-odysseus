// app/(portal)/admin/visualiser/page.tsx
import Link from 'next/link';
import { Ruler, LayoutGrid, Hammer, ImageUp, Sparkles, Lightbulb } from 'lucide-react';
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
                <div className="flex shrink-0 items-center gap-2 self-center">
                    {/* UX/UI "test overhaul" — a cinematic, guided concept
                        shell driving the same live engine. Additive; the tool
                        on this page is unchanged. */}
                    <Link
                        href="/admin/visualiser/preview"
                        title="Open the cinematic concept (UX/UI test overhaul)"
                        className="flex items-center gap-1.5 rounded-md border border-[#4e7e8c] bg-[#e8f0f3] px-3 py-1.5 text-xs font-semibold text-[#3a5f6a] hover:bg-[#d6e6eb]"
                    >
                        <Sparkles size={14} />
                        Concept
                    </Link>
                    <Link
                        href="/admin/visualiser/neon"
                        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                    >
                        <Ruler size={14} />
                        Neon length tool
                    </Link>
                    <Link
                        href="/admin/visualiser/returns"
                        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                    >
                        <Hammer size={14} />
                        Built-up returns
                    </Link>
                    <Link
                        href="/admin/visualiser/vectorise"
                        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                    >
                        <ImageUp size={14} />
                        Image → SVG
                    </Link>
                    <Link
                        href="/admin/visualiser/led-layout"
                        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                    >
                        <Lightbulb size={14} />
                        LED layout
                    </Link>
                    {/* The Studio hub — a portfolio of every in-house design &
                        fabrication tool (incl. the public customer studio). */}
                    <Link
                        href="/admin/tools"
                        title="Open the Studio — all design & fabrication tools"
                        className="flex items-center gap-1.5 rounded-md border border-neutral-300 px-3 py-1.5 text-xs font-medium text-neutral-700 hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a]"
                    >
                        <LayoutGrid size={14} />
                        Studio
                    </Link>
                </div>
            </header>
            <VisualiserClient
                initialDesigns={designs}
                prefill={prefill}
                initialLoadId={initialLoadId}
            />
        </div>
    );
}
