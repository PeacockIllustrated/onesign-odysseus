'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders a Spline 3D scene, but only once the client opts in.
 *
 * Spline scenes are heavy, so we never auto-load: each slot shows a light
 * "Load 3D" poster and only mounts the viewer when clicked. Loading is
 * coordinated by the parent via `active` — only one scene is `active` at a
 * time, so opening a new one unmounts (unloads) whichever was open, keeping a
 * single live scene on the page.
 *
 * URL handling:
 *  - `…/scene.splinecode` (binary export) → Spline's <spline-viewer> web
 *    component (script lazy-loaded from the CDN on first use).
 *  - a public viewer page (my.spline.design/…) → an iframe.
 */
const VIEWER_SRC = 'https://unpkg.com/@splinetool/viewer/build/spline-viewer.js';

function isCodeUrl(url: string): boolean {
    try {
        return new URL(url).pathname.toLowerCase().endsWith('.splinecode');
    } catch {
        return false;
    }
}

export function SplineEmbed({
    url,
    height = 460,
    active,
    onActivate,
    label = 'interactive 3D preview',
}: {
    url: string;
    height?: number;
    active: boolean;
    onActivate: () => void;
    label?: string;
}) {
    const code = isCodeUrl(url);
    const hostRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    // Reset to the loading state whenever this slot is deactivated, so a later
    // re-open shows the spinner again rather than a blank frame.
    useEffect(() => {
        if (!active) {
            setReady(false);
            setFailed(false);
        }
    }, [active]);

    // Lazy-load the viewer custom element (only when an active .splinecode slot
    // needs it).
    useEffect(() => {
        if (!active || !code || typeof window === 'undefined') return;
        if (window.customElements?.get?.('spline-viewer')) {
            setReady(true);
            return;
        }
        const existing = document.querySelector<HTMLScriptElement>('script[data-spline-viewer]');
        const onLoad = () => setReady(true);
        const onError = () => setFailed(true);
        if (existing) {
            existing.addEventListener('load', onLoad);
            existing.addEventListener('error', onError);
            return () => {
                existing.removeEventListener('load', onLoad);
                existing.removeEventListener('error', onError);
            };
        }
        const s = document.createElement('script');
        s.type = 'module';
        s.src = VIEWER_SRC;
        s.setAttribute('data-spline-viewer', '');
        s.addEventListener('load', onLoad);
        s.addEventListener('error', onError);
        document.head.appendChild(s);
        return () => {
            s.removeEventListener('load', onLoad);
            s.removeEventListener('error', onError);
        };
    }, [active, code]);

    // Mount/unmount the <spline-viewer> element imperatively. Unmounting on
    // deactivate is what frees the previous scene.
    useEffect(() => {
        if (!active || !code || !ready || !hostRef.current) return;
        const host = hostRef.current;
        host.innerHTML = '';
        const el = document.createElement('spline-viewer');
        el.setAttribute('url', url);
        el.style.width = '100%';
        el.style.height = `${height}px`;
        el.style.display = 'block';
        host.appendChild(el);
        return () => {
            host.innerHTML = '';
        };
    }, [active, code, ready, url, height]);

    // Poster — not loaded yet.
    if (!active) {
        return (
            <button
                type="button"
                onClick={onActivate}
                style={{
                    width: '100%', height, background: 'var(--imgBg)', border: 'none', cursor: 'pointer',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                    gap: '10px', color: 'var(--text)', fontFamily: 'inherit',
                }}
            >
                <span
                    style={{
                        width: '54px', height: '54px', borderRadius: '999px', background: 'var(--accentSolid)',
                        color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        boxShadow: '0 0 30px -6px var(--accent)',
                    }}
                >
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                        <line x1="12" y1="22.08" x2="12" y2="12" />
                    </svg>
                </span>
                <span style={{ fontSize: '13px', fontWeight: 700, letterSpacing: '0.02em' }}>Load {label}</span>
                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>tap to view in 3D · drag to orbit</span>
            </button>
        );
    }

    // Active — load the scene, with a spinner until it's up.
    return (
        <div style={{ position: 'relative', width: '100%', height, background: 'var(--imgBg)' }}>
            {code ? (
                <div ref={hostRef} style={{ width: '100%', height }} />
            ) : (
                <iframe
                    src={url}
                    title="3D preview"
                    loading="lazy"
                    allow="fullscreen; autoplay"
                    onLoad={() => setReady(true)}
                    style={{ width: '100%', height, border: 'none', display: 'block', background: 'var(--imgBg)' }}
                />
            )}
            {!ready && (
                <div
                    style={{
                        position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                        alignItems: 'center', justifyContent: 'center', gap: '10px', pointerEvents: 'none',
                    }}
                >
                    {failed ? (
                        <span style={{ fontSize: '13px', color: 'var(--muted)' }}>could not load the 3D scene</span>
                    ) : (
                        <>
                            <span
                                className="animate-spin"
                                style={{ width: '34px', height: '34px', borderRadius: '999px', border: '3px solid var(--hairline)', borderTopColor: 'var(--accent)' }}
                            />
                            <span style={{ fontSize: '12px', color: 'var(--muted)' }}>loading 3D scene…</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
