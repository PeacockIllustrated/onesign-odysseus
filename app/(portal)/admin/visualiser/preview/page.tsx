// app/(portal)/admin/visualiser/preview/page.tsx
//
// A UX/UI "test overhaul" of the panel visualiser — a cinematic, guided
// concept shell styled after award-winning 3D product configurators. It runs
// the real engine (shared store + geometry + Scene3D), so it is a live
// prototype, not a mockup. The production tool at /admin/visualiser is
// untouched; this route is purely additive.
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { requireAdmin } from '@/lib/auth';
import { PreviewClient } from './PreviewClient';

export const metadata = { title: 'Visualiser concept · Onesign Odysseus' };

export default async function VisualiserPreviewPage() {
    await requireAdmin();

    return (
        <div className="flex flex-col gap-2 h-[calc(100dvh-6rem)]">
            <div className="shrink-0">
                <Link
                    href="/admin/visualiser"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-neutral-500 hover:text-[#3a5f6a]"
                >
                    <ArrowLeft size={13} />
                    Back to the full visualiser
                </Link>
            </div>
            <PreviewClient />
        </div>
    );
}
