'use client';

import { useState, useEffect, useMemo } from 'react';
import { createBrowserClient, type Deliverable, type DeliverableUpdate, type DeliverableStatus } from '@/lib/supabase';
import { PageHeader, Card, Chip, EmptyState, Modal } from '@/app/(portal)/components/ui';
import { MessageSquare, Calendar, Send, ChevronDown, ArrowRight, Check, Clock, Eye, AlertCircle } from 'lucide-react';

type StatusFilter = 'all' | DeliverableStatus;

// Next action labels per status
const NEXT_ACTIONS: Record<DeliverableStatus, { label: string; icon: typeof ArrowRight; color: string }> = {
    draft: { label: 'Submit for Review', icon: ArrowRight, color: 'text-amber-600' },
    review: { label: 'Awaiting Approval', icon: Eye, color: 'text-blue-600' },
    approved: { label: 'Ready to Schedule', icon: Clock, color: 'text-green-600' },
    scheduled: { label: 'Mark Complete', icon: Check, color: 'text-emerald-600' },
    done: { label: 'Completed', icon: Check, color: 'text-neutral-400' },
};

// Get available months for filtering
function getMonthOptions(): { value: string; label: string }[] {
    const months = [];
    const now = new Date();
    // Current month and 5 previous months
    for (let i = 0; i < 6; i++) {
        const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push({
            value: date.toISOString().split('T')[0],
            label: date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
        });
    }
    return months;
}

