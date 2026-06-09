import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { listSurveys } from '@/lib/site-surveys/queries';
import { PageHeader } from '@/app/(portal)/components/ui';
import { SurveysClient } from './SurveysClient';

export const dynamic = 'force-dynamic';

export default async function SiteSurveysPage() {
    await requireAdmin();

    const surveys = await listSurveys();

    const supabase = createAdminClient();
    const [orgsRes, contactsRes, sitesRes] = await Promise.all([
        supabase.from('orgs').select('id, name').order('name').limit(300),
        supabase
            .from('contacts')
            .select('id, org_id, first_name, last_name')
            .order('first_name'),
        supabase.from('org_sites').select('id, org_id, name').order('name'),
    ]);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Site Surveys"
                description="on-site measure-ups — measurements, annotated photos, and printable survey packs"
            />
            <SurveysClient
                initialSurveys={surveys}
                orgs={orgsRes.data ?? []}
                contacts={(contactsRes.data ?? []) as never}
                sites={(sitesRes.data ?? []) as never}
            />
        </div>
    );
}
