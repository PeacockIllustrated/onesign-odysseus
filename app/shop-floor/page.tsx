// app/shop-floor/page.tsx
import { getProductionStages, getShopFloorQueue } from '@/lib/production/queries';
import { ShopFloorClient } from './ShopFloorClient';

// Stages that are holding columns, not fabrication departments — never a
// useful landing tab for a worker (Order Book is pre-artwork; goods-out is
// dispatch; artwork-approval is a gate). Default to the first real station.
const NON_FABRICATION_SLUGS = new Set(['order-book', 'artwork-approval', 'goods-out']);

export default async function ShopFloorPage() {
    // Auth/role is enforced by app/shop-floor/layout.tsx (requireStaff).
    const stages = await getProductionStages();

    const defaultStage =
        stages.find(s => !NON_FABRICATION_SLUGS.has(s.slug)) ?? stages[0];
    const initialStageSlug = defaultStage?.slug ?? 'order-book';
    const initialJobs = await getShopFloorQueue(initialStageSlug);

    return (
        <ShopFloorClient
            stages={stages}
            initialJobs={initialJobs}
            initialStageSlug={initialStageSlug}
        />
    );
}