export default function DeliverablesPage() {
    const [deliverables, setDeliverables] = useState<Deliverable[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
    const [monthFilter, setMonthFilter] = useState<string>(() => {
        // Default to current month
        const now = new Date();
        return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    });
    const [selectedDeliverable, setSelectedDeliverable] = useState<Deliverable | null>(null);
    const [updates, setUpdates] = useState<DeliverableUpdate[]>([]);
    const [newComment, setNewComment] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);

    const monthOptions = useMemo(() => getMonthOptions(), []);

    useEffect(() => {
        loadDeliverables();
        checkAdminStatus();
    }, [monthFilter]);

    async function checkAdminStatus() {
        const supabase = createBrowserClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { data: profile } = await supabase
                .from('profiles')
                .select('role')
                .eq('id', user.id)
                .single();
            setIsAdmin(profile?.role === 'super_admin');
        }
    }

    async function loadDeliverables() {
        setLoading(true);
        const supabase = createBrowserClient();
        const { data } = await supabase
            .from('deliverables')
            .select('*')
            .eq('month', monthFilter)
            .order('category', { ascending: true })
            .order('title', { ascending: true });

        setDeliverables(data || []);
        setLoading(false);
    }

    async function loadUpdates(deliverableId: string) {
        const supabase = createBrowserClient();
        const { data } = await supabase
            .from('deliverable_updates')
            .select('*')
            .eq('deliverable_id', deliverableId)
            .order('created_at', { ascending: true });

        setUpdates(data || []);
    }

    async function handleOpenDeliverable(deliverable: Deliverable) {
        setSelectedDeliverable(deliverable);
        await loadUpdates(deliverable.id);
    }

    async function handleAddComment() {
        if (!selectedDeliverable || !newComment.trim()) return;

        setSubmitting(true);
        const supabase = createBrowserClient();

        await supabase
            .from('deliverable_updates')
            .insert({
                deliverable_id: selectedDeliverable.id,
                comment: newComment.trim(),
            });

        setNewComment('');
        await loadUpdates(selectedDeliverable.id);
        setSubmitting(false);
    }

    async function handleStatusChange(newStatus: DeliverableStatus) {
        if (!selectedDeliverable) return;

        setSubmitting(true);
        const supabase = createBrowserClient();

        // Update deliverable status
        const { error } = await supabase
            .from('deliverables')
            .update({ status: newStatus, updated_at: new Date().toISOString() })
            .eq('id', selectedDeliverable.id);

        if (!error) {
            // Log the status change
            await supabase
                .from('deliverable_updates')
                .insert({
                    deliverable_id: selectedDeliverable.id,
                    comment: `Status changed to ${newStatus}`,
                    status_change: newStatus,
                });

            // Refresh data
            await loadDeliverables();
            await loadUpdates(selectedDeliverable.id);
            setSelectedDeliverable({ ...selectedDeliverable, status: newStatus });
        }

        setSubmitting(false);
    }

    const filteredDeliverables = statusFilter === 'all'
        ? deliverables
        : deliverables.filter((d) => d.status === statusFilter);

    const statusFilters: { value: StatusFilter; label: string }[] = [
        { value: 'all', label: 'All' },
        { value: 'draft', label: 'Draft' },
        { value: 'review', label: 'In Review' },
        { value: 'approved', label: 'Approved' },
        { value: 'scheduled', label: 'Scheduled' },
        { value: 'done', label: 'Done' },
    ];

    // Group deliverables by category
    const groupedDeliverables = useMemo(() => {
        const grouped: Record<string, Deliverable[]> = {};
        filteredDeliverables.forEach(d => {
            const cat = d.category || 'other';
            if (!grouped[cat]) grouped[cat] = [];
            grouped[cat].push(d);
        });
        return grouped;
    }, [filteredDeliverables]);

    const categoryLabels: Record<string, string> = {
        creative: 'Creative',
        campaign: 'Campaign Management',
        reporting: 'Reporting',
        support: 'Support',
        other: 'Other',
    };

    // Calculate stats
    const stats = useMemo(() => ({
        total: deliverables.length,
        done: deliverables.filter(d => d.status === 'done').length,
        pending: deliverables.filter(d => d.status !== 'done').length,
    }), [deliverables]);

    const selectedMonthLabel = monthOptions.find(m => m.value === monthFilter)?.label || '';

    return (
        <div>
            <PageHeader
                title="Deliverables"
                description="Track and review your monthly deliverables"
            />

            {/* Month selector and stats */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                <div className="relative">
                    <select
                        value={monthFilter}
                        onChange={(e) => setMonthFilter(e.target.value)}
                        className="appearance-none bg-white border border-neutral-200 rounded-[var(--radius-sm)] px-4 py-2 pr-10 text-sm font-medium text-neutral-900 focus:outline-none focus:ring-2 focus:ring-black cursor-pointer"
                    >
                        {monthOptions.map((m) => (
                            <option key={m.value} value={m.value}>{m.label}</option>
                        ))}
                    </select>
                    <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" />
                </div>

                {stats.total > 0 && (
                    <div className="flex items-center gap-4 text-xs text-neutral-500">
                        <span>{stats.done}/{stats.total} complete</span>
                        <div className="w-24 h-1.5 bg-neutral-100 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-emerald-500 transition-all duration-300"
                                style={{ width: `${(stats.done / stats.total) * 100}%` }}
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Status filter tabs */}
            <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
                {statusFilters.map((s) => (
                    <button
                        key={s.value}
                        onClick={() => setStatusFilter(s.value)}
                        className={`px-3 py-1.5 text-xs font-medium rounded-[var(--radius-sm)] whitespace-nowrap transition-colors ${statusFilter === s.value
                            ? 'bg-black text-white'
                            : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                            }`}
                    >
                        {s.label}
                        {s.value !== 'all' && (
                            <span className="ml-1.5 opacity-60">
                                {deliverables.filter(d => d.status === s.value).length}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Deliverables list */}
            {loading ? (
                <div className="text-center py-12 text-sm text-neutral-500">Loading...</div>
            ) : filteredDeliverables.length === 0 ? (
                <Card>
                    <EmptyState
                        type="deliverables"
                        title="No deliverables"
                        description={statusFilter === 'all'
                            ? `No deliverables for ${selectedMonthLabel}. Admin can generate them from the admin panel.`
                            : `No deliverables with status "${statusFilter}".`}
                    />
                </Card>
            ) : (
                <div className="space-y-6">
                    {Object.entries(groupedDeliverables).map(([category, items]) => (
                        <div key={category}>
                            <h3 className="text-xs font-medium text-neutral-500 uppercase tracking-wide mb-3">
                                {categoryLabels[category] || category}
                            </h3>
                            <div className="space-y-2">
                                {items.map((d) => {
                                    const nextAction = NEXT_ACTIONS[d.status];
                                    const NextIcon = nextAction.icon;
                                    return (
                                        <Card
                                            key={d.id}
                                            className="cursor-pointer hover:border-neutral-300 transition-colors"
                                        >
                                            <div
                                                onClick={() => handleOpenDeliverable(d)}
                                                className="flex items-center justify-between gap-4"
                                            >
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="text-sm font-medium text-neutral-900 truncate">{d.title}</h4>
                                                    {d.description && (
                                                        <p className="text-xs text-neutral-500 truncate mt-0.5">{d.description}</p>
                                                    )}
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    {/* Next action indicator */}
                                                    <span className={`hidden sm:flex items-center gap-1 text-xs ${nextAction.color}`}>
                                                        <NextIcon size={12} />
                                                        {nextAction.label}
                                                    </span>
                                                    <Chip variant={d.status}>
                                                        {d.status}
                                                    </Chip>
                                                </div>
                                            </div>
                                        </Card>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Deliverable detail modal */}
            <Modal
                open={!!selectedDeliverable}
                onClose={() => setSelectedDeliverable(null)}
                title={selectedDeliverable?.title || 'Deliverable'}
            >
                {selectedDeliverable && (
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <Chip variant={selectedDeliverable.status}>
                                {selectedDeliverable.status}
                            </Chip>
                            {selectedDeliverable.category && (
                                <span className="text-xs text-neutral-400">
                                    {categoryLabels[selectedDeliverable.category]}
                                </span>
                            )}
                        </div>

                        {selectedDeliverable.description && (
                            <p className="text-sm text-neutral-600 mb-4">{selectedDeliverable.description}</p>
                        )}

                        {selectedDeliverable.due_date && (
                            <p className="text-xs text-neutral-500 mb-4 flex items-center gap-1">
                                <Calendar size={12} />
                                Due: {new Date(selectedDeliverable.due_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                        )}

                        {/* Status actions */}
                        <div className="border-t border-neutral-200 pt-4 mt-4">
                            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">Actions</h4>
                            <div className="flex flex-wrap gap-2 mb-4">
                                {/* Client can request changes when in review */}
                                {selectedDeliverable.status === 'review' && !isAdmin && (
                                    <button
                                        onClick={() => {
                                            setNewComment('Request changes: ');
                                        }}
                                        className="btn-secondary text-xs flex items-center gap-1"
                                    >
                                        <AlertCircle size={12} />
                                        Request Changes
                                    </button>
                                )}

                                {/* Admin status progression */}
                                {isAdmin && (
                                    <>
                                        {selectedDeliverable.status === 'draft' && (
                                            <button
                                                onClick={() => handleStatusChange('review')}
                                                disabled={submitting}
                                                className="btn-primary text-xs"
                                            >
                                                Submit for Review
                                            </button>
                                        )}
                                        {selectedDeliverable.status === 'review' && (
                                            <>
                                                <button
                                                    onClick={() => handleStatusChange('approved')}
                                                    disabled={submitting}
                                                    className="btn-primary text-xs"
                                                >
                                                    Approve
                                                </button>
                                                <button
                                                    onClick={() => handleStatusChange('draft')}
                                                    disabled={submitting}
                                                    className="btn-secondary text-xs"
                                                >
                                                    Request Revisions
                                                </button>
                                            </>
                                        )}
                                        {selectedDeliverable.status === 'approved' && (
                                            <button
                                                onClick={() => handleStatusChange('scheduled')}
                                                disabled={submitting}
                                                className="btn-primary text-xs"
                                            >
                                                Mark Scheduled
                                            </button>
                                        )}
                                        {selectedDeliverable.status === 'scheduled' && (
                                            <button
                                                onClick={() => handleStatusChange('done')}
                                                disabled={submitting}
                                                className="btn-primary text-xs"
                                            >
                                                Mark Complete
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Comment thread */}
                        <div className="border-t border-neutral-200 pt-4 mt-4">
                            <h4 className="text-xs font-medium text-neutral-500 uppercase mb-3">
                                Activity ({updates.length})
                            </h4>

                            {updates.length === 0 ? (
                                <p className="text-xs text-neutral-400 mb-4">No activity yet.</p>
                            ) : (
                                <div className="space-y-3 mb-4 max-h-48 overflow-y-auto">
                                    {updates.map((u) => (
                                        <div key={u.id} className={`rounded-[var(--radius-sm)] p-3 ${u.status_change ? 'bg-blue-50 border border-blue-100' : 'bg-neutral-50'}`}>
                                            {u.status_change && (
                                                <p className="text-xs font-medium text-blue-700 mb-1">
                                                    Status → {u.status_change}
                                                </p>
                                            )}
                                            {u.comment && <p className="text-sm text-neutral-700">{u.comment}</p>}
                                            <p className="text-xs text-neutral-400 mt-1">
                                                {new Date(u.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {/* Add comment */}
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newComment}
                                    onChange={(e) => setNewComment(e.target.value)}
                                    placeholder="Add a comment..."
                                    className="flex-1 px-3 py-2 border border-neutral-200 rounded-[var(--radius-sm)] text-sm focus:outline-none focus:ring-2 focus:ring-black"
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddComment()}
                                />
                                <button
                                    onClick={handleAddComment}
                                    disabled={submitting || !newComment.trim()}
                                    className="btn-primary px-3"
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </Modal>
        </div>
    );
}

