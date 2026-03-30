// app/shop-floor/page.tsx
import { requireAdmin } from '@/lib/auth';
import { getProductionStages, getShopFloorQueue } from '@/lib/production/queries';
import { ShopFloorClient } from './ShopFloorClient';

export default async function ShopFloorPage() {
    await requireAdmin();

    const stages = await getProductionStages();
    const initialJobs = await getShopFloorQueue('design');

    return (
        <ShopFloorClient
            stages={stages}
            initialJobs={initialJobs}
            initialStageSlug="design"
        />
    );
}
