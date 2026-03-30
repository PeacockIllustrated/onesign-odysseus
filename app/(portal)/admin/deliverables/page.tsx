import { createServerClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { DeliverablesClient } from './DeliverablesClient';

export default async function AdminDeliverablesPage() {
    await requireAdmin();

    const supabase = await createServerClient();

    // Fetch all orgs
    const { data: orgs } = await supabase
        .from('orgs')
        .select('*')
        .order('name');

    // Fetch current month's deliverables with org
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];

    const { data: deliverables } = await supabase
        .from('deliverables')
        .select(`
            *,
            org:orgs(*)
        `)
        .eq('month', currentMonth)
        .order('created_at', { ascending: false });

    // Fetch active subscriptions
    const { data: subs } = await supabase
        .from('subscriptions')
        .select('org_id, package_key')
        .eq('status', 'active');

    const subscriptions: Record<string, string> = {};
    subs?.forEach(s => {
        subscriptions[s.org_id] = s.package_key;
    });

    const monthLabel = now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

    return (
        <div>
            <PageHeader
                title="Deliverables"
                description={`Pipeline for ${monthLabel}`}
            />
            <DeliverablesClient
                orgs={orgs || []}
                deliverables={deliverables || []}
                subscriptions={subscriptions}
            />
        </div>
    );
}

