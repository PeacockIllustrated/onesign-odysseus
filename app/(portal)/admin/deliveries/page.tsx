import { requireAdmin } from '@/lib/auth';
import { getDeliveries } from '@/lib/deliveries/queries';
import { DeliveriesClient } from './DeliveriesClient';

export default async function DeliveriesPage() {
    await requireAdmin();
    const deliveries = await getDeliveries();
    return <DeliveriesClient initialDeliveries={deliveries} />;
}
