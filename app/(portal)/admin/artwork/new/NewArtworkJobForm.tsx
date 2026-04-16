'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createArtworkJob } from '@/lib/artwork/actions';
import { CreateOrgModal, CreatedOrg } from '@/app/(portal)/admin/orgs/CreateOrgModal';
import { Plus } from 'lucide-react';

interface Props {
    orgs: { id: string; name: string }[];
    items: { id: string; label: string }[];
    contacts: { id: string; org_id: string; first_name: string; last_name: string }[];
    sites: { id: string; org_id: string; name: string }[];
}

export function NewArtworkJobForm({ orgs: initialOrgs, items, contacts, sites }: Props) {
    const [orgs, setOrgs] = useState(initialOrgs);
    const [jobName, setJobName] = useState('');
    const [orgId, setOrgId] = useState('');
    const [contactId, setContactId] = useState('');
    const [siteId, setSiteId] = useState('');
    const [jobItemId, setJobItemId] = useState('');
    const [description, setDescription] = useState('');
    const [linkToProduction, setLinkToProduction] = useState(false);
    const [pending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [orgModalOpen, setOrgModalOpen] = useState(false);
    const router = useRouter();

    const handleOrgCreated = (newOrg?: CreatedOrg) => {
        if (!newOrg) return;
        setOrgs((prev) => [{ id: newOrg.id, name: newOrg.name }, ...prev]);
        setOrgId(newOrg.id);
    };

    // Filter contacts + sites to the selected org.
    const orgContacts = orgId ? contacts.filter((c) => c.org_id === orgId) : [];
    const orgSites = orgId ? sites.filter((s) => s.org_id === orgId) : [];

    const submit = () => {
        setError(null);
        if (!jobName.trim()) {
            setError('job name is required');
            return;
        }
        if (linkToProduction && !jobItemId) {
            setError('select a production item to link, or untick the option');
            return;
        }

        startTransition(async () => {
            const input = linkToProduction && jobItemId
                ? {
                      kind: 'linked' as const,
                      job_name: jobName,
                      job_item_id: jobItemId,
                      description: description || undefined,
                  }
                : {
                      kind: 'orphan' as const,
                      job_name: jobName,
                      org_id: orgId || undefined,
                      contact_id: contactId || undefined,
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
            {/* Job name — always required */}
            <div>
                <label className="text-xs font-medium uppercase text-neutral-500">job name *</label>
                <input
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                    value={jobName}
                    onChange={(e) => setJobName(e.target.value)}
                    placeholder="e.g. fascia signage"
                />
            </div>

            {/* Client — optional but encouraged */}
            <div>
                <div className="flex items-center justify-between">
                    <label className="text-xs font-medium uppercase text-neutral-500">client</label>
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
                    onChange={(e) => {
                        setOrgId(e.target.value);
                        setContactId('');
                        setSiteId('');
                    }}
                >
                    <option value="">— none (standalone job) —</option>
                    {orgs.map((o) => (
                        <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                </select>
            </div>

            {/* Contact + site — appear once a client is selected */}
            {orgId && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label className="text-xs font-medium uppercase text-neutral-500">contact</label>
                        <select
                            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                            value={contactId}
                            onChange={(e) => setContactId(e.target.value)}
                        >
                            <option value="">— none —</option>
                            {orgContacts.map((c) => (
                                <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                            ))}
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-medium uppercase text-neutral-500">site / address</label>
                        <select
                            className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded"
                            value={siteId}
                            onChange={(e) => setSiteId(e.target.value)}
                        >
                            <option value="">— none —</option>
                            {orgSites.map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                        </select>
                    </div>
                </div>
            )}

            {/* Description */}
            <div>
                <label className="text-xs font-medium uppercase text-neutral-500">description</label>
                <textarea
                    className="mt-1 w-full px-3 py-2 border border-neutral-200 rounded focus:outline-none focus:ring-2 focus:ring-black"
                    rows={3}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                />
            </div>

            {/* Optional: link to a production item */}
            <div className="p-3 bg-neutral-50 border border-neutral-200 rounded space-y-3">
                <label className="flex items-start gap-2 text-sm text-neutral-700 cursor-pointer">
                    <input
                        type="checkbox"
                        className="mt-0.5"
                        checked={linkToProduction}
                        onChange={(e) => {
                            setLinkToProduction(e.target.checked);
                            if (!e.target.checked) setJobItemId('');
                        }}
                    />
                    <span>
                        <span className="font-medium">link to a production item</span>
                        <span className="text-neutral-500"> — connect this artwork job to an existing production job item</span>
                    </span>
                </label>

                {linkToProduction && (
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
                                no unlinked production items available.
                            </p>
                        )}
                    </div>
                )}
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
