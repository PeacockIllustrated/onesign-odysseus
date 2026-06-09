'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, Camera, Ruler } from 'lucide-react';
import { createSurvey } from '@/lib/site-surveys/actions';
import {
    SURVEY_STATUS_LABELS,
    type SurveyListItem,
    type SurveyStatus,
} from '@/lib/site-surveys/types';
import { panelCls, primaryBtnCls } from './ui';

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

export function SurveysClient({
    initialSurveys,
}: {
    initialSurveys: SurveyListItem[];
}) {
    const router = useRouter();
    const [tab, setTab] = useState<string>('all');
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const filtered =
        tab === 'all'
            ? initialSurveys
            : initialSurveys.filter((s) => s.status === tab);

    // One tap: make a draft and drop straight into it.
    const startSurvey = () => {
        setError(null);
        startTransition(async () => {
            const res = await createSurvey({
                survey_date: new Date().toISOString().slice(0, 10),
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
                    onClick={startSurvey}
                    disabled={pending}
                    className={primaryBtnCls}
                >
                    {pending ? (
                        <Loader2 size={15} className="animate-spin" />
                    ) : (
                        <Plus size={15} />
                    )}
                    New survey
                </button>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            {filtered.length === 0 ? (
                <div className={`${panelCls} p-5`}>
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#e8f0f3]">
                            <Ruler size={22} className="text-[#4e7e8c]" />
                        </div>
                        <p className="mb-4 text-sm text-neutral-500">
                            No {tab === 'all' ? '' : tab + ' '}surveys yet.
                        </p>
                        <button
                            onClick={startSurvey}
                            disabled={pending}
                            className={primaryBtnCls}
                        >
                            <Plus size={15} /> New survey
                        </button>
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
                                    Date
                                </th>
                                <th className="px-4 py-3 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                    Photos
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
                                    <td className="px-4 py-3 text-xs">{s.survey_date}</td>
                                    <td className="px-4 py-3 text-xs text-neutral-600">
                                        <span className="inline-flex items-center gap-1">
                                            <Camera size={12} className="text-neutral-400" />
                                            {s.photo_count}
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
