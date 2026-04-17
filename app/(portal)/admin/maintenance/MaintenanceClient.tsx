'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X, CheckCircle, XCircle } from 'lucide-react';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { createMaintenanceVisit, completeMaintenanceVisit, cancelMaintenanceVisit } from '@/lib/maintenance/actions';
import type { MaintenanceVisit } from '@/lib/maintenance/types';

interface Props {
    initialVisits: MaintenanceVisit[];
    orgs: { id: string; name: string }[];
    contacts: { id: string; org_id: string; first_name: string; last_name: string }[];
    sites: { id: string; org_id: string; name: string }[];
}

const STATUS_TABS = ['all', 'scheduled', 'in_progress', 'completed', 'cancelled'] as const;
const TYPE_LABELS: Record<string, string> = {
    survey: 'Survey',
    inspection: 'Inspection',
    repair: 'Repair',
    cleaning: 'Cleaning',
    other: 'Other',
};
const STATUS_VARIANTS: Record<string, 'draft' | 'active' | 'approved' | 'paused'> = {
    scheduled: 'draft',
    in_progress: 'active',
    completed: 'approved',
    cancelled: 'paused',
};

export function MaintenanceClient({ initialVisits, orgs, contacts, sites }: Props) {
    const router = useRouter();
    const [tab, setTab] = useState<string>('all');
    const [showCreate, setShowCreate] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [orgId, setOrgId] = useState('');
    const [siteId, setSiteId] = useState('');
    const [contactId, setContactId] = useState('');
    const [visitType, setVisitType] = useState('inspection');
    const [scheduledDate, setScheduledDate] = useState(new Date().toISOString().slice(0, 10));
    const [notes, setNotes] = useState('');

    const orgContacts = orgId ? contacts.filter((c) => c.org_id === orgId) : [];
    const orgSites = orgId ? sites.filter((s) => s.org_id === orgId) : [];

    const filteredVisits = tab === 'all'
        ? initialVisits
        : initialVisits.filter((v) => v.status === tab);

    const handleCreate = () => {
        if (!orgId) { setError('select a client'); return; }
        setError(null);
        startTransition(async () => {
            const res = await createMaintenanceVisit({
                org_id: orgId,
                site_id: siteId || null,
                contact_id: contactId || null,
                visit_type: visitType as any,
                scheduled_date: scheduledDate,
                notes: notes || undefined,
            });
            if ('error' in res) { setError(res.error); return; }
            setShowCreate(false);
            setOrgId(''); setSiteId(''); setContactId('');
            setVisitType('inspection'); setNotes('');
            router.refresh();
        });
    };

    const handleComplete = (id: string) => {
        startTransition(async () => {
            await completeMaintenanceVisit(id);
            router.refresh();
        });
    };

    const handleCancel = (id: string) => {
        startTransition(async () => {
            await cancelMaintenanceVisit(id);
            router.refresh();
        });
    };

    const inputCls = 'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1">
                    {STATUS_TABS.map((s) => (
                        <button
                            key={s}
                            onClick={() => setTab(s)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded ${
                                tab === s ? 'bg-black text-white' : 'bg-neutral-100 text-neutral-600'
                            }`}
                        >
                            {s === 'all' ? 'All' : s.replace('_', ' ')}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                    <Plus size={14} /> new visit
                </button>
            </div>

            {showCreate && (
                <Card className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold">Schedule a maintenance visit</h3>
                        <button onClick={() => setShowCreate(false)} className="text-neutral-400 hover:text-black"><X size={16} /></button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Client *</label>
                            <select value={orgId} onChange={(e) => { setOrgId(e.target.value); setSiteId(''); setContactId(''); }} className={inputCls}>
                                <option value="">— select —</option>
                                {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Type</label>
                            <select value={visitType} onChange={(e) => setVisitType(e.target.value)} className={inputCls}>
                                {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                            </select>
                        </div>
                        {orgId && (
                            <>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">Site</label>
                                    <select value={siteId} onChange={(e) => setSiteId(e.target.value)} className={inputCls}>
                                        <option value="">— none —</option>
                                        {orgSites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">Contact</label>
                                    <select value={contactId} onChange={(e) => setContactId(e.target.value)} className={inputCls}>
                                        <option value="">— none —</option>
                                        {orgContacts.map((c) => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                                    </select>
                                </div>
                            </>
                        )}
                        <div>
                            <label className="text-xs font-medium text-neutral-600">Scheduled date *</label>
                            <input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} className={inputCls} />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-medium text-neutral-600">Notes</label>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputCls} placeholder="e.g. annual sign inspection, check illumination" />
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex justify-end">
                        <button onClick={handleCreate} disabled={pending} className="btn-primary inline-flex items-center gap-2">
                            {pending && <Loader2 size={14} className="animate-spin" />} schedule visit
                        </button>
                    </div>
                </Card>
            )}

            {filteredVisits.length === 0 ? (
                <Card>
                    <p className="text-sm text-neutral-500 text-center py-8">
                        No {tab === 'all' ? '' : tab.replace('_', ' ') + ' '}maintenance visits.
                    </p>
                </Card>
            ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200 text-left">
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Type</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Client</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Site</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Scheduled</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">Notes</th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {filteredVisits.map((v) => (
                                <tr key={v.id} className="hover:bg-neutral-50">
                                    <td className="px-4 py-3">
                                        <span className="text-xs font-semibold uppercase tracking-wider px-2 py-0.5 rounded bg-neutral-100 text-neutral-700">
                                            {TYPE_LABELS[v.visit_type] ?? v.visit_type}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3 text-xs font-medium">{v.org_name ?? '—'}</td>
                                    <td className="px-4 py-3 text-xs text-neutral-600">{v.site_name ?? '—'}</td>
                                    <td className="px-4 py-3 text-xs">{v.scheduled_date}</td>
                                    <td className="px-4 py-3">
                                        <Chip variant={STATUS_VARIANTS[v.status] ?? 'draft'}>
                                            {v.status.replace('_', ' ')}
                                        </Chip>
                                    </td>
                                    <td className="px-4 py-3 text-xs text-neutral-500 max-w-[200px] truncate" title={v.notes ?? ''}>
                                        {v.notes ?? '—'}
                                    </td>
                                    <td className="px-4 py-3">
                                        {v.status === 'scheduled' || v.status === 'in_progress' ? (
                                            <div className="flex gap-1">
                                                <button
                                                    onClick={() => handleComplete(v.id)}
                                                    disabled={pending}
                                                    className="p-1 text-green-700 hover:bg-green-50 rounded"
                                                    title="Complete"
                                                >
                                                    <CheckCircle size={16} />
                                                </button>
                                                <button
                                                    onClick={() => handleCancel(v.id)}
                                                    disabled={pending}
                                                    className="p-1 text-red-700 hover:bg-red-50 rounded"
                                                    title="Cancel"
                                                >
                                                    <XCircle size={16} />
                                                </button>
                                            </div>
                                        ) : null}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
