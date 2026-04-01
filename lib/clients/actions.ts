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
    primaryContact?: { first_name: string; last_name: string; email?: string; phone?: string };
}): Promise<{ id: string } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    // Use admin client to bypass RLS for org creation (super-admin gated by getUser + requireAdmin in page)
    const adminDb = createAdminClient();

    // Auto-generate slug from name
    const slug = input.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');

    const { data: org, error: orgError } = await adminDb
        .from('orgs')
        .insert({
            name: input.name,
            slug,
        })
        .select('id')
        .single();

    if (orgError || !org) {
        console.error('Error creating client org:', orgError);
        return { error: orgError?.message || 'Failed to create client' };
    }

    // Optionally create the primary contact
    if (input.primaryContact) {
        const { error: contactError } = await adminDb.from('contacts').insert({
            org_id: org.id,
            first_name: input.primaryContact.first_name,
            last_name: input.primaryContact.last_name,
            email: input.primaryContact.email || null,
            phone: input.primaryContact.phone || null,
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

    const supabase = createAdminClient();

    // Only include fields that are not undefined
    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.email !== undefined) updates.email = input.email;
    if (input.website !== undefined) updates.website = input.website;
    if (input.business_type !== undefined) updates.business_type = input.business_type;
    if (input.account_number !== undefined) updates.account_number = input.account_number;
    if (input.company_reg_number !== undefined) updates.company_reg_number = input.company_reg_number;
    if (input.vat_number !== undefined) updates.vat_number = input.vat_number;
    if (input.tax_code !== undefined) updates.tax_code = input.tax_code;
    if (input.currency !== undefined) updates.currency = input.currency;
    if (input.payment_terms_days !== undefined) updates.payment_terms_days = input.payment_terms_days;
    if (input.sales_discount_percent !== undefined) updates.sales_discount_percent = input.sales_discount_percent;
    if (input.notes !== undefined) updates.notes = input.notes;
    if (input.tags !== undefined) updates.tags = input.tags;

    if (Object.keys(updates).length === 0) {
        return { success: true };
    }

    const { error } = await supabase
        .from('orgs')
        .update(updates)
        .eq('id', input.id);

    if (error) {
        console.error('Error updating org details:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${input.id}`);
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

    const supabase = createAdminClient();

    // If marking as primary, unset existing primary contact for this org
    if (input.is_primary) {
        await supabase
            .from('contacts')
            .update({ is_primary: false })
            .eq('org_id', input.org_id)
            .eq('is_primary', true);
    }

    const { data, error } = await supabase
        .from('contacts')
        .insert({
            org_id: input.org_id,
            first_name: input.first_name,
            last_name: input.last_name,
            email: input.email || null,
            phone: input.phone || null,
            mobile: input.mobile || null,
            job_title: input.job_title || null,
            contact_type: input.contact_type || 'general',
            is_primary: input.is_primary || false,
            notes: input.notes || null,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating contact:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${input.org_id}`);
    revalidatePath('/admin/clients');
    return { id: data.id };
}

export async function updateContactAction(
    input: UpdateContactInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = createAdminClient();

    // Get the contact's org_id for primary-flag handling and revalidation
    const { data: existing, error: fetchError } = await supabase
        .from('contacts')
        .select('org_id')
        .eq('id', input.id)
        .single();

    if (fetchError || !existing) return { error: 'Contact not found' };

    // If marking as primary, unset existing primary contact (excluding this one)
    if (input.is_primary) {
        await supabase
            .from('contacts')
            .update({ is_primary: false })
            .eq('org_id', existing.org_id)
            .eq('is_primary', true)
            .neq('id', input.id);
    }

    const updates: Record<string, unknown> = {};
    if (input.first_name !== undefined) updates.first_name = input.first_name;
    if (input.last_name !== undefined) updates.last_name = input.last_name;
    if (input.email !== undefined) updates.email = input.email;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.mobile !== undefined) updates.mobile = input.mobile;
    if (input.job_title !== undefined) updates.job_title = input.job_title;
    if (input.contact_type !== undefined) updates.contact_type = input.contact_type;
    if (input.is_primary !== undefined) updates.is_primary = input.is_primary;
    if (input.notes !== undefined) updates.notes = input.notes;

    const { error } = await supabase
        .from('contacts')
        .update(updates)
        .eq('id', input.id);

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

    const supabase = createAdminClient();

    // If marking as primary, unset existing primary site for this org
    if (input.is_primary) {
        await supabase
            .from('org_sites')
            .update({ is_primary: false })
            .eq('org_id', input.org_id)
            .eq('is_primary', true);
    }

    const { data, error } = await supabase
        .from('org_sites')
        .insert({
            org_id: input.org_id,
            name: input.name,
            address_line_1: input.address_line_1 || null,
            address_line_2: input.address_line_2 || null,
            city: input.city || null,
            county: input.county || null,
            postcode: input.postcode || null,
            country: input.country || 'GB',
            phone: input.phone || null,
            email: input.email || null,
            site_contact_id: input.site_contact_id || null,
            is_primary: input.is_primary || false,
            is_billing_address: input.is_billing_address || false,
            is_delivery_address: input.is_delivery_address || false,
            notes: input.notes || null,
        })
        .select('id')
        .single();

    if (error) {
        console.error('Error creating site:', error);
        return { error: error.message };
    }

    revalidatePath(`/admin/clients/${input.org_id}`);
    revalidatePath('/admin/clients');
    return { id: data.id };
}

export async function updateSiteAction(
    input: UpdateSiteInput
): Promise<{ success: boolean } | { error: string }> {
    const user = await getUser();
    if (!user) return { error: 'Not authenticated' };

    const supabase = createAdminClient();

    // Get the site's org_id for primary-flag handling and revalidation
    const { data: existing, error: fetchError } = await supabase
        .from('org_sites')
        .select('org_id')
        .eq('id', input.id)
        .single();

    if (fetchError || !existing) return { error: 'Site not found' };

    // If marking as primary, unset existing primary site (excluding this one)
    if (input.is_primary) {
        await supabase
            .from('org_sites')
            .update({ is_primary: false })
            .eq('org_id', existing.org_id)
            .eq('is_primary', true)
            .neq('id', input.id);
    }

    const updates: Record<string, unknown> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.address_line_1 !== undefined) updates.address_line_1 = input.address_line_1;
    if (input.address_line_2 !== undefined) updates.address_line_2 = input.address_line_2;
    if (input.city !== undefined) updates.city = input.city;
    if (input.county !== undefined) updates.county = input.county;
    if (input.postcode !== undefined) updates.postcode = input.postcode;
    if (input.country !== undefined) updates.country = input.country;
    if (input.phone !== undefined) updates.phone = input.phone;
    if (input.email !== undefined) updates.email = input.email;
    if (input.site_contact_id !== undefined) updates.site_contact_id = input.site_contact_id;
    if (input.is_primary !== undefined) updates.is_primary = input.is_primary;
    if (input.is_billing_address !== undefined) updates.is_billing_address = input.is_billing_address;
    if (input.is_delivery_address !== undefined) updates.is_delivery_address = input.is_delivery_address;
    if (input.notes !== undefined) updates.notes = input.notes;

    const { error } = await supabase
        .from('org_sites')
        .update(updates)
        .eq('id', input.id);

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
