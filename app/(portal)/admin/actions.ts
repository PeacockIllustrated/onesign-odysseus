'use server';

import { randomBytes } from 'crypto';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';

const CreatePortalUserSchema = z.object({
    email: z.string().email('A valid email is required'),
    orgName: z.string().min(1, 'Client name is required'),
});

/**
 * Creates a new user account with a secure random initial password.
 * Only accessible by super admins.
 *
 * Returns the id AND the generated password so the caller can relay the
 * credentials to the user (until invite-by-email is wired in Phase 1).
 * The password is NOT derived from the client name — that was guessable.
 */
export async function createPortalUser(
    email: string,
    orgName: string
): Promise<{ id: string; password: string }> {
    // 1. Ensure security
    await requireAdmin();

    const parsed = CreatePortalUserSchema.safeParse({ email, orgName });
    if (!parsed.success) {
        throw new Error(parsed.error.issues[0].message);
    }

    const supabaseAdmin = createAdminClient();
    // Secure random initial password — mixed case + digits + a symbol so it
    // satisfies common password policies, and not guessable from the org name.
    const password = `Os${randomBytes(12).toString('base64url')}!`;

    // 2. Create user via admin API
    const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
        email: parsed.data.email,
        password,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
            full_name: parsed.data.email.split('@')[0], // Default name
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

    // 3. Ensure profile exists (redundant if trigger exists, but safe).
    // createAdminClient uses the service role, so it bypasses RLS.
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

    return { id: user.id, password };
}
