import { createBrowserClient as createSupabaseBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// BROWSER CLIENT (for client components)
// =============================================================================

export function createBrowserClient(): SupabaseClient {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    return createSupabaseBrowserClient(supabaseUrl, supabaseAnonKey);
}

// =============================================================================
// DATABASE TYPES
// =============================================================================

export type OrgRole = 'owner' | 'admin' | 'member';
export type DeliverableStatus = 'draft' | 'review' | 'approved' | 'scheduled' | 'done';
export type DeliverableCategory = 'creative' | 'campaign' | 'reporting' | 'support';
export type SubscriptionStatus = 'active' | 'paused' | 'cancelled';
export type AssetType = 'creative' | 'brand' | 'document' | 'other';

export interface Org {
    id: string;
    name: string;
    slug: string;
    logo_url?: string;
    created_at: string;
    updated_at?: string;
}

export interface OrgMember {
    id: string;
    org_id: string;
    user_id: string;
    role: OrgRole;
    created_at: string;
}

export interface Subscription {
    id: string;
    org_id: string;
    package_key: string;
    term_months: number;
    ad_spend_included?: number;
    status: SubscriptionStatus;
    start_date: string;
    end_date?: string;
    created_at: string;
}

export interface SubscriptionAccelerator {
    id: string;
    org_id: string;
    accelerator_key: string;
    status: SubscriptionStatus;
    start_date: string;
    created_at: string;
}

export interface Deliverable {
    id: string;
    org_id: string;
    month: string;
    title: string;
    description?: string;
    status: DeliverableStatus;
    category?: DeliverableCategory;
    template_key?: string;
    due_date?: string;
    created_by?: string;
    created_at: string;
    updated_at?: string;
}

export interface DeliverableUpdate {
    id: string;
    deliverable_id: string;
    comment?: string;
    status_change?: DeliverableStatus;
    created_by?: string;
    created_at: string;
}

export interface ClientAsset {
    id: string;
    org_id: string;
    type: AssetType;
    name: string;
    storage_path: string;
    file_size?: number;
    mime_type?: string;
    metadata: Record<string, unknown>;
    uploaded_by?: string;
    created_at: string;
}

export interface Report {
    id: string;
    org_id: string;
    month: string;
    title: string;
    storage_path?: string;
    summary: Record<string, unknown>;
    created_by?: string;
    created_at: string;
}

// =============================================================================
// LEGACY EXPORTS (for backwards compatibility with existing code)
// =============================================================================

export interface MarketingLead {
    id?: string;
    contact_name: string;
    contact_role?: string;
    contact_email: string;
    contact_phone?: string;
    company_name: string;
    company_website?: string;
    industry_type?: string;
    service_areas?: string[];
    avg_job_value?: string;
    capacity_per_week?: string;
    coverage_radius?: string;
    ideal_customer?: string;
    current_lead_sources?: string[];
    has_existing_ads?: boolean;
    has_existing_landing_page?: boolean;
    desired_start_date?: string;
    package_key?: string;
    accelerator_keys?: string[];
    notes?: string;
    status?: string;
    created_at?: string;
}

export type MarketingLeadInsert = Omit<MarketingLead, 'id' | 'created_at' | 'status'>;

export async function insertMarketingLead(lead: MarketingLeadInsert): Promise<MarketingLead> {
    const supabase = createBrowserClient();

    const { data, error } = await supabase
        .from('marketing_leads')
        .insert([lead])
        .select()
        .single();

    if (error) throw error;
    return data;
}
