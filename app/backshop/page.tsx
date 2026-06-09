import { getBackshopItems } from '@/lib/backshop/queries';
import { BackshopBoard } from './BackshopBoard';

// Always fresh — the board reflects live production state.
export const dynamic = 'force-dynamic';

export default async function BackshopPage() {
    const items = await getBackshopItems();
    return <BackshopBoard items={items} />;
}
