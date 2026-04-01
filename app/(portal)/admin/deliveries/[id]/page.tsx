import { requireAdmin } from '@/lib/auth';
import { getDeliveryWithItems } from '@/lib/deliveries/queries';
import { DeliveryDetail } from './DeliveryDetail';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function DeliveryDetailPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const delivery = await getDeliveryWithItems(id);
    if (!delivery) notFound();
    return <DeliveryDetail delivery={delivery} />;
}
