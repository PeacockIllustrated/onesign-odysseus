import { requireAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewExternalOrderForm } from './NewExternalOrderForm';

export const dynamic = 'force-dynamic';

export default async function NewExternalOrderPage() {
    await requireAdmin();
    return (
        <div className="p-6 max-w-2xl mx-auto">
            <Link
                href="/admin/external-orders"
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black mb-4 transition-colors"
            >
                <ChevronLeft size={16} />
                back to external orders
            </Link>
            <PageHeader
                title="Log external order"
                description="use this for Mapleleaf orders or anything that didn't arrive through the normal webhook"
            />
            <NewExternalOrderForm />
        </div>
    );
}
