import { requireAdmin } from '@/lib/auth';
import { getPurchaseOrders } from '@/lib/purchase-orders/queries';
import { PurchaseOrdersClient } from './PurchaseOrdersClient';

export default async function PurchaseOrdersPage() {
    await requireAdmin();
    const initialPos = await getPurchaseOrders();
    return <PurchaseOrdersClient initialPos={initialPos} />;
}
