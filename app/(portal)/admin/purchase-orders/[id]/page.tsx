import { requireAdmin } from '@/lib/auth';
import { getPoWithItems } from '@/lib/purchase-orders/queries';
import { notFound } from 'next/navigation';
import { PurchaseOrderDetail } from './PurchaseOrderDetail';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function PurchaseOrderDetailPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const po = await getPoWithItems(id);
    if (!po) notFound();
    return <PurchaseOrderDetail initialPo={po} />;
}
