import 'server-only';
import webpush from 'web-push';
import { createAdminClient } from '@/lib/supabase-admin';

// Web Push sender. VAPID keys live in env; if they're absent the whole feature
// no-ops (so the app runs fine in environments without push configured).

let configured: boolean | null = null;

function ensureConfigured(): boolean {
    if (configured !== null) return configured;
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    const subject = process.env.VAPID_SUBJECT || 'mailto:hello@onesignanddigital.com';
    if (!publicKey || !privateKey) {
        configured = false;
        return false;
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);
    configured = true;
    return true;
}

export type PushPayload = {
    title: string;
    body?: string;
    url?: string;
    tag?: string;
};

/**
 * Fan a push out to every stored subscription. The notifications feed is a
 * single global "Needs Attention" stream (no per-user targeting), so every
 * opted-in staff device gets it. Dead subscriptions (404/410) are pruned.
 */
export async function sendPushToAll(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
    if (!ensureConfigured()) return { sent: 0, pruned: 0 };

    const supabase = createAdminClient();
    const { data: subs } = await supabase
        .from('push_subscriptions')
        .select('endpoint, p256dh, auth');

    if (!subs || subs.length === 0) return { sent: 0, pruned: 0 };

    const body = JSON.stringify(payload);
    let sent = 0;
    let pruned = 0;

    await Promise.all(
        subs.map(async (s) => {
            try {
                await webpush.sendNotification(
                    { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
                    body
                );
                sent += 1;
            } catch (e) {
                const status = (e as { statusCode?: number })?.statusCode;
                if (status === 404 || status === 410) {
                    await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
                    pruned += 1;
                }
            }
        })
    );

    return { sent, pruned };
}
