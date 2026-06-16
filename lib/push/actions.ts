'use server';

import { z } from 'zod';
import { getUser } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { ok, okVoid, err, type Result } from '@/lib/result';

// A browser PushSubscription, as produced by subscription.toJSON().
const SubscriptionSchema = z.object({
    endpoint: z.string().url(),
    keys: z.object({
        p256dh: z.string().min(1),
        auth: z.string().min(1),
    }),
});

/**
 * Store (or refresh) the current user's Web Push subscription. Called from the
 * client after the user grants notification permission. Writes as the
 * authenticated user, so the per-user RLS policy on push_subscriptions applies.
 */
export async function savePushSubscription(raw: unknown): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const parsed = SubscriptionSchema.safeParse(raw);
    if (!parsed.success) return err(parsed.error.issues[0].message);

    const supabase = await createServerClient();
    const { error } = await supabase.from('push_subscriptions').upsert(
        {
            user_id: user.id,
            endpoint: parsed.data.endpoint,
            p256dh: parsed.data.keys.p256dh,
            auth: parsed.data.keys.auth,
            last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'endpoint' }
    );

    if (error) return err(error.message);
    return okVoid();
}

/** Remove a subscription (e.g. when the user disables notifications). */
export async function deletePushSubscription(endpoint: string): Promise<Result<null>> {
    const user = await getUser();
    if (!user) return err('not authenticated');

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('endpoint', endpoint)
        .eq('user_id', user.id);

    if (error) return err(error.message);
    return okVoid();
}
