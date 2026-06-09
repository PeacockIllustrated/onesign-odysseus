import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { listShopFloorFlags } from '@/lib/production/shop-floor-actions';
import { FlagsClient } from './FlagsClient';

export const dynamic = 'force-dynamic';

export default async function ShopFloorFlagsPage() {
    await requireAdmin();
    const res = await listShopFloorFlags({ includeResolved: true, resolvedLimit: 25 });
    const rows = res.ok ? res.data : [];
    const loadError = res.ok ? null : res.error;

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="Shop-Floor Flags"
                description="problems raised from /shop-floor against a sub-item. Resolving a flag here clears the inbox; the underlying job item stays paused until you move it on the Job Board."
            />
            {loadError ? (
                <div className="p-3 rounded border border-red-200 bg-red-50 text-sm text-red-700">
                    Failed to load flags: {loadError}
                </div>
            ) : (
                <FlagsClient rows={rows} />
            )}
        </div>
    );
}
