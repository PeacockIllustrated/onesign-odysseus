import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { getMaintenanceVisits } from '@/lib/maintenance/actions';
import { PageHeader } from '@/app/(portal)/components/ui';
import { MaintenanceClient } from './MaintenanceClient';

export const dynamic = 'force-dynamic';

export default async function MaintenancePage() {
    await requireAdmin();

    const visits = await getMaintenanceVisits();

    const supabase = createAdminClient();
    const [orgsRes, contactsRes, sitesRes] = await Promise.all([
        supabase.from('orgs').select('id, name').order('name').limit(200),
        supabase.from('contacts').select('id, org_id, first_name, last_name').order('first_name'),
        supabase.from('org_sites').select('id, org_id, name').order('name'),
    ]);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Maintenance"
                description="surveys, inspections, repairs, and site visits"
            />
            <MaintenanceClient
                initialVisits={visits}
                orgs={orgsRes.data ?? []}
                contacts={(contactsRes.data ?? []) as any}
                sites={(sitesRes.data ?? []) as any}
            />
        </div>
    );
}
