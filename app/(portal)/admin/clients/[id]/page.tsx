import { requireAdmin } from '@/lib/auth';
import { getClientWithDetails } from '@/lib/clients/queries';
import { createAdminClient } from '@/lib/supabase-admin';
import { ClientDetailClient } from './ClientDetailClient';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const client = await getClientWithDetails(id);
    if (!client) notFound();

    // Fetch activity counts in parallel
    const supabase = createAdminClient();
    const [quotesResult, jobsResult, invoicesResult, deliveriesResult] = await Promise.all([
        supabase
            .from('quotes')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', id),
        supabase
            .from('production_jobs')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', id),
        supabase
            .from('invoices')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', id),
        supabase
            .from('deliveries')
            .select('id', { count: 'exact', head: true })
            .eq('org_id', id),
    ]);

    const activityCounts = {
        quotes: quotesResult.count ?? 0,
        jobs: jobsResult.count ?? 0,
        invoices: invoicesResult.count ?? 0,
        deliveries: deliveriesResult.count ?? 0,
    };

    return <ClientDetailClient client={client} activityCounts={activityCounts} />;
}
