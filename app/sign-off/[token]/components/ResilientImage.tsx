'use client';

import { useState, useCallback } from 'react';
import { RefreshCw, ImageOff } from 'lucide-react';

interface Props {
    src: string;
    alt: string;
    className?: string;
    style?: React.CSSProperties;
    onClick?: React.MouseEventHandler<HTMLElement>;
}

/**
 * Image wrapper with automatic retry on network failure + manual
 * retry button as fallback. Specifically targets transient CDN errors
 * like ERR_QUIC_PROTOCOL_ERROR which happen when the QUIC (HTTP/3)
 * connection to Supabase's storage CDN drops.
 *
 * Behaviour:
 * 1. First load attempt → normal <img>
 * 2. If onError fires → auto-retry once with a cache-bust param
 * 3. If second attempt fails → show "tap to retry" fallback
 */
export function ResilientImage({ src, alt, className, style, onClick }: Props) {
    const [attempt, setAttempt] = useState(0);
    const [failed, setFailed] = useState(false);

    // Append a cache-busting param so the browser opens a fresh
    // connection instead of reusing the broken QUIC session.
    const effectiveSrc = attempt === 0
        ? src
        : `${src}${src.includes('?') ? '&' : '?'}_retry=${attempt}`;

    const handleError = useCallback(() => {
        if (attempt < 2) {
            // Auto-retry once.
            setAttempt((a) => a + 1);
        } else {
            setFailed(true);
        }
    }, [attempt]);

    const retry = useCallback(() => {
        setFailed(false);
        setAttempt((a) => a + 1);
    }, []);

    if (failed) {
        return (
            <button
                type="button"
                onClick={(e) => { e.stopPropagation(); retry(); }}
                className={className}
                style={{
                    ...style,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                    background: '#f5f5f5',
                    border: '2px dashed #ccc',
                    borderRadius: 8,
                    cursor: 'pointer',
                    color: '#888',
                }}
                aria-label="Retry loading image"
            >
                <ImageOff size={24} />
                <span style={{ fontSize: 12, fontWeight: 600 }}>Image failed to load</span>
                <span style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 4, color: '#4e7e8c' }}>
                    <RefreshCw size={12} /> tap to retry
                </span>
            </button>
        );
    }

    return (
        <img
            src={effectiveSrc}
            alt={alt}
            className={className}
            style={style}
            onClick={onClick}
            onError={handleError}
        />
    );
}
