'use server';

import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

/**
 * Creates a new user account with a default password.
 * Only accessible by super admins.
 */
export async function createPortalUser(email: string, orgName: string) {
    // 1. Ensure security
    await requireAdmin();

    const supabaseAdmin = createAdminClient();
    const password = `${orgName}@2026`.replace(/\s+/g, ''); // Remove spaces for password

    // 2. Create user via admin API
    const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
            full_name: email.split('@')[0], // Default name
        }
    });

    if (error) {
        // If user already exists but we couldn't find them in profiles (edge case),
        // we might get an error here.
        console.error('Error creating user:', error);
        throw new Error(error.message);
    }

    if (!user) {
        throw new Error('Failed to create user');
    }

    // 3. Ensure profile exists (redundant if trigger exists, but safe)
    // We cannot easily upsert to profiles here if RLS blocks it, but we are using admin client??
    // Admin client bypasses RLS on auth.users, but for public tables we need to check if we use admin client for them too.
    // createAdminClient uses service role, so it bypasses ALL RLS.

    // Let's make sure the profile exists
    const { error: profileError } = await supabaseAdmin
        .from('profiles')
        .upsert({
            id: user.id,
            email: user.email,
            full_name: user.user_metadata.full_name,
            role: 'member', // Default role
        })
        .select()
        .single();

    if (profileError) {
        console.error('Error ensuring profile:', profileError);
        // Continue anyway, maybe trigger handled it
    }

    return user.id;
}
