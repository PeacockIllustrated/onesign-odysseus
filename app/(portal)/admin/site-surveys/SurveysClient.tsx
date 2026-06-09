'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X, Camera, Ruler } from 'lucide-react';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { createSurvey } from '@/lib/site-surveys/actions';
import {
    SURVEY_STATUS_LABELS,
    type SurveyListItem,
    type SurveyStatus,
} from '@/lib/site-surveys/types';

interface Props {
    initialSurveys: SurveyListItem[];
    orgs: { id: string; name: string }[];
    contacts: { id: string; org_id: string; first_name: string; last_name: string }[];
    sites: { id: string; org_id: string; name: string }[];
}

const STATUS_VARIANTS: Record<SurveyStatus, 'draft' | 'approved'> = {
    draft: 'draft',
    completed: 'approved',
};

const TABS = ['all', 'draft', 'completed'] as const;

export function SurveysClient({ initialSurveys, orgs, contacts, sites }: Props) {
    const router = useRouter();
    const [tab, setTab] = useState<string>('all');
    const [showCreate, setShowCreate] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [orgId, setOrgId] = useState('');
    const [clientName, setClientName] = useState('');
    const [siteId, setSiteId] = useState('');
    const [siteAddress, setSiteAddress] = useState('');
    const [contactId, setContactId] = useState('');
    const [title, setTitle] = useState('');
    const [surveyDate, setSurveyDate] = useState(
        new Date().toISOString().slice(0, 10),
    );

    const orgContacts = orgId ? contacts.filter((c) => c.org_id === orgId) : [];
    const orgSites = orgId ? sites.filter((s) => s.org_id === orgId) : [];

    const filtered =
        tab === 'all'
            ? initialSurveys
            : initialSurveys.filter((s) => s.status === tab);

    const handleCreate = () => {
        if (!orgId && !clientName.trim()) {
            setError('pick a client or enter a client name');
            return;
        }
        setError(null);
        startTransition(async () => {
            const res = await createSurvey({
                org_id: orgId || null,
                site_id: siteId || null,
                contact_id: contactId || null,
                client_name: clientName || '',
                site_address: siteAddress || '',
                title: title || '',
                survey_date: surveyDate,
            });
            if (!res.ok) {
                setError(res.error);
                return;
            }
            router.push(`/admin/site-surveys/${res.data.id}`);
        });
    };

    const inputCls =
        'w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black';

    return (
        <div className="mt-4 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1">
                    {TABS.map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded ${
                                tab === t
                                    ? 'bg-black text-white'
                                    : 'bg-neutral-100 text-neutral-600'
                            }`}
                        >
                            {t === 'all' ? 'All' : SURVEY_STATUS_LABELS[t as SurveyStatus]}
                        </button>
                    ))}
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className="btn-primary inline-flex items-center gap-2 text-sm"
                >
                    <Plus size={14} /> new survey
                </button>
            </div>

            {showCreate && (
                <Card className="space-y-3">
                    <div className="flex justify-between items-center">
                        <h3 className="text-sm font-bold">Start a site survey</h3>
                        <button
                            onClick={() => setShowCreate(false)}
                            className="text-neutral-400 hover:text-black"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Client (existing)
                            </label>
                            <select
                                value={orgId}
                                onChange={(e) => {
                                    setOrgId(e.target.value);
                                    setSiteId('');
                                    setContactId('');
                                }}
                                className={inputCls}
                            >
                                <option value="">— none / prospect —</option>
                                {orgs.map((o) => (
                                    <option key={o.id} value={o.id}>
                                        {o.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Client name {orgId ? '(override)' : '(if not listed)'}
                            </label>
                            <input
                                value={clientName}
                                onChange={(e) => setClientName(e.target.value)}
                                className={inputCls}
                                placeholder="e.g. Slick Construction"
                            />
                        </div>
                        {orgId && (
                            <>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">
                                        Site
                                    </label>
                                    <select
                                        value={siteId}
                                        onChange={(e) => setSiteId(e.target.value)}
                                        className={inputCls}
                                    >
                                        <option value="">— none —</option>
                                        {orgSites.map((s) => (
                                            <option key={s.id} value={s.id}>
                                                {s.name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-medium text-neutral-600">
                                        Contact
                                    </label>
                                    <select
                                        value={contactId}
                                        onChange={(e) => setContactId(e.target.value)}
                                        className={inputCls}
                                    >
                                        <option value="">— none —</option>
                                        {orgContacts.map((c) => (
                                            <option key={c.id} value={c.id}>
                                                {c.first_name} {c.last_name}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </>
                        )}
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Site address {orgId ? '(if no site record)' : ''}
                            </label>
                            <input
                                value={siteAddress}
                                onChange={(e) => setSiteAddress(e.target.value)}
                                className={inputCls}
                                placeholder="e.g. 14 High St, Gateshead NE8"
                            />
                        </div>
                        <div>
                            <label className="text-xs font-medium text-neutral-600">
                                Survey date *
                            </label>
                            <input
                                type="date"
                                value={surveyDate}
                                onChange={(e) => setSurveyDate(e.target.value)}
                                className={inputCls}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className="text-xs font-medium text-neutral-600">
                                Title
                            </label>
                            <input
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className={inputCls}
                                placeholder="e.g. Frontage signage survey"
                            />
                        </div>
                    </div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    <div className="flex justify-end">
                        <button
                            onClick={handleCreate}
                            disabled={pending}
                            className="btn-primary inline-flex items-center gap-2"
                        >
                            {pending && <Loader2 size={14} className="animate-spin" />}
                            create &amp; open
                        </button>
                    </div>
                </Card>
            )}

            {filtered.length === 0 ? (
                <Card>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="w-12 h-12 rounded-full bg-neutral-100 flex items-center justify-center mb-3">
                            <Ruler size={22} className="text-neutral-400" />
                        </div>
                        <p className="text-sm text-neutral-500">
                            No {tab === 'all' ? '' : tab + ' '}surveys yet.
                        </p>
                    </div>
                </Card>
            ) : (
                <div className="border border-neutral-200 rounded-lg overflow-hidden bg-white">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="bg-neutral-50 border-b border-neutral-200 text-left">
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                                    Reference
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                                    Client
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                                    Site
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                                    Date
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                                    Items
                                </th>
                                <th className="px-4 py-3 text-xs font-semibold text-neutral-600 uppercase tracking-wider">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {filtered.map((s) => (
                                <tr
                                    key={s.id}
                                    className="hover:bg-neutral-50 cursor-pointer"
                                    onClick={() =>
                                        router.push(`/admin/site-surveys/${s.id}`)
                                    }
                                >
                                    <td className="px-4 py-3">
                                        <div className="text-xs font-mono font-semibold">
                                            {s.reference}
                                        </div>
                                        {s.title && (
                                            <div className="text-xs text-neutral-500">
                                                {s.title}
                                            </div>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs font-medium">
                                        {s.org_name ?? s.client_name ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs text-neutral-600 max-w-[220px] truncate">
                                        {s.site_name ?? s.site_address ?? '—'}
                                    </td>
                                    <td className="px-4 py-3 text-xs">{s.survey_date}</td>
                                    <td className="px-4 py-3 text-xs text-neutral-600">
                                        <span className="inline-flex items-center gap-2">
                                            {s.item_count}
                                            {s.photo_count > 0 && (
                                                <span className="inline-flex items-center gap-0.5 text-neutral-400">
                                                    <Camera size={12} /> {s.photo_count}
                                                </span>
                                            )}
                                        </span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <Chip variant={STATUS_VARIANTS[s.status]}>
                                            {SURVEY_STATUS_LABELS[s.status]}
                                        </Chip>
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
