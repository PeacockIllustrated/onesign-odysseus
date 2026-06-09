import { requireAdmin } from '@/lib/auth';
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

    return <SurveyClient detail={detail} />;
}
