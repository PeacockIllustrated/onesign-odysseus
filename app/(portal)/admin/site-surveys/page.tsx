import { requireAdmin } from '@/lib/auth';
import { Ruler } from 'lucide-react';
import { listSurveys } from '@/lib/site-surveys/queries';
import { SurveysClient } from './SurveysClient';

export const dynamic = 'force-dynamic';

export default async function SiteSurveysPage() {
    await requireAdmin();

    const surveys = await listSurveys();

    return (
        <div className="mx-auto max-w-5xl p-4 md:p-6">
            <div className="mb-6 flex items-center gap-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#4e7e8c] text-white">
                    <Ruler size={18} />
                </span>
                <div className="leading-tight">
                    <h1 className="text-xl font-bold tracking-tight text-neutral-900">
                        Site Surveys
                    </h1>
                    <p className="text-[11px] uppercase tracking-widest text-neutral-400">
                        Snap · measure · send to the office
                    </p>
                </div>
            </div>
            <SurveysClient initialSurveys={surveys} />
        </div>
    );
}
