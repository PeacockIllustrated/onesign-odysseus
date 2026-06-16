'use client';

/**
 * Global error boundary — catches errors thrown in the ROOT layout/template
 * itself, which the per-segment app/error.tsx cannot reach (it renders inside
 * the root layout). This one must therefore render its own <html>/<body>.
 * Next.js requires it to be a client component.
 */

import { useEffect } from 'react';

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Surface to server logs (Vercel captures these). Replace with
        // Sentry.captureException(error) once Sentry is wired.
        console.error('[global-error-boundary]', error);
    }, [error]);

    return (
        <html lang="en">
            <body
                style={{
                    minHeight: '100vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontFamily: 'system-ui, sans-serif',
                    background: '#f5f5f5',
                    margin: 0,
                }}
            >
                <div
                    style={{
                        maxWidth: 480,
                        padding: '32px',
                        background: 'white',
                        borderRadius: 8,
                        border: '1px solid #e5e5e5',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                >
                    <h1 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600 }}>
                        Something went wrong.
                    </h1>
                    <p style={{ margin: '0 0 16px', fontSize: 14, color: '#666' }}>
                        A critical error occurred. Please reload the page, and contact
                        support if the problem persists.
                    </p>
                    {error.digest && (
                        <p style={{ margin: '0 0 16px', fontSize: 12, color: '#999' }}>
                            Reference: <code>{error.digest}</code>
                        </p>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button
                            onClick={reset}
                            style={{
                                padding: '8px 16px',
                                background: '#4e7e8c',
                                color: 'white',
                                border: 'none',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 14,
                            }}
                        >
                            Try again
                        </button>
                        <button
                            onClick={() => { window.location.href = '/'; }}
                            style={{
                                padding: '8px 16px',
                                background: 'white',
                                color: '#333',
                                border: '1px solid #e5e5e5',
                                borderRadius: 4,
                                cursor: 'pointer',
                                fontSize: 14,
                            }}
                        >
                            Go home
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
