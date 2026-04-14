import 'server-only';
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

// =============================================================================
// SERVER CLIENT (for server components, actions, route handlers)
// =============================================================================

export async function createServerClient(): Promise<SupabaseClient> {
    const cookieStore = await cookies();

    return createSupabaseServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
        cookies: {
            getAll() {
                return cookieStore.getAll();
            },
            setAll(cookiesToSet) {
                try {
                    cookiesToSet.forEach(({ name, value, options }) => {
                        cookieStore.set(name, value, options);
                    });
                } catch {
                    // Server component - can't set cookies
                }
            },
        },
    });
}
