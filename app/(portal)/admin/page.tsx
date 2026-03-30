import { createServerClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/auth';
import { PageHeader, Card, StatsCard } from '@/app/(portal)/components/ui';
import { Users, Building2, Package, FileText, AlertCircle } from 'lucide-react';
import Link from 'next/link';

export default async function AdminPage() {
    await requireAdmin();

    const supabase = await createServerClient();

    // Fetch counts
    const { count: leadCount } = await supabase
        .from('marketing_leads')
        .select('*', { count: 'exact', head: true });

    const { count: orgCount } = await supabase
        .from('orgs')
        .select('*', { count: 'exact', head: true });

    const { count: activeSubCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

    // Fetch recent leads
    const { data: recentLeads } = await supabase
        .from('marketing_leads')
        .select('id, company_name, contact_name, status, created_at')
        .order('created_at', { ascending: false })
        .limit(5);

    // Fetch current month
    const now = new Date();
    const currentMonth = new Date(now.getFullYear(), now.getMonth(), 1)
        .toISOString()
        .split('T')[0];

    // Fetch orgs without deliverables this month
    const { data: orgsWithSubs } = await supabase
        .from('subscriptions')
        .select('org_id, orgs(id, name)')
        .eq('status', 'active');

    const { data: orgsWithDeliverables } = await supabase
        .from('deliverables')
        .select('org_id')
        .eq('month', currentMonth);

    const deliverableOrgIds = new Set(orgsWithDeliverables?.map(d => d.org_id) || []);

    // Type the result properly - Supabase returns relations as objects or null
    interface OrgWithSub {
        org_id: string;
        orgs: { id: string; name: string } | null;
    }
    const orgsNeedingAttention = ((orgsWithSubs || []) as unknown as OrgWithSub[]).filter(
        s => !deliverableOrgIds.has(s.org_id)
    );

    return (
        <div>
            <PageHeader
                title="Admin Dashboard"
                description="Overview of sales pipeline and client operations"
            />

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 mb-6">
                <Link href="/app/admin/leads">
                    <StatsCard
                        label="Total Leads"
                        value={leadCount || 0}
                        icon="users"
                    />
                </Link>
                <Link href="/app/admin/orgs">
                    <StatsCard
                        label="Organisations"
                        value={orgCount || 0}
                        icon="building"
                    />
                </Link>
                <Link href="/app/admin/subscriptions">
                    <StatsCard
                        label="Active Subscriptions"
                        value={activeSubCount || 0}
                        icon="package"
                    />
                </Link>
                <Link href="/app/admin/deliverables">
                    <StatsCard
                        label="Need Attention"
                        value={orgsNeedingAttention.length}
                        sublabel="Missing deliverables"
                        icon="checkSquare"
                    />
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                {/* Recent Leads */}
                <Card>
                    <div className="flex items-center justify-between mb-4">
                        <h2 className="text-sm font-semibold text-neutral-900">Recent Leads</h2>
                        <Link href="/app/admin/leads" className="text-xs text-blue-600 hover:underline">
                            View all
                        </Link>
                    </div>
                    {!recentLeads || recentLeads.length === 0 ? (
                        <p className="text-sm text-neutral-500 py-4 text-center">No leads yet</p>
                    ) : (
                        <div className="space-y-3">
                            {recentLeads.map(lead => (
                                <Link
                                    key={lead.id}
                                    href="/app/admin/leads"
                                    className="flex items-center justify-between p-2 rounded hover:bg-neutral-50 transition-colors"
                                >
                                    <div>
                                        <p className="text-sm font-medium text-neutral-900">{lead.company_name}</p>
                                        <p className="text-xs text-neutral-500">{lead.contact_name}</p>
                                    </div>
                                    <span className={`
                                        text-xs px-2 py-0.5 rounded-full
                                        ${lead.status === 'new' ? 'bg-neutral-100 text-neutral-600' : ''}
                                        ${lead.status === 'contacted' ? 'bg-amber-50 text-amber-700' : ''}
                                        ${lead.status === 'qualified' ? 'bg-blue-50 text-blue-700' : ''}
                                        ${lead.status === 'converted' ? 'bg-green-50 text-green-700' : ''}
                                    `}>
                                        {lead.status || 'new'}
                                    </span>
                                </Link>
                            ))}
                        </div>
                    )}
                </Card>

                {/* Orgs Needing Attention */}
                <Card>
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-2">
                            <AlertCircle size={16} className="text-amber-500" />
                            <h2 className="text-sm font-semibold text-neutral-900">Needs Attention</h2>
                        </div>
                        <Link href="/app/admin/deliverables" className="text-xs text-blue-600 hover:underline">
                            Generate
                        </Link>
                    </div>
                    {orgsNeedingAttention.length === 0 ? (
                        <p className="text-sm text-green-600 py-4 text-center">All orgs have deliverables this month ✓</p>
                    ) : (
                        <div className="space-y-2">
                            {orgsNeedingAttention.slice(0, 5).map((item) => (
                                <div key={item.org_id} className="flex items-center justify-between p-2 bg-amber-50 rounded">
                                    <span className="text-sm text-neutral-900">{item.orgs?.name || 'Unknown'}</span>
                                    <span className="text-xs text-amber-700">No deliverables</span>
                                </div>
                            ))}
                            {orgsNeedingAttention.length > 5 && (
                                <p className="text-xs text-neutral-500 text-center">
                                    +{orgsNeedingAttention.length - 5} more
                                </p>
                            )}
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
}

