import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listExternalOrders } from '@/lib/external-orders/actions';
import { ExternalOrdersClient } from './ExternalOrdersClient';

export const dynamic = 'force-dynamic';

export default async function ExternalOrdersPage() {
    await requireAdmin();
    const orders = await listExternalOrders();

    return (
        <div className="p-6 max-w-6xl mx-auto">
            <PageHeader
                title="External Orders"
                description="incoming orders from Persimmon, Mapleleaf, Lynx shop, and any one-off sources — one inbox for everything that didn't come through quoting"
                action={
                    <Link
                        href="/admin/external-orders/new"
                        className="btn-primary inline-flex items-center gap-2"
                    >
                        <Plus size={16} />
                        Log order manually
                    </Link>
                }
            />
            <ExternalOrdersClient orders={orders} />
        </div>
    );
}
