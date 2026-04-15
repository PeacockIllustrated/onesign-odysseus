'use client';

/**
 * Root error boundary — last line of defence. Catches any unhandled error
 * bubbling out of a route segment that doesn't have its own boundary.
 * Next.js requires this to be a client component.
 */

import { useEffect } from 'react';

export default function RootError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        // Surface to server logs (Vercel captures these). Replace with
        // Sentry.captureException(error) once Sentry is wired.
        console.error('[root-error-boundary]', error);
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
                        An unexpected error occurred. Please try again, and contact
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
                        <a
                            href="/"
                            style={{
                                padding: '8px 16px',
                                background: 'white',
                                color: '#333',
                                border: '1px solid #e5e5e5',
                                borderRadius: 4,
                                fontSize: 14,
                                textDecoration: 'none',
                            }}
                        >
                            Go home
                        </a>
                    </div>
                </div>
            </body>
        </html>
    );
}
