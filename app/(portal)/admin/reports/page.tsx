import { createAdminClient } from '@/lib/supabase-admin';
import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { ReportsClient } from './ReportsClient';

export default async function AdminReportsPage() {
    await requireAdmin();

    const supabase = createAdminClient();

    // Fetch all orgs for the filter
    const { data: orgs } = await supabase
        .from('orgs')
        .select('*')
        .order('name');

    // Fetch all reports with org
    const { data: reports } = await supabase
        .from('reports')
        .select(`
            *,
            org:orgs(*)
        `)
        .order('month', { ascending: false });

    return (
        <div>
            <PageHeader
                title="Reports"
                description="Upload and manage monthly performance reports"
            />
            <ReportsClient
                orgs={orgs || []}
                reports={reports || []}
            />
        </div>
    );
}

