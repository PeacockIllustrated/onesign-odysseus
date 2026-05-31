'use client';

import { useEffect, useState } from 'react';

const ACCENT = '#4e7e8c';

/**
 * Top bar for the workshop TV board — brand + title + a live clock.
 * Client-only clock (rendered after mount to avoid a hydration mismatch).
 */
export function BackshopHeader() {
    const [now, setNow] = useState<Date | null>(null);
    useEffect(() => {
        // Set the first value in a deferred callback (not synchronously in the
        // effect body) so we don't cascade-render, and avoid a server/client
        // hydration mismatch on the time.
        let interval: ReturnType<typeof setInterval> | undefined;
        const raf = requestAnimationFrame(() => {
            setNow(new Date());
            interval = setInterval(() => setNow(new Date()), 1000 * 30);
        });
        return () => {
            cancelAnimationFrame(raf);
            if (interval) clearInterval(interval);
        };
    }, []);

    return (
        <header className="flex items-center justify-between border-b border-neutral-200 bg-white px-8 py-4">
            <div className="flex items-center gap-3">
                <span
                    className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-black text-white"
                    style={{ background: ACCENT }}
                    aria-hidden
                >
                    1
                </span>
                <div className="leading-tight">
                    <div className="text-lg font-bold tracking-tight text-neutral-900">
                        Production board
                    </div>
                    <div className="text-[11px] uppercase tracking-widest text-neutral-400">
                        Onesign &amp; Digital
                    </div>
                </div>
            </div>
            <div className="text-right tabular-nums">
                <div className="text-2xl font-semibold text-neutral-900">
                    {now
                        ? now.toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                          })
                        : ' '}
                </div>
                <div className="text-[11px] uppercase tracking-widest text-neutral-400">
                    {now
                        ? now.toLocaleDateString([], {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'short',
                          })
                        : ' '}
                </div>
            </div>
        </header>
    );
}
