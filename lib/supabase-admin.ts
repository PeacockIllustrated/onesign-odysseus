import 'server-only';
import { createClient } from '@supabase/supabase-js';

// =============================================================================
// ADMIN CLIENT (Service Role - BYPASSES RLS)
// =============================================================================

export function createAdminClient() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseServiceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is not defined');
    }

    return createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
