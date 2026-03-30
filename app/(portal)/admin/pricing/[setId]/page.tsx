import { requireAdmin, isSuperAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ArrowLeft, Zap } from 'lucide-react';
import { getPricingSetWithRateCards } from '@/lib/quoter/pricing-actions';
import { RateCardEditor } from '../components/RateCardEditor';

interface PageProps {
    params: Promise<{ setId: string }>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

function getStatusVariant(status: string): 'draft' | 'approved' | 'default' {
    switch (status) {
        case 'draft': return 'draft';
        case 'active': return 'approved';
        case 'archived': return 'default';
        default: return 'default';
    }
}

export default async function PricingSetEditPage({ params }: PageProps) {
    await requireAdmin();

    const superAdmin = await isSuperAdmin();
    if (!superAdmin) {
        redirect('/admin');
    }

    const { setId } = await params;
    const data = await getPricingSetWithRateCards(setId);

    if (!data) {
        notFound();
    }

    const { pricingSet, rateCards } = data;

    return (
        <div>
            <div className="mb-4">
                <Link
                    href="/admin/pricing"
                    className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                >
                    <ArrowLeft size={14} />
                    Back to Pricing Sets
                </Link>
            </div>

            <PageHeader
                title={pricingSet.name}
                description="Edit rate card data"
                action={
                    <div className="flex items-center gap-3">
                        <Chip variant={getStatusVariant(pricingSet.status)}>
                            {pricingSet.status}
                        </Chip>
                        {pricingSet.status === 'draft' && (
                            <Link
                                href={`/admin/pricing/${setId}/activate`}
                                className="btn-primary flex items-center gap-2"
                            >
                                <Zap size={16} />
                                Activate
                            </Link>
                        )}
                    </div>
                }
            />

            {/* Pricing Set Info */}
            <Card className="mb-6">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Status</p>
                        <p className="text-sm text-neutral-900 capitalize">{pricingSet.status}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Effective From</p>
                        <p className="text-sm text-neutral-900">
                            {pricingSet.effective_from ? formatDate(pricingSet.effective_from) : '—'}
                        </p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Created</p>
                        <p className="text-sm text-neutral-900">{formatDate(pricingSet.created_at)}</p>
                    </div>
                    <div>
                        <p className="text-xs font-medium text-neutral-500 uppercase mb-1">Tables</p>
                        <p className="text-sm text-neutral-900">
                            {Object.values(rateCards).reduce((sum, arr) => sum + arr.length, 0)} rows
                        </p>
                    </div>
                </div>
            </Card>

            {/* Rate Card Editor */}
            <Card>
                <RateCardEditor
                    pricingSetId={setId}
                    pricingSetStatus={pricingSet.status}
                    rateCards={rateCards}
                />
            </Card>
        </div>
    );
}
