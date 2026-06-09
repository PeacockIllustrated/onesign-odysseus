import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { getSurveyDetail } from '@/lib/site-surveys/queries';
import { notFound } from 'next/navigation';
import { SurveyClient } from './SurveyClient';

export const dynamic = 'force-dynamic';

export default async function SiteSurveyDetailPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const detail = await getSurveyDetail(id);
    if (!detail) notFound();

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
        <SurveyClient
            detail={detail}
            orgs={orgsRes.data ?? []}
            contacts={(contactsRes.data ?? []) as never}
            sites={(sitesRes.data ?? []) as never}
        />
    );
}
