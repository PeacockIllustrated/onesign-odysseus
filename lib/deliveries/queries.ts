import { createAdminClient } from '@/lib/supabase-admin';
import type { Delivery, DeliveryItem, DeliveryWithItems } from './types';

export async function getDeliveries(filters?: {
    status?: string;
    search?: string;
}): Promise<Delivery[]> {
    const supabase = createAdminClient();

    let query = supabase
        .from('deliveries')
        .select('*')
        .order('scheduled_date', { ascending: true });

    if (filters?.status && filters.status !== 'all') {
        query = query.eq('status', filters.status);
    }

    if (filters?.search) {
        const safe = filters.search.replace(/[,()]/g, '').trim();
        if (safe) {
            query = query.or(
                `delivery_number.ilike.%${safe}%,driver_name.ilike.%${safe}%`
            );
        }
    }

    const { data, error } = await query;
    if (error) {
        console.error('Error fetching deliveries:', error);
        return [];
    }
    return data as Delivery[];
}

export async function getDeliveryWithItems(
    deliveryId: string
): Promise<DeliveryWithItems | null> {
    const supabase = createAdminClient();

    // Fetch delivery
    const { data: delivery, error } = await supabase
        .from('deliveries')
        .select('*')
        .eq('id', deliveryId)
        .single();

    if (error || !delivery) return null;

    // Fetch items, linked job, site, contact in parallel
    const [itemsRes, jobRes, siteRes, contactRes] = await Promise.all([
        supabase
            .from('delivery_items')
            .select('*')
            .eq('delivery_id', deliveryId)
            .order('sort_order', { ascending: true }),
        supabase
            .from('production_jobs')
            .select('id, job_number, title, client_name, status')
            .eq('id', delivery.production_job_id)
            .single(),
        delivery.site_id
            ? supabase
                  .from('org_sites')
                  .select(
                      'id, name, address_line_1, address_line_2, city, county, postcode, country, phone'
                  )
                  .eq('id', delivery.site_id)
                  .single()
            : Promise.resolve({ data: null }),
        delivery.contact_id
            ? supabase
                  .from('contacts')
                  .select('id, first_name, last_name, email, phone')
                  .eq('id', delivery.contact_id)
                  .single()
            : Promise.resolve({ data: null }),
    ]);

    return {
        ...(delivery as Delivery),
        items: (itemsRes.data || []) as DeliveryItem[],
        linked_job: jobRes.data ?? null,
        delivery_site: siteRes.data ?? null,
        delivery_contact: contactRes.data ?? null,
    };
}

export async function getDeliveryForJob(
    jobId: string
): Promise<Delivery | null> {
    const supabase = createAdminClient();

    const { data } = await supabase
        .from('deliveries')
        .select('*')
        .eq('production_job_id', jobId)
        .neq('status', 'failed')
        .maybeSingle();

    return data as Delivery | null;
}
