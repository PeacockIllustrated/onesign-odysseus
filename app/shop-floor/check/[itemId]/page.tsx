import { redirect } from 'next/navigation';
import { requireAuth } from '@/lib/auth';
import { getSubItemsForItemAtStage } from '@/lib/production/shop-floor-actions';
import { GuidedCheckClient } from './GuidedCheckClient';

export const dynamic = 'force-dynamic';

interface PageProps {
    params: Promise<{ itemId: string }>;
}

export default async function ShopFloorCheckPage({ params }: PageProps) {
    await requireAuth();
    const { itemId } = await params;

    const ctx = await getSubItemsForItemAtStage(itemId);
    if ('error' in ctx) {
        // Most likely: item not found, or not authenticated (already caught).
        redirect('/shop-floor');
    }

    return <GuidedCheckClient ctx={ctx} />;
}
