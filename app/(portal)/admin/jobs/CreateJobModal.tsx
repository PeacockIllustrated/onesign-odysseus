// app/(portal)/admin/jobs/CreateJobModal.tsx
'use client';

import { useState, useEffect } from 'react';
import { X, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import {
    createManualJob,
    createJobFromQuote,
    getAcceptedQuotesAction,
    getOrgListAction,
    getProductionStagesAction,
    getQuoteItemsForRoutingAction,
} from '@/lib/production/actions';
import type { ProductionStage } from '@/lib/production/types';

interface CreateJobModalProps {
    open: boolean;
    onClose: () => void;
}

type Tab = 'manual' | 'from-quote';

export function CreateJobModal({ open, onClose }: CreateJobModalProps) {
    const router = useRouter();
    const [tab, setTab] = useState<Tab>('manual');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Shared state
    const [orgId, setOrgId] = useState('');
    const [orgs, setOrgs] = useState<Array<{ id: string; name: string }>>([]);

    // Manual form state
    const [title, setTitle] = useState('');
    const [clientName, setClientName] = useState('');
    const [description, setDescription] = useState('');
    const [priority, setPriority] = useState<'urgent' | 'high' | 'normal' | 'low'>('normal');
    const [dueDate, setDueDate] = useState('');
    const [assignedInitials, setAssignedInitials] = useState('');

    // Quote tab state
    const [quotes, setQuotes] = useState<Array<{ id: string; quote_number: string; customer_name: string | null }>>([]);
    const [selectedQuoteId, setSelectedQuoteId] = useState('');
    const [quotesLoading, setQuotesLoading] = useState(false);

    // Routing state
    const [stages, setStages] = useState<ProductionStage[]>([]);
    const [quoteItems, setQuoteItems] = useState<Array<{ id: string; description: string }>>([]);
    const [loadingItems, setLoadingItems] = useState(false);
    const [itemRoutings, setItemRoutings] = useState<Map<string, Set<string>>>(new Map());

    // Fetch orgs, quotes, and stages when modal opens
    useEffect(() => {
        if (!open) return;

        getOrgListAction().then(setOrgs);
        getProductionStagesAction().then(setStages);

        setQuotesLoading(true);
        getAcceptedQuotesAction().then(q => {
            setQuotes(q);
            setQuotesLoading(false);
        });
    }, [open]);

    // Fetch quote items + set default routings when a quote is selected
    useEffect(() => {
        if (!selectedQuoteId) {
            setQuoteItems([]);
            setItemRoutings(new Map());
            return;
        }
        setLoadingItems(true);
        getQuoteItemsForRoutingAction(selectedQuoteId).then(items => {
            setQuoteItems(items);
            // Default: all non-approval, non-order-book, non-goods-out stages selected
            const defaultRoutings = new Map<string, Set<string>>();
            items.forEach(item => {
                defaultRoutings.set(
                    item.id,
                    new Set(
                        stages
                            .filter(s => !s.is_approval_stage && s.slug !== 'order-book' && s.slug !== 'goods-out')
                            .map(s => s.id)
                    )
                );
            });
            setItemRoutings(defaultRoutings);
            setLoadingItems(false);
        });
    }, [selectedQuoteId, stages]);

    // Reset form when closed
    useEffect(() => {
        if (!open) {
            setTitle('');
            setClientName('');
            setDescription('');
            setPriority('normal');
            setDueDate('');
            setAssignedInitials('');
            setOrgId('');
            setSelectedQuoteId('');
            setQuoteItems([]);
            setItemRoutings(new Map());
            setError(null);
            setTab('manual');
        }
    }, [open]);

    async function handleManualSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!title.trim() || !clientName.trim() || !orgId) return;
        setSubmitting(true);
        setError(null);

        const result = await createManualJob({
            orgId,
            title: title.trim(),
            clientName: clientName.trim(),
            description: description.trim() || undefined,
            priority,
            dueDate: dueDate || undefined,
            assignedInitials: assignedInitials.trim() || undefined,
        });

        setSubmitting(false);
        if ('error' in result) {
            setError(result.error);
        } else {
            onClose();
            router.refresh();
        }
    }

    async function handleFromQuoteSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedQuoteId || !orgId) return;
        setSubmitting(true);
        setError(null);

        const routingPayload = quoteItems.map(item => ({
            quoteItemId: item.id,
            stageIds: Array.from(itemRoutings.get(item.id) ?? []),
            description: item.description,
        }));

        const result = await createJobFromQuote(
            selectedQuoteId,
            orgId,
            routingPayload.length > 0 ? routingPayload : undefined
        );

        setSubmitting(false);
        if ('error' in result) {
            setError(result.error);
        } else {
            onClose();
            router.refresh();
        }
    }

    if (!open) return null;

    // Stages shown as checkboxes (exclude order-book and goods-out — always auto-included)
    const routingStages = stages.filter(s => s.slug !== 'order-book' && s.slug !== 'goods-out');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50" onClick={onClose} />
            <div className="relative bg-white rounded-[var(--radius-md)] shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
                <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-200">
                    <h2 className="text-sm font-semibold text-neutral-900">New Production Job</h2>
                    <button onClick={onClose} className="text-neutral-400 hover:text-neutral-700 transition-colors">
                        <X size={18} />
                    </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-neutral-200">
                    {(['manual', 'from-quote'] as Tab[]).map(t => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`flex-1 py-2.5 text-xs font-medium transition-colors ${
                                tab === t
                                    ? 'border-b-2 border-[#4e7e8c] text-[#4e7e8c]'
                                    : 'text-neutral-500 hover:text-neutral-700'
                            }`}
                        >
                            {t === 'manual' ? 'Manual' : 'From Accepted Quote'}
                        </button>
                    ))}
                </div>

                <div className="p-5">
                    {error && (
                        <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2 mb-4">
                            {error}
                        </p>
                    )}

                    {/* Org picker (shared) */}
                    <div className="mb-4">
                        <label className="block text-xs font-medium text-neutral-700 mb-1">Client Org *</label>
                        <select
                            value={orgId}
                            onChange={e => setOrgId(e.target.value)}
                            required
                            className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                        >
                            <option value="">Select org…</option>
                            {orgs.map(o => (
                                <option key={o.id} value={o.id}>{o.name}</option>
                            ))}
                        </select>
                    </div>

                    {tab === 'manual' ? (
                        <form onSubmit={handleManualSubmit} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">Job Title *</label>
                                <input
                                    type="text"
                                    value={title}
                                    onChange={e => setTitle(e.target.value)}
                                    required
                                    placeholder="e.g. Plot signage — Whitburn Meadows Ph.3"
                                    className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">Client Name *</label>
                                <input
                                    type="text"
                                    value={clientName}
                                    onChange={e => setClientName(e.target.value)}
                                    required
                                    placeholder="e.g. Persimmon Homes"
                                    className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Priority</label>
                                    <select
                                        value={priority}
                                        onChange={e => setPriority(e.target.value as typeof priority)}
                                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                    >
                                        <option value="urgent">Urgent</option>
                                        <option value="high">High</option>
                                        <option value="normal">Normal</option>
                                        <option value="low">Low</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">Assignee Initials</label>
                                    <input
                                        type="text"
                                        value={assignedInitials}
                                        onChange={e => setAssignedInitials(e.target.value.toUpperCase().slice(0, 3))}
                                        maxLength={3}
                                        placeholder="MP"
                                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-neutral-700 mb-1">Due Date</label>
                                <input
                                    type="date"
                                    value={dueDate}
                                    onChange={e => setDueDate(e.target.value)}
                                    className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                />
                            </div>
                            <button
                                type="submit"
                                disabled={submitting || !title.trim() || !clientName.trim() || !orgId}
                                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] disabled:opacity-50 rounded-[var(--radius-sm)] transition-colors"
                            >
                                {submitting && <Loader2 size={14} className="animate-spin" />}
                                Create Job
                            </button>
                        </form>
                    ) : (
                        <form onSubmit={handleFromQuoteSubmit} className="space-y-4">
                            {quotesLoading ? (
                                <p className="text-sm text-neutral-500 text-center py-4">Loading quotes…</p>
                            ) : quotes.length === 0 ? (
                                <p className="text-sm text-neutral-500 text-center py-4">
                                    No accepted quotes without existing jobs.
                                </p>
                            ) : (
                                <div>
                                    <label className="block text-xs font-medium text-neutral-700 mb-1">
                                        Select Quote *
                                    </label>
                                    <select
                                        value={selectedQuoteId}
                                        onChange={e => setSelectedQuoteId(e.target.value)}
                                        required
                                        className="w-full text-sm border border-neutral-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#4e7e8c]"
                                    >
                                        <option value="">Select a quote…</option>
                                        {quotes.map(q => (
                                            <option key={q.id} value={q.id}>
                                                {q.quote_number} — {q.customer_name || 'No name'}
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            {/* Department routing — shown once a quote is selected */}
                            {loadingItems && (
                                <p className="text-xs text-neutral-500 text-center py-2 flex items-center justify-center gap-1.5">
                                    <Loader2 size={12} className="animate-spin" /> Loading items…
                                </p>
                            )}

                            {!loadingItems && quoteItems.length > 0 && routingStages.length > 0 && (
                                <div>
                                    <p className="text-xs font-semibold text-neutral-600 uppercase mb-2">
                                        Department Routing
                                    </p>
                                    <p className="text-[11px] text-neutral-500 mb-3">
                                        Order Book and Goods Out are always included. Choose which departments each item will visit.
                                    </p>
                                    <div className="space-y-3">
                                        {quoteItems.map(item => {
                                            const routing = itemRoutings.get(item.id) ?? new Set<string>();
                                            return (
                                                <div
                                                    key={item.id}
                                                    className="border border-neutral-200 rounded p-3"
                                                >
                                                    <p className="text-xs font-semibold text-neutral-800 mb-2">
                                                        {item.description}
                                                    </p>
                                                    <div className="flex flex-wrap gap-1.5">
                                                        {routingStages.map(stage => (
                                                            <label
                                                                key={stage.id}
                                                                className="flex items-center gap-1 cursor-pointer"
                                                            >
                                                                <input
                                                                    type="checkbox"
                                                                    checked={routing.has(stage.id)}
                                                                    onChange={e => {
                                                                        const next = new Map(itemRoutings);
                                                                        const stageSet = new Set(next.get(item.id) ?? []);
                                                                        if (e.target.checked) stageSet.add(stage.id);
                                                                        else stageSet.delete(stage.id);
                                                                        next.set(item.id, stageSet);
                                                                        setItemRoutings(next);
                                                                    }}
                                                                    className="rounded"
                                                                />
                                                                <span
                                                                    className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                                                                    style={{
                                                                        color: stage.color,
                                                                        backgroundColor: `${stage.color}18`,
                                                                    }}
                                                                >
                                                                    {stage.name}
                                                                </span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={submitting || !selectedQuoteId || !orgId || quotes.length === 0}
                                className="w-full flex items-center justify-center gap-2 py-2 text-sm font-medium text-white bg-[#4e7e8c] hover:bg-[#3a5f6a] disabled:opacity-50 rounded-[var(--radius-sm)] transition-colors"
                            >
                                {submitting && <Loader2 size={14} className="animate-spin" />}
                                Convert to Production Job
                            </button>
                        </form>
                    )}
                </div>
            </div>
        </div>
    );
}
