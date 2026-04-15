'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Shows a full-screen splash with the Onesign Odysseus logo on first load of a
 * browser session. Uses sessionStorage so it fires once per tab/session, not on
 * every client-side navigation. Fades out after a short delay.
 *
 * Suppressed on:
 *   - Print routes (would otherwise appear on every printed page)
 *   - Public token routes (approval, PoD) — those are external-user surfaces
 *   - Shop-floor tablets
 *   - During print media queries (belt-and-braces, in case someone prints
 *     from a non-print route while the splash is visible)
 */
export default function SplashScreen() {
    const pathname = usePathname();
    const [visible, setVisible] = useState(false);
    const [fading, setFading] = useState(false);

    // Routes that must never see the splash.
    const suppressed =
        pathname?.startsWith('/print/') ||
        pathname?.startsWith('/approve/') ||
        pathname?.startsWith('/delivery/') ||
        pathname?.startsWith('/shop-floor');

    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (suppressed) return;

        const seen = sessionStorage.getItem('odysseus-splash-seen');
        if (seen) return;

        setVisible(true);
        sessionStorage.setItem('odysseus-splash-seen', '1');

        const fadeTimer = setTimeout(() => setFading(true), 1200);
        const hideTimer = setTimeout(() => setVisible(false), 1800);

        return () => {
            clearTimeout(fadeTimer);
            clearTimeout(hideTimer);
        };
    }, [suppressed]);

    if (!visible || suppressed) return null;

    return (
        <div
            aria-hidden="true"
            className="odysseus-splash"
            style={{
                position: 'fixed',
                inset: 0,
                zIndex: 9999,
                background: '#ffffff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                opacity: fading ? 0 : 1,
                transition: 'opacity 600ms ease-out',
                pointerEvents: fading ? 'none' : 'auto',
            }}
        >
            <img
                src="/Odysseus-Logo-Black.svg"
                alt="Onesign Odysseus"
                style={{
                    height: '140px',
                    width: 'auto',
                    maxWidth: '70vw',
                    animation: 'odysseus-splash-in 700ms ease-out both',
                }}
            />
            <style>{`
                @keyframes odysseus-splash-in {
                    0% { opacity: 0; transform: scale(0.94); }
                    100% { opacity: 1; transform: scale(1); }
                }
                @media print {
                    .odysseus-splash {
                        display: none !important;
                    }
                }
            `}</style>
        </div>
    );
}
