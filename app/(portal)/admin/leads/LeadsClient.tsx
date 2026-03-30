'use client';

import { useState } from 'react';
import { type MarketingLead } from '@/lib/supabase';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { LeadDetailModal } from './LeadDetailModal';
import { ConvertLeadWizard } from './ConvertLeadWizard';
import { DIGITAL_PACKAGES } from '@/lib/offers/onesignDigital';
import { useRouter } from 'next/navigation';

// Type for architect leads
interface ArchitectLead {
    id: string;
    practice_name: string;
    contact_name: string;
    contact_role?: string;
    email: string;
    phone?: string;
    project_name?: string;
    project_type?: string;
    riba_stage?: string;
    location?: string;
    planning_sensitive?: boolean;
    support_needed?: string[];
    notes?: string;
    status?: string;
    created_at?: string;
}

interface LeadsClientProps {
    initialMarketingLeads: MarketingLead[];
    initialArchitectLeads: ArchitectLead[];
}

const statusFilters = ['all', 'new', 'contacted', 'qualified', 'converted', 'lost'] as const;
type StatusFilter = typeof statusFilters[number];

const statusVariants: Record<string, 'default' | 'draft' | 'review' | 'approved' | 'done'> = {
    new: 'draft',
    contacted: 'review',
    qualified: 'review',
    converted: 'done',
    lost: 'default',
};

const PROJECT_TYPE_LABELS: Record<string, string> = {
    public_realm: 'Public Realm',
    heritage: 'Heritage',
    education: 'Education',
    mixed_use: 'Mixed-Use',
    other: 'Other',
};

const RIBA_STAGE_LABELS: Record<string, string> = {
    '1': 'Stage 1',
    '2': 'Stage 2',
    '3': 'Stage 3',
    '4': 'Stage 4',
    '5': 'Stage 5',
    '6': 'Stage 6',
    '7': 'Stage 7',
    'not_sure': 'Not sure',
};

type TabType = 'marketing' | 'architects';

