import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { SubscriptionsClient } from './SubscriptionsClient';

export default async function AdminSubscriptionsPage() {
    await requireAdmin();

    const supabase = createAdminClient();

    // Fetch all orgs for the selector
    const { data: orgs } = await supabase
        .from('orgs')
        .select('*')
        .order('name');

    // Fetch all subscriptions with org and accelerators
    const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select(`
            *,
            org:orgs(*)
        `)
        .order('created_at', { ascending: false });

    // Fetch accelerators for each subscription's org
    const { data: accelerators } = await supabase
        .from('subscription_accelerators')
        .select('*');

    // Map accelerators to subscriptions by org_id
    const subsWithAccelerators = (subscriptions || []).map(sub => ({
        ...sub,
        accelerators: (accelerators || []).filter(a => a.org_id === sub.org_id),
    }));

    return (
        <div>
            <PageHeader
                title="Subscriptions"
                description="Manage client packages and accelerators"
            />
            <SubscriptionsClient
                orgs={orgs || []}
                subscriptions={subsWithAccelerators}
            />
        </div>
    );
}

