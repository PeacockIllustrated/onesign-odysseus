'use server';

import { createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser } from '@/lib/auth';
import { revalidatePath } from 'next/cache';
import {
    getClients,
    getClientWithDetails,
    getContactsForOrg,
    getSitesForOrg,
} from './queries';
import type {
    ClientSummary,
    ClientWithDetails,
    Contact,
    OrgSite,
    CreateContactInput,
    UpdateContactInput,
    CreateSiteInput,
    UpdateSiteInput,
    UpdateOrgDetailsInput,
} from './types';
import {
    CreateClientActionInputSchema,
    CreateContactInputSchema,
    UpdateContactInputSchema,
    CreateSiteInputSchema,
    UpdateSiteInputSchema,
    UpdateOrgDetailsInputSchema,
} from './types';

// ─────────────────────────────────────────────────────────────────────────────
// Thin wrappers for client components
// ─────────────────────────────────────────────────────────────────────────────

export async function getClientListAction(filters?: {
    search?: string;
    tag?: string;
}): Promise<ClientSummary[]> {
    return getClients(filters);
}

export async function getClientDetailAction(
    orgId: string
): Promise<ClientWithDetails | null> {
    return getClientWithDetails(orgId);
}

export async function getContactsForOrgAction(
    orgId: string
): Promise<Contact[]> {
    return getContactsForOrg(orgId);
}

export async function getSitesForOrgAction(
    orgId: string
): Promise<OrgSite[]> {
    return getSitesForOrg(orgId);
}

// ─────────────────────────────────────────────────────────────────────────────
// Create client (org + optional primary contact)
// ─────────────────────────────────────────────────────────────────────────────

export async function createClientAction(input: {
    name: string;
    primaryContact?: { first_name: string; last_name: string; email?: string; phone?: string; job_title?: string };
}): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = CreateClientActionInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const adminDb = createAdminClient();

    const slug = parsed.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const { data: org, error: orgError } = await adminDb
        .from('orgs')
        .insert({
            name: parsed.name,
            slug,
        })
        .select('id')
        .single();

    if (orgError || !org) {
        console.error('Error creating client org:', orgError);
        return { error: orgError?.message || 'Failed to create client' };
    }

    if (parsed.primaryContact) {
        const { error: contactError } = await adminDb.from('contacts').insert({
            org_id: org.id,
            first_name: parsed.primaryContact.first_name,
            last_name: parsed.primaryContact.last_name,
            email: parsed.primaryContact.email || null,
            phone: parsed.primaryContact.phone || null,
            job_title: parsed.primaryContact.job_title || null,
            contact_type: 'primary',
            is_primary: true,
        });

        if (contactError) {
            console.error('Error creating primary contact:', contactError);
            // Org was created successfully — don't rollback, just log
        }
    }

    revalidatePath('/admin/clients');
    return { id: org.id };
}

// ─────────────────────────────────────────────────────────────────────────────
// Org update
// ─────────────────────────────────────────────────────────────────────────────

