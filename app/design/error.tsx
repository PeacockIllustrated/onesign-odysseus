'use client';

// app/design/error.tsx
//
// Customer-facing error boundary for the PUBLIC design studio. Without it, a
// runtime failure (WebGL unavailable on an old device, context loss under
// memory pressure, a bad SVG blowing up the importer) bubbles to the root
// boundary — staff-toned copy and a "Go home" link into the login flow. A
// prospect should instead get a warm recovery path that still captures the
// enquiry: try again, or email us directly.

import { useEffect } from 'react';
import { Mail, RotateCcw } from 'lucide-react';

const ACCENT = '#4e7e8c';

export default function DesignStudioError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[design-studio-error]', error);
    }, [error]);

    return (
        <div className="flex h-full items-center justify-center p-4">
            <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 text-center shadow-sm">
                <h1 className="text-lg font-bold tracking-tight text-neutral-900">
                    Sorry — the sign designer hit a snag.
                </h1>
                <p className="mx-auto mt-2 max-w-sm text-sm text-neutral-600">
                    This can happen on older devices or browsers that struggle
                    with 3D. Your design may not have been saved, but we&apos;d
                    still love to help with your sign.
                </p>
                <div className="mt-5 flex flex-col items-center justify-center gap-2 sm:flex-row">
                    <button
                        type="button"
                        onClick={reset}
                        className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg px-5 text-sm font-semibold text-white shadow-sm sm:w-auto"
                        style={{ background: ACCENT }}
                    >
                        <RotateCcw size={15} aria-hidden /> Try again
                    </button>
                    <a
                        href="mailto:hello@onesignanddigital.com?subject=Sign%20enquiry%20(design%20studio)"
                        className="flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-lg border border-neutral-300 px-5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 sm:w-auto"
                    >
                        <Mail size={15} aria-hidden /> Email us instead
                    </a>
                </div>
                <p className="mt-4 text-[11px] text-neutral-400">
                    Tell us roughly what you&apos;re after — size, wording,
                    where it&apos;s going — and we&apos;ll quote it the
                    old-fashioned way.
                    {error.digest ? ` (Ref ${error.digest})` : ''}
                </p>
            </div>
        </div>
    );
}
