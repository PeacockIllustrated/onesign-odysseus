'use server';

import { createServerClient } from '@/lib/supabase-server';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';

/**
 * Mark a persisted notification as dismissed. The RLS policy only permits
 * authenticated users to update rows, so this runs as the signed-in staff
 * member rather than as service role.
 */
export async function dismissNotification(
    id: string
): Promise<{ ok: true } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'not authenticated' };

    const supabase = await createServerClient();
    const { error } = await supabase
        .from('notifications')
        .update({ dismissed_at: new Date().toISOString(), dismissed_by: user.id })
        .eq('id', id)
        .is('dismissed_at', null);

    if (error) return { error: error.message };

    revalidatePath('/admin');
    return { ok: true };
}
