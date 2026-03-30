import { createServerClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { OrgsClient } from './OrgsClient';

export default async function AdminOrgsPage() {
    await requireAdmin();

    const supabase = await createServerClient();

    // Fetch all orgs
    const { data: orgs } = await supabase
        .from('orgs')
        .select('*')
        .order('created_at', { ascending: false });

    // Fetch member counts
    const { data: memberData } = await supabase
        .from('org_members')
        .select('org_id');

    const memberCounts: Record<string, number> = {};
    memberData?.forEach(m => {
        memberCounts[m.org_id] = (memberCounts[m.org_id] || 0) + 1;
    });

    // Fetch active subscriptions
    const { data: subs } = await supabase
        .from('subscriptions')
        .select('org_id, package_key, status')
        .eq('status', 'active');

    const subscriptions: Record<string, { package_key: string; status: string }> = {};
    subs?.forEach(s => {
        subscriptions[s.org_id] = { package_key: s.package_key, status: s.status };
    });

    return (
        <div>
            <PageHeader
                title="Organisations"
                description="Manage client organisations and members"
            />
            <OrgsClient
                initialOrgs={orgs || []}
                memberCounts={memberCounts}
                subscriptions={subscriptions}
            />
        </div>
    );
}

