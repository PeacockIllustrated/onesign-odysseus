'use client';

import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// R3F can't server-render — load the scene client-only (same pattern as the
// visualiser tools).
const StorefrontScene = dynamic(() => import('./StorefrontScene'), {
    ssr: false,
    loading: () => (
        <div className="flex h-full items-center justify-center text-sm text-neutral-500">
            <Loader2 size={18} className="mr-2 animate-spin" aria-hidden /> Loading 3D…
        </div>
    ),
});

export default function StorefrontClient() {
    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold text-neutral-800">Storefront Studio</h1>
                <p className="mt-1 max-w-2xl text-sm text-neutral-500">
                    A prospect&apos;s shopfront, reconstructed to scale from primitive blocks (no AI mesh).
                    Shown here is the default blue template — the fascia is left empty as the mount for a sign
                    added from the visualiser. Proportions come from a survey or a calibrated photo trace, so
                    the model is dimensionally true to the real unit.
                </p>
            </div>
            <div className="h-[68vh] w-full overflow-hidden rounded-xl border border-neutral-200 bg-[#e4f0f8]">
                <StorefrontScene />
            </div>
            <p className="text-xs text-neutral-400">
                Next: the trace-to-scale tool (anchor + element boxes → measured spec), the survey link, and
                &ldquo;Add from visualiser&rdquo; to drop a sign into the fascia mount at 1:1.
            </p>
        </div>
    );
}
