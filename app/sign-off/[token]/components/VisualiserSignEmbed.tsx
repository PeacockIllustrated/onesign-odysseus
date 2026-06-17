'use client';

import dynamic from 'next/dynamic';
import type { PanelParams } from '@/lib/visualiser/types';

/**
 * The visualiser sign on the approval pack — the SAME load-on-click workflow as
 * the Spline embed (a light poster; mount the heavy 3D only when the client
 * opts in, and only one live scene at a time via `active`). Unlike Spline this
 * renders the customer's ACTUAL sign from the linked visualiser design, so the
 * thing they approve is the thing they'll get.
 */
const VisualiserSignViewer = dynamic(() => import('./VisualiserSignViewer'), {
    ssr: false,
    loading: () => <ViewerSpinner />,
});

function ViewerSpinner() {
    return (
        <div
            style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                pointerEvents: 'none',
            }}
        >
            <span
                className="animate-spin"
                style={{
                    width: '34px',
                    height: '34px',
                    borderRadius: '999px',
                    border: '3px solid var(--hairline)',
                    borderTopColor: 'var(--accent)',
                }}
            />
            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>
                loading your sign…
            </span>
        </div>
    );
}

export function VisualiserSignEmbed({
    params,
    svgSource,
    height = 460,
    active,
    onActivate,
    night = false,
    label = 'your sign in 3D',
}: {
    params: PanelParams;
    svgSource: string | null;
    height?: number;
    active: boolean;
    onActivate: () => void;
    night?: boolean;
    label?: string;
}) {
    if (!active) {
        return (
            <button
                type="button"
                onClick={onActivate}
                style={{
                    width: '100%',
                    height,
                    background: 'var(--imgBg)',
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                    color: 'var(--text)',
                    fontFamily: 'inherit',
                }}
            >
                <span
                    style={{
                        width: '54px',
                        height: '54px',
                        borderRadius: '999px',
                        background: 'var(--accentSolid)',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 30px -6px var(--accent)',
                    }}
                >
                    <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                    >
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                </span>
                <span
                    style={{
                        fontSize: '13px',
                        fontWeight: 700,
                        letterSpacing: '0.02em',
                    }}
                >
                    Load {label}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>
                    tap to view in 3D · drag to orbit
                </span>
            </button>
        );
    }

    return (
        <div
            style={{
                position: 'relative',
                width: '100%',
                height,
                background: 'var(--imgBg)',
            }}
        >
            <VisualiserSignViewer
                params={params}
                svgSource={svgSource}
                night={night}
            />
        </div>
    );
}
