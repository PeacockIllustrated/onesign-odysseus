'use client';

import { useEffect, useState } from 'react';
import { savePushSubscription } from '@/lib/push/actions';

const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = atob(base64);
    const buffer = new ArrayBuffer(raw.length);
    const output = new Uint8Array(buffer);
    for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
    return output;
}

type State = 'init' | 'unsupported' | 'default' | 'granted' | 'denied' | 'working';

/**
 * Registers the service worker and offers a one-tap "Enable notifications"
 * pill. We never auto-prompt for permission (anti-pattern + iOS requires a
 * user gesture). Renders nothing once granted/denied or where push is
 * unsupported / unconfigured.
 */
export default function PushManager() {
    const [state, setState] = useState<State>('init');

    useEffect(() => {
        if (
            typeof window === 'undefined' ||
            !('serviceWorker' in navigator) ||
            !('PushManager' in window) ||
            !('Notification' in window) ||
            !VAPID_PUBLIC_KEY
        ) {
            setState('unsupported');
            return;
        }
        navigator.serviceWorker.register('/sw.js').catch(() => {});
        setState(Notification.permission as State);
    }, []);

    async function enable() {
        if (!VAPID_PUBLIC_KEY) return;
        setState('working');
        try {
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') {
                setState(permission as State);
                return;
            }
            const registration = await navigator.serviceWorker.ready;
            let subscription = await registration.pushManager.getSubscription();
            if (!subscription) {
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
                });
            }
            const json = subscription.toJSON();
            const res = await savePushSubscription({ endpoint: json.endpoint, keys: json.keys });
            setState(res.ok ? 'granted' : 'default');
        } catch {
            setState('default');
        }
    }

    if (state !== 'default' && state !== 'working') return null;

    return (
        <button
            type="button"
            onClick={enable}
            disabled={state === 'working'}
            className="fixed bottom-4 right-4 z-50 rounded-full bg-[#4e7e8c] px-4 py-2 text-sm font-medium text-white shadow-lg transition hover:bg-[#3a5f6a] disabled:opacity-70"
        >
            {state === 'working' ? 'Enabling…' : '🔔 Enable notifications'}
        </button>
    );
}
