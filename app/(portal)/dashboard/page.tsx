import { createServerClient } from '@/lib/supabase-server';
import { getUserOrg } from '@/lib/auth';
import { PageHeader, Card, StatsCard, Chip, EmptyState } from '@/app/(portal)/components/ui';
import { DIGITAL_PACKAGES, getAcceleratorByKey } from '@/lib/offers/onesignDigital';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export default async function DashboardPage() {
    const orgContext = await getUserOrg();
    if (!orgContext) return null;

    const supabase = await createServerClient();
    const orgId = orgContext.org.id;

    // Fetch subscription
    const { data: subscription } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('org_id', orgId)
        .eq('status', 'active')
        .single();

    // Fetch active accelerators
    const { data: accelerators } = await supabase
        .from('subscription_accelerators')
        .select('*')
        .eq('org_id', orgId)
        .eq('status', 'active');

    // Fetch this month's deliverables
    const currentMonth = new Date().toISOString().slice(0, 7) + '-01';
    const { data: deliverables } = await supabase
        .from('deliverables')
        .select('*')
        .eq('org_id', orgId)
        .gte('month', currentMonth)
        .order('due_date', { ascending: true });

    // Get package details
    const packageData = subscription
        ? DIGITAL_PACKAGES.find((p) => p.id === subscription.package_key)
        : null;

    // Deliverable stats
    const deliverableStats = {
        total: deliverables?.length || 0,
        completed: deliverables?.filter((d) => d.status === 'done').length || 0,
        inProgress: deliverables?.filter((d) => d.status === 'review' || d.status === 'approved' || d.status === 'scheduled').length || 0,
    };

    return (
        <div>
            <PageHeader
                title="Dashboard"
                description={`Welcome back to ${orgContext.org.name}`}
            />

            {/* Stats row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <StatsCard
                    label="Deliverables this month"
                    value={deliverableStats.total}
                    sublabel={`${deliverableStats.completed} completed`}
                    icon="checkSquare"
                />
                <StatsCard
                    label="Active accelerators"
                    value={accelerators?.length || 0}
                    icon="zap"
                />
                <StatsCard
                    label="Current package"
                    value={packageData?.name || 'None'}
                    sublabel={subscription ? `${subscription.term_months} month term` : undefined}
                    icon="package"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Package & Accelerators */}
                <Card>
                    <h2 className="text-sm font-semibold text-neutral-900 mb-4">Your Package</h2>
                    {packageData ? (
                        <div>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-2xl font-bold">{packageData.name}</span>
                                <span className="text-sm text-neutral-500">£{packageData.price}/month</span>
                            </div>
                            <p className="text-sm text-neutral-600 mb-4">{packageData.positioningLine}</p>

                            {accelerators && accelerators.length > 0 && (
                                <div>
                                    <p className="text-xs font-medium text-neutral-500 uppercase mb-2">Active Accelerators</p>
                                    <div className="flex flex-wrap gap-2">
                                        {accelerators.map((acc) => {
                                            const accData = getAcceleratorByKey(acc.accelerator_key);
                                            return (
                                                <Chip key={acc.id} variant="active">
                                                    {accData?.title || acc.accelerator_key}
                                                </Chip>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <EmptyState
                            type="generic"
                            title="No active package"
                            description="Contact your account manager to set up a package."
                        />
                    )}
                </Card>

                {/* This Month's Deliverables */}
                <Card>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-neutral-900">This Month&apos;s Deliverables</h2>
                        <Link href="/app/deliverables" className="text-xs text-neutral-500 hover:text-black flex items-center gap-1">
                            View all <ArrowRight size={12} />
                        </Link>
                    </div>

                    {deliverables && deliverables.length > 0 ? (
                        <ul className="space-y-3">
                            {deliverables.slice(0, 5).map((d) => (
                                <li key={d.id} className="flex items-center justify-between py-2 border-b border-neutral-100 last:border-0">
                                    <div>
                                        <p className="text-sm font-medium text-neutral-900">{d.title}</p>
                                        {d.due_date && (
                                            <p className="text-xs text-neutral-500">
                                                Due {new Date(d.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                            </p>
                                        )}
                                    </div>
                                    <Chip variant={d.status as 'draft' | 'review' | 'approved' | 'scheduled' | 'done'}>
                                        {d.status}
                                    </Chip>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <EmptyState
                            type="deliverables"
                            title="No deliverables this month"
                            description="New deliverables will appear here when added."
                        />
                    )}
                </Card>
            </div>

            {/* Next Actions */}
            <Card className="mt-6">
                <h2 className="text-sm font-semibold text-neutral-900 mb-4">Next Actions</h2>
                <ul className="space-y-2">
                    {deliverables?.filter((d) => d.status === 'review').map((d) => (
                        <li key={d.id} className="flex items-center gap-3 text-sm">
                            <span className="w-2 h-2 rounded-full bg-blue-500" />
                            <span className="text-neutral-700">Review and approve: <strong>{d.title}</strong></span>
                        </li>
                    ))}
                    {(!deliverables || deliverables.filter((d) => d.status === 'review').length === 0) && (
                        <li className="text-sm text-neutral-500">No pending actions</li>
                    )}
                </ul>
            </Card>
        </div>
    );
}

