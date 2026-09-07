import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { getJobPack } from '@/lib/redbull-pack/actions';
import { DEFAULT_PACK_SLUG } from '@/lib/redbull-pack/types';
import { RedbullPackClient } from './RedbullPackClient';

export const dynamic = 'force-dynamic';

export default async function RedbullPackPage() {
    await requireAdmin();

    const res = await getJobPack(DEFAULT_PACK_SLUG);

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Red Bull Job Pack"
                description="the Newcastle Red Bulls pack at Kingston Park. Editing a row here changes what redbull.onesignanddigital.com shows within about 30 seconds — there is no separate publish step for row edits."
            />
            {!res.ok ? (
                <div className="p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
                    Failed to load the job pack: {res.error}
                </div>
            ) : (
                <RedbullPackClient pack={res.data.pack} states={res.data.states} />
            )}
        </div>
    );
}
