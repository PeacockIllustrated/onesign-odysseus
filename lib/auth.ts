import { redirect } from 'next/navigation';
import { createServerClient } from './supabase-server';
import type { Org, OrgMember } from './supabase';

// =============================================================================
// AUTH UTILITIES FOR SERVER COMPONENTS
// =============================================================================

/**
 * Get current authenticated user. Returns null if not authenticated.
 */
export async function getUser() {
    const supabase = await createServerClient();
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

/**
 * Require authentication. Redirects to login if not authenticated.
 */
export async function requireAuth() {
    const user = await getUser();
    if (!user) {
        redirect('/login');
    }
    return user;
}

/**
 * Get user's org membership and role.
 */
export async function getUserOrgMembership(userId: string): Promise<(OrgMember & { org: Org }) | null> {
    const supabase = await createServerClient();

    const { data } = await supabase
        .from('org_members')
        .select(`
            *,
            org:orgs(*)
        `)
        .eq('user_id', userId)
        .limit(1)
        .maybeSingle();

    return data as (OrgMember & { org: Org }) | null;
}

/**
 * Get user's current org context with membership info.
 * Requires auth - redirects if not authenticated.
 */
export async function getUserOrg(): Promise<{ org: Org; membership: OrgMember } | null> {
    const user = await requireAuth();
    const membership = await getUserOrgMembership(user.id);

    if (!membership) {
        return null;
    }

    return {
        org: membership.org,
        membership: {
            id: membership.id,
            org_id: membership.org_id,
            user_id: membership.user_id,
            role: membership.role,
            created_at: membership.created_at,
        },
    };
}

/**
 * Check if user is admin or owner of their org.
 * Used for org-level permissions (e.g., managing team members).
 */
export async function isOrgAdmin(): Promise<boolean> {
    const user = await getUser();
    if (!user) return false;

    const supabase = await createServerClient();
    const { data } = await supabase
        .from('org_members')
        .select('role')
        .eq('user_id', user.id)
        .single();

    return data?.role === 'owner' || data?.role === 'admin';
}

/**
 * Check if user is a super admin (OneSign staff).
 * Used for platform-level permissions (e.g., managing all orgs, generating deliverables).
 */
export async function isSuperAdmin(): Promise<boolean> {
    const user = await getUser();
    if (!user) return false;

    const supabase = await createServerClient();
    const { data } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

    return data?.role === 'super_admin';
}

/**
 * Require super admin access. Redirects to dashboard if not super admin.
 * Use this for OneSign admin pages that manage all orgs.
 */
export async function requireAdmin() {
    const superAdmin = await isSuperAdmin();
    if (!superAdmin) {
        redirect('/app/dashboard');
    }
}

/**
 * Get user's profile from the profiles table.
 */
export async function getUserProfile(userId: string) {
    const supabase = await createServerClient();

    const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

    return data;
}

// =============================================================================
// AUTH ACTIONS
// =============================================================================

/**
 * Sign out the current user.
 */
export async function signOut() {
    const supabase = await createServerClient();
    await supabase.auth.signOut();
    redirect('/login');
}
