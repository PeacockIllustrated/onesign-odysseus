'use client';

import { useEffect } from 'react';

/**
 * Auto-open the browser print dialog when the pack is opened with `?print=1`
 * (the visualiser's "Pack PDF" button) so the user lands straight on Save-as-PDF
 * for the whole works pack. Waits for the embedded data-URI images to paint
 * first, with a fallback timeout, so nothing prints blank. No-op without the
 * flag, so the normal preview/print view is unaffected.
 */
export function AutoPrint() {
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!new URLSearchParams(window.location.search).has('print')) return;

        let done = false;
        const print = () => {
            if (done) return;
            done = true;
            window.print();
        };

        const pending = Array.from(document.images).filter((i) => !i.complete);
        const fallback = window.setTimeout(print, 3500);

        if (pending.length === 0) {
            const t = window.setTimeout(print, 400);
            return () => {
                window.clearTimeout(t);
                window.clearTimeout(fallback);
            };
        }

        let left = pending.length;
        const tick = () => {
            if (--left <= 0) window.setTimeout(print, 250);
        };
        pending.forEach((img) => {
            img.addEventListener('load', tick);
            img.addEventListener('error', tick);
        });
        return () => window.clearTimeout(fallback);
    }, []);

    return null;
}
