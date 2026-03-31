// app/shop-floor/page.tsx
import { requireAuth } from '@/lib/auth';
import { getProductionStages, getShopFloorQueue } from '@/lib/production/queries';
import { ShopFloorClient } from './ShopFloorClient';

export default async function ShopFloorPage() {
    await requireAuth();

    const stages = await getProductionStages();
    const initialJobs = await getShopFloorQueue('order-book');

    return (
        <ShopFloorClient
            stages={stages}
            initialJobs={initialJobs}
            initialStageSlug="order-book"
        />
    );
}
