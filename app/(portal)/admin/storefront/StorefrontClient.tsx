'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Loader2 } from 'lucide-react';

// R3F + the interactive tools can't server-render — load client-only (same
// pattern as the visualiser tools).
const loading = () => (
    <div className="flex h-full items-center justify-center text-sm text-neutral-500">
        <Loader2 size={18} className="mr-2 animate-spin" aria-hidden /> Loading…
    </div>
);
const StorefrontScene = dynamic(() => import('./StorefrontScene'), { ssr: false, loading });
const StorefrontTraceTool = dynamic(() => import('./StorefrontTraceTool'), { ssr: false, loading });

type Mode = 'template' | 'trace';

export default function StorefrontClient() {
    const [mode, setMode] = useState<Mode>('template');

    return (
        <div className="space-y-4">
            <div>
                <h1 className="text-lg font-semibold text-neutral-800">Storefront Studio</h1>
                <p className="mt-1 max-w-2xl text-sm text-neutral-500">
                    Reconstruct a prospect&apos;s shopfront to scale from primitive blocks (no AI mesh). The
                    fascia is left empty as the mount for a sign added from the visualiser. Proportions come
                    from a survey or a calibrated photo trace, so the model is dimensionally true to the unit.
                </p>
            </div>

            <div className="inline-flex rounded-lg border border-neutral-200 bg-neutral-50 p-0.5 text-xs font-medium">
                {(['template', 'trace'] as Mode[]).map((m) => (
                    <button
                        key={m}
                        type="button"
                        onClick={() => setMode(m)}
                        className={`rounded-md px-3 py-1.5 transition ${
                            mode === m ? 'bg-[#4e7e8c] text-white' : 'text-neutral-600 hover:bg-neutral-100'
                        }`}
                    >
                        {m === 'template' ? '3D Template' : 'Trace from photo'}
                    </button>
                ))}
            </div>

            {mode === 'template' ? (
                <div className="h-[68vh] w-full overflow-hidden rounded-xl border border-neutral-200 bg-[#e4f0f8]">
                    <StorefrontScene />
                </div>
            ) : (
                <StorefrontTraceTool />
            )}

            <p className="text-xs text-neutral-400">
                Next: the survey link (auto-anchor from measured dimensions) and &ldquo;Add from
                visualiser&rdquo; to drop a sign into the fascia mount at 1:1.
            </p>
        </div>
    );
}
