import { createServerClient } from '@/lib/supabase-server';
import type {
    Contact,
    OrgSite,
    ClientWithDetails,
    ClientSummary,
    OrgExtended,
} from './types';

export async function getClients(filters?: {
    search?: string;
    tag?: string;
}): Promise<ClientSummary[]> {
    const supabase = await createServerClient();

    let query = supabase
        .from('orgs')
        .select('*')
        .order('name', { ascending: true });

    if (filters?.search) {
        const safe = filters.search.replace(/[,()]/g, '').trim();
        if (safe) {
            query = query.ilike('name', `%${safe}%`);
        }
    }

    if (filters?.tag) {
        query = query.contains('tags', [filters.tag]);
    }

    const { data: orgs, error } = await query;
    if (error) {
        console.error('Error fetching clients:', error);
        return [];
    }

    if (!orgs || orgs.length === 0) return [];

    const orgIds = orgs.map((o: any) => o.id);

    // Batch-fetch contacts and sites counts + primary contact
    const [contactsResult, sitesResult, primaryContactsResult] = await Promise.all([
        supabase
            .from('contacts')
            .select('org_id')
            .in('org_id', orgIds),
        supabase
            .from('org_sites')
            .select('org_id')
            .in('org_id', orgIds),
        supabase
            .from('contacts')
            .select('org_id, first_name, last_name')
            .in('org_id', orgIds)
            .eq('is_primary', true),
    ]);

    // Build count maps
    const contactCountMap: Record<string, number> = {};
    for (const c of contactsResult.data || []) {
        contactCountMap[c.org_id] = (contactCountMap[c.org_id] || 0) + 1;
    }

    const siteCountMap: Record<string, number> = {};
    for (const s of sitesResult.data || []) {
        siteCountMap[s.org_id] = (siteCountMap[s.org_id] || 0) + 1;
    }

    const primaryContactMap: Record<string, string> = {};
    for (const pc of primaryContactsResult.data || []) {
        primaryContactMap[pc.org_id] = `${pc.first_name} ${pc.last_name}`;
    }

    return orgs.map((org: any): ClientSummary => ({
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo_url: org.logo_url ?? null,
        phone: org.phone ?? null,
        email: org.email ?? null,
        website: org.website ?? null,
        business_type: org.business_type ?? null,
        account_number: org.account_number ?? null,
        company_reg_number: org.company_reg_number ?? null,
        vat_number: org.vat_number ?? null,
        tax_code: org.tax_code ?? 'T1',
        currency: org.currency ?? 'GBP',
        payment_terms_days: org.payment_terms_days ?? 30,
        sales_discount_percent: org.sales_discount_percent ?? 0,
        notes: org.notes ?? null,
        tags: org.tags ?? [],
        created_at: org.created_at,
        updated_at: org.updated_at ?? null,
        contact_count: contactCountMap[org.id] || 0,
        site_count: siteCountMap[org.id] || 0,
        primary_contact_name: primaryContactMap[org.id] ?? null,
    }));
}

export async function getClientWithDetails(orgId: string): Promise<ClientWithDetails | null> {
    const supabase = await createServerClient();

    const [orgResult, contactsResult, sitesResult] = await Promise.all([
        supabase
            .from('orgs')
            .select('*')
            .eq('id', orgId)
            .single(),
        supabase
            .from('contacts')
            .select('*')
            .eq('org_id', orgId)
            .order('is_primary', { ascending: false })
            .order('last_name', { ascending: true }),
        supabase
            .from('org_sites')
            .select('*')
            .eq('org_id', orgId)
            .order('is_primary', { ascending: false })
            .order('name', { ascending: true }),
    ]);

    if (orgResult.error || !orgResult.data) return null;

    const org = orgResult.data as any;

    return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        logo_url: org.logo_url ?? null,
        phone: org.phone ?? null,
        email: org.email ?? null,
        website: org.website ?? null,
        business_type: org.business_type ?? null,
        account_number: org.account_number ?? null,
        company_reg_number: org.company_reg_number ?? null,
        vat_number: org.vat_number ?? null,
        tax_code: org.tax_code ?? 'T1',
        currency: org.currency ?? 'GBP',
        payment_terms_days: org.payment_terms_days ?? 30,
        sales_discount_percent: org.sales_discount_percent ?? 0,
        notes: org.notes ?? null,
        tags: org.tags ?? [],
        created_at: org.created_at,
        updated_at: org.updated_at ?? null,
        contacts: (contactsResult.data || []) as Contact[],
        sites: (sitesResult.data || []) as OrgSite[],
    };
}

export async function getContactsForOrg(orgId: string): Promise<Contact[]> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('contacts')
        .select('*')
        .eq('org_id', orgId)
        .order('is_primary', { ascending: false })
        .order('last_name', { ascending: true });

    if (error) {
        console.error('Error fetching contacts:', error);
        return [];
    }
    return (data || []) as Contact[];
}

export async function getSitesForOrg(orgId: string): Promise<OrgSite[]> {
    const supabase = await createServerClient();

    const { data, error } = await supabase
        .from('org_sites')
        .select('*')
        .eq('org_id', orgId)
        .order('is_primary', { ascending: false })
        .order('name', { ascending: true });

    if (error) {
        console.error('Error fetching sites:', error);
        return [];
    }
    return (data || []) as OrgSite[];
}
