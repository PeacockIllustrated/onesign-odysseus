'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { createBrowserClient } from '@/lib/supabase';

export type RealtimeStatus = 'connecting' | 'live' | 'down';

interface Options {
    /** Channel name. Must be unique per board so two surfaces don't collide. */
    channel: string;
    /** Tables to watch for any change. */
    tables: string[];
    /** Called on every change once subscribed. */
    onChange: () => void;
    /** Skip the subscription entirely (e.g. while a modal holds a job open). */
    enabled?: boolean;
}

/**
 * Subscribe to Postgres changes and report the connection honestly.
 *
 * A wall-mounted board that silently stops updating is worse than the
 * whiteboard it replaced: it looks authoritative and is wrong. So a dropped or
 * errored socket surfaces as 'down' for the caller to shout about, and the
 * hook retries with backoff rather than sitting dead until someone reloads.
 */
export function useRealtimeStatus({
    channel,
    tables,
    onChange,
    enabled = true,
}: Options): RealtimeStatus {
    const [status, setStatus] = useState<RealtimeStatus>('connecting');

    // Keep the latest callback without making it a subscription dependency —
    // otherwise every parent render tears the channel down and rebuilds it.
    // Written in an effect rather than during render: the subscription only
    // ever reads it from an async callback, well after commit.
    const onChangeRef = useRef(onChange);
    useEffect(() => {
        onChangeRef.current = onChange;
    }, [onChange]);

    const tableKey = tables.join(',');
    const attemptRef = useRef(0);
    const [retryTick, setRetryTick] = useState(0);
    const retry = useCallback(() => {
        attemptRef.current += 1;
        // 2s, 4s, 8s … capped at 30s.
        const delay = Math.min(2000 * 2 ** (attemptRef.current - 1), 30000);
        const t = setTimeout(() => setRetryTick((n) => n + 1), delay);
        return () => clearTimeout(t);
    }, []);

    useEffect(() => {
        if (!enabled) return;

        const supabase = createBrowserClient();
        let cancelled = false;
        let cancelRetry: (() => void) | undefined;

        let ch: RealtimeChannel = supabase.channel(channel);
        for (const table of tableKey.split(',')) {
            ch = ch.on(
                'postgres_changes',
                { event: '*', schema: 'public', table },
                () => onChangeRef.current()
            );
        }

        ch.subscribe((state) => {
            if (cancelled) return;
            if (state === 'SUBSCRIBED') {
                attemptRef.current = 0;
                setStatus('live');
            } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
                setStatus('down');
                cancelRetry = retry();
            } else if (state === 'CLOSED') {
                // A close during teardown is normal; only a close we didn't ask
                // for should alarm anyone.
                if (!cancelled) {
                    setStatus('down');
                    cancelRetry = retry();
                }
            }
        });

        return () => {
            cancelled = true;
            cancelRetry?.();
            supabase.removeChannel(ch);
        };
    }, [channel, tableKey, enabled, retryTick, retry]);

    return enabled ? status : 'live';
}
