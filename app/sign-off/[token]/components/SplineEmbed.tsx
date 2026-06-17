'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Renders a Spline 3D scene from either kind of share URL:
 *
 *  - a `…/scene.splinecode` export URL → Spline's <spline-viewer> web
 *    component (the raw .splinecode file is binary; iframing it just dumps
 *    bytes as text, which is the bug this fixes), or
 *  - a public viewer page (e.g. https://my.spline.design/<slug>/) → an iframe.
 *
 * The viewer script is loaded lazily from the CDN only when a .splinecode URL
 * is actually shown, so the rest of the approval page stays light.
 */
const VIEWER_SRC = 'https://unpkg.com/@splinetool/viewer/build/spline-viewer.js';

function isCodeUrl(url: string): boolean {
    try {
        return new URL(url).pathname.toLowerCase().endsWith('.splinecode');
    } catch {
        return false;
    }
}

export function SplineEmbed({ url, height = 460 }: { url: string; height?: number }) {
    const code = isCodeUrl(url);
    const hostRef = useRef<HTMLDivElement>(null);
    const [ready, setReady] = useState(false);
    const [failed, setFailed] = useState(false);

    // Load the viewer custom element once (only for .splinecode URLs).
    useEffect(() => {
        if (!code) return;
        if (typeof window === 'undefined') return;
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
    }, [code]);

    // Mount the <spline-viewer> imperatively (avoids JSX typing for a custom
    // element) and keep its url/size in sync.
    useEffect(() => {
        if (!code || !ready || !hostRef.current) return;
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
    }, [code, ready, url, height]);

    if (!code) {
        return (
            <iframe
                src={url}
                title="3D preview"
                loading="lazy"
                allow="fullscreen; autoplay"
                style={{ width: '100%', height, border: 'none', display: 'block', background: 'var(--imgBg)' }}
            />
        );
    }

    return (
        <div style={{ position: 'relative', width: '100%', height, background: 'var(--imgBg)' }}>
            <div ref={hostRef} style={{ width: '100%', height }} />
            {!ready && (
                <div
                    style={{
                        position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '13px', color: 'var(--muted)',
                    }}
                >
                    {failed ? 'could not load the 3D preview' : 'loading 3D scene…'}
                </div>
            )}
        </div>
    );
}
