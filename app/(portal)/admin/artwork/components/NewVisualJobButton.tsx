'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Loader2, X } from 'lucide-react';
import { createVisualApprovalJob } from '@/lib/artwork/visual-approval-actions';

interface OrgOption {
    id: string;
    name: string;
}

interface Props {
    orgs: OrgOption[];
    defaultOrgId?: string;
    defaultQuoteId?: string;
    buttonLabel?: string;
}

export function NewVisualJobButton({ orgs, defaultOrgId, defaultQuoteId, buttonLabel }: Props) {
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);

    const [jobName, setJobName] = useState('');
    const [description, setDescription] = useState('');
    const [orgId, setOrgId] = useState<string>(defaultOrgId ?? '');

    const submit = () => {
        if (!jobName.trim()) {
            setError('name is required');
            return;
        }
        setError(null);
        startTransition(async () => {
            const res = await createVisualApprovalJob({
                jobName: jobName.trim(),
                description: description.trim() || undefined,
                orgId: orgId || undefined,
                quoteId: defaultQuoteId,
            });
            if ('error' in res) {
                setError(res.error);
                return;
            }
            setOpen(false);
            router.push(`/admin/artwork/${res.id}`);
        });
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="btn-secondary inline-flex items-center gap-2"
            >
                <Plus size={14} />
                {buttonLabel ?? 'New visual for approval'}
            </button>

            {open && (
                <div
                    className="fixed inset-0 z-40 bg-black/50 flex items-end sm:items-center justify-center"
                    onClick={() => setOpen(false)}
                >
                    <div
                        className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-5 space-y-3"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-bold">New visual for approval</h3>
                            <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 text-neutral-500 hover:text-neutral-900">
                                <X size={18} />
                            </button>
                        </div>

                        <label className="block">
                            <span className="block text-xs font-semibold text-neutral-700 mb-1">Name *</span>
                            <input
                                value={jobName}
                                onChange={(e) => setJobName(e.target.value)}
                                placeholder='e.g. "Test-O&apos;s fascia concepts"'
                                className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                            />
                        </label>

                        <label className="block">
                            <span className="block text-xs font-semibold text-neutral-700 mb-1">Client (optional)</span>
                            <select
                                value={orgId}
                                onChange={(e) => setOrgId(e.target.value)}
                                className="w-full text-sm border border-neutral-300 rounded px-3 py-2"
                            >
                                <option value="">— none (prospecting visual) —</option>
                                {orgs.map((o) => (
                                    <option key={o.id} value={o.id}>{o.name}</option>
                                ))}
                            </select>
                        </label>

                        <label className="block">
                            <span className="block text-xs font-semibold text-neutral-700 mb-1">Description (optional)</span>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                rows={3}
                                className="w-full text-sm border border-neutral-300 rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-black"
                            />
                        </label>

                        {defaultQuoteId && (
                            <p className="text-[11px] text-neutral-500">Will be linked to the current quote.</p>
                        )}

                        {error && (
                            <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-800">{error}</div>
                        )}

                        <button
                            type="button"
                            onClick={submit}
                            disabled={pending}
                            className="btn-primary w-full inline-flex items-center justify-center gap-2"
                        >
                            {pending && <Loader2 size={16} className="animate-spin" />}
                            Create visual
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
