'use client';

/**
 * Portal-scoped error boundary. Rendered inside the portal layout, so the
 * sidebar/topbar stay visible while the erroring route shows a recovery UI.
 */

import { useEffect } from 'react';
import Link from 'next/link';
import { RefreshCw, Home } from 'lucide-react';

export default function PortalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[portal-error-boundary]', error);
    }, [error]);

    return (
        <div className="p-6 max-w-2xl mx-auto">
            <div className="border border-red-200 bg-red-50 rounded-[var(--radius-md)] p-6">
                <h1 className="text-base font-semibold text-red-900 mb-2">
                    This page hit an error.
                </h1>
                <p className="text-sm text-red-800 mb-4">
                    The rest of the app is still working. You can retry the page,
                    go back to the dashboard, or keep navigating in the sidebar.
                </p>
                {error.digest && (
                    <p className="text-xs text-red-700 mb-4 font-mono">
                        ref: {error.digest}
                    </p>
                )}
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={reset}
                        className="btn-primary inline-flex items-center gap-1.5"
                    >
                        <RefreshCw size={14} /> try again
                    </button>
                    <Link
                        href="/admin/jobs"
                        className="btn-secondary inline-flex items-center gap-1.5"
                    >
                        <Home size={14} /> back to job board
                    </Link>
                </div>
            </div>
            {process.env.NODE_ENV === 'development' && (
                <details className="mt-6 text-xs text-neutral-500">
                    <summary className="cursor-pointer">error detail (dev only)</summary>
                    <pre className="mt-2 p-3 bg-neutral-100 rounded overflow-x-auto">
                        {error.message}
                        {'\n\n'}
                        {error.stack}
                    </pre>
                </details>
            )}
        </div>
    );
}
