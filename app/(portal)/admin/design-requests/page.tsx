import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { listDesignRequests } from '@/lib/design-requests/actions';
import { DesignRequestsClient } from './DesignRequestsClient';

export const dynamic = 'force-dynamic';

export default async function DesignRequestsPage() {
    await requireAdmin();
    const res = await listDesignRequests();
    const requests = res.ok ? res.data : [];

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Design requests"
                description="Signs customers built themselves in the public design studio (/design) and sent in for a quote. Open one to review the spec, promote it into the visualiser, and follow up."
            />
            {!res.ok && (
                <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                    Could not load requests: {res.error}
                </p>
            )}
            <DesignRequestsClient requests={requests} />
        </div>
    );
}