export function LeadsClient({ initialMarketingLeads, initialArchitectLeads }: LeadsClientProps) {
    const router = useRouter();
    const [activeTab, setActiveTab] = useState<TabType>('marketing');
    const [marketingLeads, setMarketingLeads] = useState(initialMarketingLeads);
    const [architectLeads, setArchitectLeads] = useState(initialArchitectLeads);
    const [filter, setFilter] = useState<StatusFilter>('all');
    const [selectedLead, setSelectedLead] = useState<MarketingLead | null>(null);
    const [detailOpen, setDetailOpen] = useState(false);
    const [wizardOpen, setWizardOpen] = useState(false);

    // Architect modal state
    const [selectedArchitectLead, setSelectedArchitectLead] = useState<ArchitectLead | null>(null);
    const [architectDetailOpen, setArchitectDetailOpen] = useState(false);

    const filteredMarketingLeads = filter === 'all'
        ? marketingLeads
        : marketingLeads.filter(l => l.status === filter);

    const filteredArchitectLeads = filter === 'all'
        ? architectLeads
        : architectLeads.filter(l => l.status === filter);

    function handleStatusChange(leadId: string, newStatus: string) {
        setMarketingLeads(prev => prev.map(l =>
            l.id === leadId ? { ...l, status: newStatus } : l
        ));
        if (selectedLead?.id === leadId) {
            setSelectedLead({ ...selectedLead, status: newStatus });
        }
    }

    function handleOpenConvert(lead: MarketingLead) {
        setSelectedLead(lead);
        setDetailOpen(false);
        setWizardOpen(true);
    }

    function handleConvertSuccess() {
        router.refresh();
        setWizardOpen(false);
    }

    function getPackageName(key?: string) {
        if (!key) return '—';
        const pkg = DIGITAL_PACKAGES.find(p => p.id === key);
        return pkg?.name || key;
    }

    async function updateArchitectLeadStatus(leadId: string, newStatus: string) {
        try {
            const response = await fetch(`/api/admin/architect-leads/${leadId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });

            if (response.ok) {
                setArchitectLeads(prev => prev.map(l =>
                    l.id === leadId ? { ...l, status: newStatus } : l
                ));
                if (selectedArchitectLead?.id === leadId) {
                    setSelectedArchitectLead({ ...selectedArchitectLead, status: newStatus });
                }
            }
        } catch (error) {
            console.error('Failed to update architect lead status:', error);
        }
    }

    return (
        <>
            {/* Tab Switcher */}
            <div className="flex gap-2 mb-6 border-b border-neutral-200">
                <button
                    onClick={() => setActiveTab('marketing')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === 'marketing'
                            ? 'border-black text-black'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700'
                        }`}
                >
                    Growth Leads
                    <span className="ml-2 px-2 py-0.5 bg-neutral-100 rounded-full text-xs">
                        {marketingLeads.length}
                    </span>
                </button>
                <button
                    onClick={() => setActiveTab('architects')}
                    className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === 'architects'
                            ? 'border-black text-black'
                            : 'border-transparent text-neutral-500 hover:text-neutral-700'
                        }`}
                >
                    Architect Leads
                    <span className="ml-2 px-2 py-0.5 bg-neutral-100 rounded-full text-xs">
                        {architectLeads.length}
                    </span>
                </button>
            </div>

            {/* Filter chips */}
            <div className="flex gap-2 mb-4 flex-wrap">
                {statusFilters.map(s => (
                    <button
                        key={s}
                        onClick={() => setFilter(s)}
                        className={`
                            px-3 py-1.5 rounded-full text-xs font-medium transition-colors
                            ${filter === s
                                ? 'bg-black text-white'
                                : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'}
                        `}
                    >
                        {s.charAt(0).toUpperCase() + s.slice(1)}
                        {s !== 'all' && (
                            <span className="ml-1 opacity-60">
                                ({activeTab === 'marketing'
                                    ? marketingLeads.filter(l => l.status === s).length
                                    : architectLeads.filter(l => l.status === s).length
                                })
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Marketing Leads Table */}
            {activeTab === 'marketing' && (
                <Card>
                    {filteredMarketingLeads.length === 0 ? (
                        <p className="text-sm text-neutral-500 py-8 text-center">No marketing leads found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-neutral-200">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Company</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Contact</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Package</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {filteredMarketingLeads.map(lead => (
                                        <tr
                                            key={lead.id}
                                            onClick={() => {
                                                setSelectedLead(lead);
                                                setDetailOpen(true);
                                            }}
                                            className="cursor-pointer hover:bg-neutral-50 transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-neutral-900">{lead.company_name}</div>
                                                <div className="text-xs text-neutral-500">{lead.industry_type || '—'}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm text-neutral-900">{lead.contact_name}</div>
                                                <div className="text-xs text-neutral-500">{lead.contact_email}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm font-medium">{getPackageName(lead.package_key)}</span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Chip variant={statusVariants[lead.status || 'new'] || 'default'}>
                                                    {lead.status || 'new'}
                                                </Chip>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-500">
                                                {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-GB') : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}

            {/* Architect Leads Table */}
            {activeTab === 'architects' && (
                <Card>
                    {filteredArchitectLeads.length === 0 ? (
                        <p className="text-sm text-neutral-500 py-8 text-center">No architect leads found</p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead>
                                    <tr className="border-b border-neutral-200">
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Practice</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Contact</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Project</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">RIBA</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Status</th>
                                        <th className="px-4 py-3 text-left text-xs font-medium text-neutral-500 uppercase tracking-wide">Created</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100">
                                    {filteredArchitectLeads.map(lead => (
                                        <tr
                                            key={lead.id}
                                            onClick={() => {
                                                setSelectedArchitectLead(lead);
                                                setArchitectDetailOpen(true);
                                            }}
                                            className="cursor-pointer hover:bg-neutral-50 transition-colors"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="font-medium text-neutral-900">{lead.practice_name}</div>
                                                <div className="text-xs text-neutral-500">
                                                    {lead.project_type ? PROJECT_TYPE_LABELS[lead.project_type] || lead.project_type : '—'}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm text-neutral-900">{lead.contact_name}</div>
                                                <div className="text-xs text-neutral-500">{lead.email}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="text-sm text-neutral-900">{lead.project_name || '—'}</div>
                                                <div className="text-xs text-neutral-500">{lead.location || '—'}</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="text-sm">
                                                    {lead.riba_stage ? RIBA_STAGE_LABELS[lead.riba_stage] || lead.riba_stage : '—'}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Chip variant={statusVariants[lead.status || 'new'] || 'default'}>
                                                    {lead.status || 'new'}
                                                </Chip>
                                            </td>
                                            <td className="px-4 py-3 text-sm text-neutral-500">
                                                {lead.created_at ? new Date(lead.created_at).toLocaleDateString('en-GB') : '—'}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </Card>
            )}

            {/* Architect Lead Detail Modal */}
            {architectDetailOpen && selectedArchitectLead && (
                <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
                    <div
                        className="absolute inset-0 bg-black/50"
                        onClick={() => setArchitectDetailOpen(false)}
                    />
                    <div className="relative bg-white rounded-[var(--radius-lg)] shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto p-6">
                        <button
                            onClick={() => setArchitectDetailOpen(false)}
                            className="absolute top-4 right-4 text-neutral-400 hover:text-black transition-colors"
                        >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h2 className="text-xl font-bold text-neutral-900 mb-6">
                            {selectedArchitectLead.practice_name}
                        </h2>

                        <div className="space-y-4">
                            {/* Contact Info */}
                            <div className="border-b border-neutral-100 pb-4">
                                <h3 className="text-xs font-medium text-neutral-400 uppercase mb-2">Contact</h3>
                                <div className="text-sm">
                                    <p className="font-medium">{selectedArchitectLead.contact_name}</p>
                                    {selectedArchitectLead.contact_role && (
                                        <p className="text-neutral-500">{selectedArchitectLead.contact_role}</p>
                                    )}
                                    <p className="text-neutral-600">{selectedArchitectLead.email}</p>
                                    {selectedArchitectLead.phone && (
                                        <p className="text-neutral-600">{selectedArchitectLead.phone}</p>
                                    )}
                                </div>
                            </div>

                            {/* Project Info */}
                            <div className="border-b border-neutral-100 pb-4">
                                <h3 className="text-xs font-medium text-neutral-400 uppercase mb-2">Project</h3>
                                <dl className="text-sm space-y-1">
                                    {selectedArchitectLead.project_name && (
                                        <div className="flex justify-between">
                                            <dt className="text-neutral-500">Name</dt>
                                            <dd className="font-medium">{selectedArchitectLead.project_name}</dd>
                                        </div>
                                    )}
                                    {selectedArchitectLead.project_type && (
                                        <div className="flex justify-between">
                                            <dt className="text-neutral-500">Type</dt>
                                            <dd>{PROJECT_TYPE_LABELS[selectedArchitectLead.project_type] || selectedArchitectLead.project_type}</dd>
                                        </div>
                                    )}
                                    {selectedArchitectLead.riba_stage && (
                                        <div className="flex justify-between">
                                            <dt className="text-neutral-500">RIBA Stage</dt>
                                            <dd>{RIBA_STAGE_LABELS[selectedArchitectLead.riba_stage] || selectedArchitectLead.riba_stage}</dd>
                                        </div>
                                    )}
                                    {selectedArchitectLead.location && (
                                        <div className="flex justify-between">
                                            <dt className="text-neutral-500">Location</dt>
                                            <dd>{selectedArchitectLead.location}</dd>
                                        </div>
                                    )}
                                    {selectedArchitectLead.planning_sensitive && (
                                        <div className="flex justify-between">
                                            <dt className="text-neutral-500">Sensitivity</dt>
                                            <dd className="text-amber-600">Conservation / Listed</dd>
                                        </div>
                                    )}
                                </dl>
                            </div>

                            {/* Support Needed */}
                            {selectedArchitectLead.support_needed && selectedArchitectLead.support_needed.length > 0 && (
                                <div className="border-b border-neutral-100 pb-4">
                                    <h3 className="text-xs font-medium text-neutral-400 uppercase mb-2">Support Requested</h3>
                                    <div className="flex flex-wrap gap-2">
                                        {selectedArchitectLead.support_needed.map((support, i) => (
                                            <span key={i} className="px-2.5 py-1 bg-neutral-100 text-neutral-700 text-xs rounded-full">
                                                {support.replace(/_/g, ' ')}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Notes */}
                            {selectedArchitectLead.notes && (
                                <div className="border-b border-neutral-100 pb-4">
                                    <h3 className="text-xs font-medium text-neutral-400 uppercase mb-2">Notes</h3>
                                    <p className="text-sm text-neutral-600">{selectedArchitectLead.notes}</p>
                                </div>
                            )}

                            {/* Status Update */}
                            <div>
                                <h3 className="text-xs font-medium text-neutral-400 uppercase mb-2">Status</h3>
                                <div className="flex flex-wrap gap-2">
                                    {statusFilters.filter(s => s !== 'all').map(status => (
                                        <button
                                            key={status}
                                            onClick={() => updateArchitectLeadStatus(selectedArchitectLead.id, status)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${selectedArchitectLead.status === status
                                                    ? 'bg-black text-white'
                                                    : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                                }`}
                                        >
                                            {status.charAt(0).toUpperCase() + status.slice(1)}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Marketing Lead Detail Modal */}
            <LeadDetailModal
                lead={selectedLead}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
                onStatusChange={handleStatusChange}
                onConvert={handleOpenConvert}
            />

            {/* Convert Wizard */}
            <ConvertLeadWizard
                lead={selectedLead}
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                onSuccess={handleConvertSuccess}
            />
        </>
    );
}

