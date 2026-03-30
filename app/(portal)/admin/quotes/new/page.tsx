import { requireAdmin, isSuperAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import { redirect } from 'next/navigation';
import { NewQuoteForm } from './NewQuoteForm';

export default async function NewQuotePage() {
    await requireAdmin();

    const supabase = await createServerClient();
    const superAdmin = await isSuperAdmin();

    // Get active pricing set
    const { data: activePricingSet } = await supabase
        .from('pricing_sets')
        .select('id, name')
        .eq('status', 'active')
        .single();

    // Get all pricing sets for super admin (can test with draft sets)
    let allPricingSets: Array<{ id: string; name: string; status: string }> = [];
    if (superAdmin) {
        const { data } = await supabase
            .from('pricing_sets')
            .select('id, name, status')
            .in('status', ['active', 'draft'])
            .order('created_at', { ascending: false });
        allPricingSets = data || [];
    }

    if (!activePricingSet && !superAdmin) {
        return (
            <div>
                <PageHeader
                    title="New Quote"
                    description="Create a new internal quote"
                />
                <Card>
                    <div className="py-8 text-center">
                        <p className="text-red-600 text-sm">
                            No active pricing set found. Please activate a pricing set before creating quotes.
                        </p>
                    </div>
                </Card>
            </div>
        );
    }

    return (
        <div>
            <PageHeader
                title="New Quote"
                description="Create a new internal quote"
            />
            <Card>
                <NewQuoteForm
                    defaultPricingSetId={activePricingSet?.id || allPricingSets[0]?.id}
                    pricingSets={superAdmin ? allPricingSets : (activePricingSet ? [{ ...activePricingSet, status: 'active' }] : [])}
                    showPricingSetSelector={superAdmin}
                />
            </Card>
        </div>
    );
}

