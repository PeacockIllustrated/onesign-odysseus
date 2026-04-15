'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createArtworkJob } from '@/lib/artwork/actions';
import { CreateOrgModal, CreatedOrg } from '@/app/(portal)/admin/orgs/CreateOrgModal';
import { Plus } from 'lucide-react';

interface Props {
    orgs: { id: string; name: string }[];
    items: { id: string; label: string }[];
}

export function NewArtworkJobForm({ orgs: initialOrgs, items }: Props) {
    const [orgs, setOrgs] = useState(initialOrgs);
    const [mode, setMode] = useState<'linked' | 'orphan'>('linked');
    const [jobName, setJobName] = useState('');
    const [jobItemId, setJobItemId] = useState('');
    const [orgId, setOrgId] = useState('');
    const [description, setDescription] = useState('');
    const [acknowledge, setAcknowledge] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [orgModalOpen, setOrgModalOpen] = useState(false);
    const router = useRouter();

    const handleOrgCreated = (newOrg?: CreatedOrg) => {
        if (!newOrg) return;
        // Prepend to the list and auto-select — user can create and move on in one click.
        setOrgs((prev) => [{ id: newOrg.id, name: newOrg.name }, ...prev]);
        setOrgId(newOrg.id);
    };

    const submit = () => {
        setError(null);
        if (!jobName.trim()) {
            setError('job name is required');
            return;
        }
        if (mode === 'linked' && !jobItemId) {
            setError('select a production item');
            return;
        }
        if (mode === 'orphan') {
            if (!orgId) {
                setError('select an organisation');
                return;
            }
            if (!acknowledge) {
                setError('tick the acknowledgement to create an orphan job');
                return;
            }
        }

        startTransition(async () => {
            const input =
                mode === 'linked'
                    ? {
                          kind: 'linked' as const,
                          job_name: jobName,
                          job_item_id: jobItemId,
                          description: description || undefined,
                      }
                    : {
                          kind: 'orphan' as const,
                          job_name: jobName,
                          org_id: orgId,
                          description: description || undefined,
                          acknowledge_orphan: true as const,
                      };
            const res = await createArtworkJob(input);
            if ('error' in res) setError(res.error);
            else router.push(`/admin/artwork/${res.id}`);
        });
    };

    return (
        <div className="space-y-4">
            <div className="flex gap-2">
                <button
                    type="button"
                    className={`px-3 py-1.5 text-sm rounded ${mode === 'linked' ? 'bg-black text-white' : 'bg-neutral-100'}`}
                    onClick={() => setMode('linked')}
                >
                    from production item
                </button>
                <button
                    type="button"
                    className={`px-3 py-1.5 text-sm rounded ${mode === 'orphan' ? 'bg-black text-white' : 'bg-neutral-100'}`}
                    onClick={() => setMode('orphan')}
                >
                    orphan (warranty / rework)
                </button>
            </div>

            <div>
                <label className="text-xs font-medium uppercase text-neutral-500">job name</label>
                <input
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                />
            </div>

            {mode === 'linked' ? (
                <div>
                    <label className="text-xs font-medium uppercase text-neutral-500">production item</label>
                    <select
                        className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                        value={jobItemId}
                        onChange={(e) => setJobItemId(e.target.value)}
                    >
                        <option value="">— select —</option>
                        {items.map((i) => (
                            <option key={i.id} value={i.id}>{i.label}</option>
                        ))}
                    </select>
                    {items.length === 0 && (
                        <p className="mt-1 text-xs text-neutral-500">
                            no unlinked production items available. switch to orphan mode for warranty/rework.
                        </p>
                    )}
                </div>
            ) : (
                <>
                    <div>
                        <div className="flex items-center justify-between">
                            <label className="text-xs font-medium uppercase text-neutral-500">organisation</label>
                            <button
                                type="button"
                                onClick={() => setOrgModalOpen(true)}
                                className="inline-flex items-center gap-1 text-xs font-medium text-[#4e7e8c] hover:underline"
                            >
                                <Plus size={12} />
                                new client
                            </button>
                        </div>
                        <select
                            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                            value={orgId}
                            onChange={(e) => setOrgId(e.target.value)}
                        >
                            <option value="">— select —</option>
                            {orgs.map((o) => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                    </div>
                    <label className="flex items-start gap-2 text-sm text-neutral-700">
                        <input
                            type="checkbox"
                            checked={acknowledge}
                            onChange={(e) => setAcknowledge(e.target.checked)}
                            className="mt-0.5"
                        />
                        <span>
                            I understand this job has no production link. It will not appear in
                            the production pipeline and must be manually released.
                        </span>
                    </label>
                </>
            )}

            <div>
                <label className="text-xs font-medium uppercase text-neutral-500">description</label>
                <textarea
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <div className="flex justify-end">
                <button className="btn-primary" disabled={pending} onClick={submit}>
                    {pending ? 'creating…' : 'create job'}
                </button>
            </div>

            <CreateOrgModal
                open={orgModalOpen}
                onClose={() => setOrgModalOpen(false)}
                onSuccess={handleOrgCreated}
            />
        </div>
    );
}