export async function updateOrgDetailsAction(
    input: UpdateOrgDetailsInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = UpdateOrgDetailsInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = createAdminClient();

    const { id, ...fields } = parsed;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
    }

    if (Object.keys(updates).length === 0) {
        return { success: true };
    }

    const { error } = await supabase.from('orgs').update(updates).eq('id', id);

    if (error) {
        console.error('Error updating org details:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${id}`);
    revalidatePath('/admin/clients');
    return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Contact CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function createContactAction(
    input: CreateContactInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = CreateContactInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = createAdminClient();

    if (parsed.is_primary) {
        await supabase
            .from('contacts')
            .update({ is_primary: false })
            .eq('org_id', parsed.org_id)
            .eq('is_primary', true);
    }

    const { data, error } = await supabase
        .from('contacts')
        .insert({
            org_id: parsed.org_id,
            first_name: parsed.first_name,
            last_name: parsed.last_name,
            email: parsed.email || null,
            phone: parsed.phone || null,
            mobile: parsed.mobile || null,
            job_title: parsed.job_title || null,
            contact_type: parsed.contact_type || 'general',
            is_primary: parsed.is_primary || false,
            notes: parsed.notes || null,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating contact:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${parsed.org_id}`);
    revalidatePath('/admin/clients');
    return { id: data.id };
}

export async function updateContactAction(
    input: UpdateContactInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = UpdateContactInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = createAdminClient();

    const { data: existing, error: fetchError } = await supabase
        .from('contacts')
        .select('org_id')
        .eq('id', parsed.id)
        .single();

    if (fetchError || !existing) return { error: 'Contact not found' };

    if (parsed.is_primary) {
        await supabase
            .from('contacts')
            .update({ is_primary: false })
            .eq('org_id', existing.org_id)
            .eq('is_primary', true)
            .neq('id', parsed.id);
    }

    const { id, ...fields } = parsed;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase.from('contacts').update(updates).eq('id', id);

    if (error) {
        console.error('Error updating contact:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${existing.org_id}`);
    revalidatePath('/admin/clients');
    return { success: true };
}

export async function deleteContactAction(
    contactId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = createAdminClient();

    // Get org_id for revalidation before deleting
    const { data: existing } = await supabase
        .from('contacts')
        .select('org_id')
        .eq('id', contactId)
        .single();

    const { error } = await supabase
        .from('contacts')
        .delete()
        .eq('id', contactId);

    if (error) {
        console.error('Error deleting contact:', error);
        return { error: error.message };
    }

    if (existing) {
        revalidatePath(`/admin/clients/${existing.org_id}`);
    }
    revalidatePath('/admin/clients');
    return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Site CRUD
// ─────────────────────────────────────────────────────────────────────────────

export async function createSiteAction(
    input: CreateSiteInput
): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = CreateSiteInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = createAdminClient();

    if (parsed.is_primary) {
        await supabase
            .from('org_sites')
            .update({ is_primary: false })
            .eq('org_id', parsed.org_id)
            .eq('is_primary', true);
    }

    const { data, error } = await supabase
        .from('org_sites')
        .insert({
            org_id: parsed.org_id,
            name: parsed.name,
            address_line_1: parsed.address_line_1 || null,
            address_line_2: parsed.address_line_2 || null,
            city: parsed.city || null,
            county: parsed.county || null,
            postcode: parsed.postcode || null,
            country: parsed.country || 'GB',
            phone: parsed.phone || null,
            email: parsed.email || null,
            site_contact_id: parsed.site_contact_id || null,
            is_primary: parsed.is_primary || false,
            is_billing_address: parsed.is_billing_address || false,
            is_delivery_address: parsed.is_delivery_address || false,
            notes: parsed.notes || null,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating site:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${parsed.org_id}`);
    revalidatePath('/admin/clients');
    return { id: data.id };
}

export async function updateSiteAction(
    input: UpdateSiteInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const validation = UpdateSiteInputSchema.safeParse(input);
    if (!validation.success) {
        return { error: validation.error.issues[0].message };
    }
    const parsed = validation.data;

    const supabase = createAdminClient();

    const { data: existing, error: fetchError } = await supabase
        .from('org_sites')
        .select('org_id')
        .eq('id', parsed.id)
        .single();

    if (fetchError || !existing) return { error: 'Site not found' };

    if (parsed.is_primary) {
        await supabase
            .from('org_sites')
            .update({ is_primary: false })
            .eq('org_id', existing.org_id)
            .eq('is_primary', true)
            .neq('id', parsed.id);
    }

    const { id, ...fields } = parsed;
    const updates: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(fields)) {
        if (v !== undefined) updates[k] = v;
    }

    const { error } = await supabase.from('org_sites').update(updates).eq('id', id);

    if (error) {
        console.error('Error updating site:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${existing.org_id}`);
    revalidatePath('/admin/clients');
    return { success: true };
}

export async function deleteSiteAction(
    siteId: string
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = createAdminClient();

    // Get org_id for revalidation before deleting
    const { data: existing } = await supabase
        .from('org_sites')
        .select('org_id')
        .eq('id', siteId)
        .single();

    const { error } = await supabase
        .from('org_sites')
        .delete()
        .eq('id', siteId);

    if (error) {
        console.error('Error deleting site:', error);
        return { error: error.message };
    }

    if (existing) {
        revalidatePath(`/admin/clients/${existing.org_id}`);
    }
    revalidatePath('/admin/clients');
    return { success: true };
}

// ─────────────────────────────────────────────────────────────────────────────
// Interconnection helper
// ─────────────────────────────────────────────────────────────────────────────

export async function getOrgContactsAndSitesAction(
    orgId: string
): Promise<{ contacts: Contact[]; sites: OrgSite[] }> {
    const [contacts, sites] = await Promise.all([
        getContactsForOrg(orgId),
        getSitesForOrg(orgId),
    ]);
    return { contacts, sites };
}
