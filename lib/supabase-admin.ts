import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// =============================================================================
// ADMIN CLIENT (Service Role — BYPASSES RLS)
// =============================================================================
//
// DANGER. Any caller of `createAdminClient()` reads and writes without
// tenant scope. Callers MUST be gated by requireAdmin() or isSuperAdmin()
// before reaching this function. Use `createAdminClientForSuperAdmin()`
// below as the default — it builds the check into the one line that was
// going to exist anyway.

export function createAdminClient() {
    if (!env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error(
            'SUPABASE_SERVICE_ROLE_KEY is not defined — admin client unavailable'
        );
    }

    return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

/**
 * Super-admin-gated admin client. Asserts the caller is a super-admin
 * before handing out the service-role client. Returns a discriminated
 * result so callers can bail cleanly without redirecting.
 *
 * Prefer this over the raw `createAdminClient()` at every call site.
 */
export async function createAdminClientForSuperAdmin(): Promise<
    | { ok: true; supabase: ReturnType<typeof createAdminClient> }
    | { ok: false; error: string }
> {
    // Dynamic import — auth.ts depends on supabase-server, which must not be
    // eagerly imported from here (cyclical risk with some tooling).
    const { isSuperAdmin } = await import('./auth');
    const allowed = await isSuperAdmin();
    if (!allowed) {
        return { ok: false, error: 'not authorised' };
    }
    return { ok: true, supabase: createAdminClient() };
}
