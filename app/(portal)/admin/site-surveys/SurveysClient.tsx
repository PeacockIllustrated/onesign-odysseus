'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X, Camera, Ruler } from 'lucide-react';
import { createSurvey } from '@/lib/site-surveys/actions';
import {
    SURVEY_STATUS_LABELS,
    type SurveyListItem,
    type SurveyStatus,
} from '@/lib/site-surveys/types';
import {
    panelCls,
    labelCls,
    inputCls,
    primaryBtnCls,
} from './ui';

interface Props {
    initialSurveys: SurveyListItem[];
    orgs: { id: string; name: string }[];
    contacts: { id: string; org_id: string; first_name: string; last_name: string }[];
    sites: { id: string; org_id: string; name: string }[];
}

const TABS = ['all', 'draft', 'completed'] as const;

function StatusBadge({ status }: { status: SurveyStatus }) {
    const done = status === 'completed';
    return (
        <span
            className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                done
                    ? 'bg-[#e8f0f3] text-[#3a5f6a]'
                    : 'bg-neutral-100 text-neutral-600'
            }`}
        >
            {SURVEY_STATUS_LABELS[status]}
        </span>
    );
}

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

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex gap-1">
                    {TABS.map((t) => {
                        const active = tab === t;
                        return (
                            <button
                                key={t}
                                onClick={() => setTab(t)}
                                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                                    active
                                        ? 'bg-[#4e7e8c] text-white shadow-sm'
                                        : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                                }`}
                            >
                                {t === 'all'
                                    ? 'All'
                                    : SURVEY_STATUS_LABELS[t as SurveyStatus]}
                            </button>
                        );
                    })}
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    className={primaryBtnCls}
                >
                    <Plus size={15} /> New survey
                </button>
            </div>

            {showCreate && (
                <div className={`${panelCls} space-y-3 p-5`}>
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-bold tracking-tight">
                            Start a site survey
                        </h3>
                        <button
                            onClick={() => setShowCreate(false)}
                            className="text-neutral-400 hover:text-black"
                        >
                            <X size={16} />
                        </button>
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                            <label className={labelCls}>Client (existing)</label>
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
                            <label className={labelCls}>
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
                                    <label className={labelCls}>Site</label>
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
                                    <label className={labelCls}>Contact</label>
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
                            <label className={labelCls}>
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
                            <label className={labelCls}>Survey date *</label>
                            <input
                                type="date"
                                value={surveyDate}
                                onChange={(e) => setSurveyDate(e.target.value)}
                                className={inputCls}
                            />
                        </div>
                        <div className="sm:col-span-2">
                            <label className={labelCls}>Title</label>
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
                            className={primaryBtnCls}
                        >
                            {pending && <Loader2 size={14} className="animate-spin" />}
                            Create &amp; open
                        </button>
                    </div>
                </div>
            )}

            {filtered.length === 0 ? (
                <div className={`${panelCls} p-5`}>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f0f3]">
                            <Ruler size={22} className="text-[#4e7e8c]" />
                        </div>
                        <p className="text-sm text-neutral-500">
                            No {tab === 'all' ? '' : tab + ' '}surveys yet.
                        </p>
                    </div>
                </div>
            ) : (
                <div className={`${panelCls} overflow-hidden`}>
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-neutral-200 bg-neutral-50 text-left">
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                    Reference
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                    Client
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                    Site
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                    Date
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                    Items
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                    Status
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-neutral-100">
                            {filtered.map((s) => (
                                <tr
                                    key={s.id}
                                    className="cursor-pointer transition-colors hover:bg-[#f3f8fa]"
                                    onClick={() =>
                                        router.push(`/admin/site-surveys/${s.id}`)
                                    }
                                >
                                    <td className="px-4 py-3">
                                        <div className="font-mono text-xs font-semibold text-[#3a5f6a]">
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
                                    <td className="max-w-[220px] truncate px-4 py-3 text-xs text-neutral-600">
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
                                        <StatusBadge status={s.status} />
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
