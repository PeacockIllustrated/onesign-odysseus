import { requireAdmin, isSuperAdmin } from '@/lib/auth';
import { redirect, notFound } from 'next/navigation';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader, Card, Chip } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { checkPricingSetCompletenessAction } from '@/lib/quoter/pricing-actions';
import { ActivateClient } from './ActivateClient';

interface PageProps {
    params: Promise<{ setId: string }>;
}

function formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export default async function ActivatePricingSetPage({ params }: PageProps) {
    await requireAdmin();

    const superAdmin = await isSuperAdmin();
    if (!superAdmin) {
        redirect('/app/admin');
    }

    const { setId } = await params;
    const supabase = await createServerClient();

    // Get the pricing set to activate
    const { data: pricingSet, error } = await supabase
        .from('pricing_sets')
        .select('*')
        .eq('id', setId)
        .single();

    if (error || !pricingSet) {
        notFound();
    }

    // Can only activate draft sets
    if (pricingSet.status !== 'draft') {
        return (
            <div>
                <PageHeader
                    title="Activate Pricing Set"
                    description="Activation error"
                />
                <Card>
                    <div className="py-8 text-center">
                        <p className="text-red-600 mb-4">
                            Only draft pricing sets can be activated.
                        </p>
                        <p className="text-sm text-neutral-500">
                            This pricing set is currently: <strong>{pricingSet.status}</strong>
                        </p>
                        <Link
                            href={`/app/admin/pricing/${setId}`}
                            className="text-sm text-blue-600 hover:underline mt-4 inline-block"
                        >
                            Back to pricing set
                        </Link>
                    </div>
                </Card>
            </div>
        );
    }

    // Get current active set (if any)
    const { data: currentActive } = await supabase
        .from('pricing_sets')
        .select('id, name, effective_from')
        .eq('status', 'active')
        .single();

    // Check completeness
    const completeness = await checkPricingSetCompletenessAction(setId);

    return (
        <div>
            <div className="mb-4">
                <Link
                    href={`/app/admin/pricing/${setId}`}
                    className="text-sm text-neutral-500 hover:text-neutral-900 flex items-center gap-1"
                >
                    <ArrowLeft size={14} />
                    Back to {pricingSet.name}
                </Link>
            </div>

            <PageHeader
                title="Activate Pricing Set"
                description={`Activate "${pricingSet.name}" as the current rate card`}
            />

            {/* Activation Summary */}
            <Card className="mb-6">
                <h2 className="text-sm font-semibold text-neutral-900 mb-4">Activation Summary</h2>

                <div className="space-y-4">
                    {/* Set to activate */}
                    <div className="p-4 bg-green-50 rounded-[var(--radius-sm)] border border-green-200">
                        <p className="text-xs font-medium text-green-700 uppercase mb-1">Will Be Activated</p>
                        <p className="text-sm font-medium text-neutral-900">{pricingSet.name}</p>
                        <p className="text-xs text-neutral-500 mt-1">
                            Created: {formatDate(pricingSet.created_at)}
                        </p>
                    </div>

                    {/* Current active (if any) */}
                    {currentActive ? (
                        <div className="p-4 bg-amber-50 rounded-[var(--radius-sm)] border border-amber-200">
                            <div className="flex items-center gap-2 mb-1">
                                <AlertTriangle size={14} className="text-amber-600" />
                                <p className="text-xs font-medium text-amber-700 uppercase">Will Be Archived</p>
                            </div>
                            <p className="text-sm font-medium text-neutral-900">{currentActive.name}</p>
                            <p className="text-xs text-neutral-500 mt-1">
                                Active since: {currentActive.effective_from ? formatDate(currentActive.effective_from) : 'N/A'}
                            </p>
                        </div>
                    ) : (
                        <div className="p-4 bg-neutral-50 rounded-[var(--radius-sm)] border border-neutral-200">
                            <p className="text-sm text-neutral-600">
                                No currently active pricing set. This will be the first.
                            </p>
                        </div>
                    )}
                </div>
            </Card>

            {/* Completeness Check */}
            <Card className="mb-6">
                <h2 className="text-sm font-semibold text-neutral-900 mb-4">Completeness Check</h2>

                {completeness.ok ? (
                    <div className="p-4 bg-green-50 rounded-[var(--radius-sm)] border border-green-200">
                        <p className="text-sm font-medium text-green-800">
                            ✓ Rate card is complete and ready for activation
                        </p>
                    </div>
                ) : (
                    <div className="p-4 bg-red-50 rounded-[var(--radius-sm)] border border-red-200">
                        <p className="text-sm font-medium text-red-800 mb-2">
                            ✗ Rate card is incomplete
                        </p>
                        <ul className="text-xs text-red-700 space-y-1">
                            {completeness.missing.map((item, i) => (
                                <li key={i}>• {item}</li>
                            ))}
                        </ul>
                        <p className="text-xs text-red-600 mt-3">
                            Please fix these issues before activating.
                        </p>
                    </div>
                )}

                {completeness.warnings.length > 0 && (
                    <div className="mt-4 p-4 bg-amber-50 rounded-[var(--radius-sm)] border border-amber-200">
                        <p className="text-sm font-medium text-amber-800 mb-2">Warnings</p>
                        <ul className="text-xs text-amber-700 space-y-1">
                            {completeness.warnings.map((item, i) => (
                                <li key={i}>• {item}</li>
                            ))}
                        </ul>
                    </div>
                )}
            </Card>

            {/* Activation Actions */}
            <Card>
                <ActivateClient
                    pricingSetId={setId}
                    pricingSetName={pricingSet.name}
                    isComplete={completeness.ok}
                    currentActiveName={currentActive?.name}
                />
            </Card>
        </div>
    );
}
