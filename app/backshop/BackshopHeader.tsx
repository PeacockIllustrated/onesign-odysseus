'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';

const ACCENT = '#4e7e8c';

// Poll fallback: the board also subscribes to Supabase Realtime, but a TV left
// on for days can quietly lose its socket. A periodic full refresh guarantees
// the board catches up even if realtime drops — "semi-realtime" without relying
// on it. 10 minutes is frequent enough for a production board, light on load.
const AUTO_REFRESH_MS = 10 * 60 * 1000;

/**
 * Top bar for the workshop TV board — brand + title + a live clock, a manual
 * Refresh button (so a TV browser user can force a reload without a keyboard),
 * and a 10-minute auto-refresh. Client-only clock (rendered after mount to
 * avoid a hydration mismatch).
 */
export function BackshopHeader() {
    const router = useRouter();
    const [now, setNow] = useState<Date | null>(null);
    const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
    const [isRefreshing, startRefresh] = useTransition();

    const refresh = () => {
        startRefresh(() => router.refresh());
        setLastRefreshed(new Date());
    };

    useEffect(() => {
        // Set the first value in a deferred callback (not synchronously in the
        // effect body) so we don't cascade-render, and avoid a server/client
        // hydration mismatch on the time.
        let clock: ReturnType<typeof setInterval> | undefined;
        const raf = requestAnimationFrame(() => {
            setNow(new Date());
            setLastRefreshed(new Date());
            clock = setInterval(() => setNow(new Date()), 1000 * 30);
        });
        // Periodic auto-refresh of the server data (poll fallback).
        const auto = setInterval(() => {
            startRefresh(() => router.refresh());
            setLastRefreshed(new Date());
        }, AUTO_REFRESH_MS);
        return () => {
            cancelAnimationFrame(raf);
            if (clock) clearInterval(clock);
            clearInterval(auto);
        };
    }, [router]);

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

            <div className="flex items-center gap-5">
                {/* Manual refresh — big touch target for a wall-mounted TV
                    browser with no keyboard. Shows when the board last
                    refreshed (manual, auto, or realtime-driven). */}
                <button
                    type="button"
                    onClick={refresh}
                    disabled={isRefreshing}
                    aria-busy={isRefreshing}
                    title="Refresh the board now (auto-refreshes every 10 minutes)"
                    className="flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-[#4e7e8c] hover:bg-[#e8f0f3] hover:text-[#3a5f6a] disabled:opacity-60"
                >
                    <RefreshCw
                        size={16}
                        aria-hidden
                        className={isRefreshing ? 'animate-spin' : ''}
                    />
                    Refresh
                    {lastRefreshed && (
                        <span className="hidden text-[11px] tabular-nums text-neutral-400 sm:inline">
                            ·{' '}
                            {lastRefreshed.toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                            })}
                        </span>
                    )}
                </button>

                <div className="text-right tabular-nums">
                    <div className="text-2xl font-semibold text-neutral-900">
                        {now
                            ? now.toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                              })
                            : ' '}
                    </div>
                    <div className="text-[11px] uppercase tracking-widest text-neutral-400">
                        {now
                            ? now.toLocaleDateString([], {
                                  weekday: 'long',
                                  day: 'numeric',
                                  month: 'short',
                              })
                            : ' '}
                    </div>
                </div>
            </div>
        </header>
    );
}
