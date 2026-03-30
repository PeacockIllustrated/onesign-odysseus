'use client';

import { useState } from 'react';
import { createBrowserClient, type Org, type Deliverable } from '@/lib/supabase';
import { Card, Chip } from '@/app/(portal)/components/ui';
import { GenerateDeliverablesModal } from './GenerateDeliverablesModal';
import { useRouter } from 'next/navigation';
import { Plus, GripVertical } from 'lucide-react';

interface DeliverablesClientProps {
    orgs: Org[];
    deliverables: (Deliverable & { org: Org })[];
    subscriptions: Record<string, string>;
}

const STATUS_COLUMNS = ['draft', 'review', 'approved', 'scheduled', 'done'] as const;
type Status = typeof STATUS_COLUMNS[number];

const statusVariants: Record<Status, 'draft' | 'review' | 'approved' | 'scheduled' | 'done'> = {
    draft: 'draft',
    review: 'review',
    approved: 'approved',
    scheduled: 'scheduled',
    done: 'done',
};

export function DeliverablesClient({ orgs, deliverables: initialDeliverables, subscriptions }: DeliverablesClientProps) {
    const router = useRouter();
    const [deliverables, setDeliverables] = useState(initialDeliverables);
    const [generateOpen, setGenerateOpen] = useState(false);
    const [filterOrgId, setFilterOrgId] = useState('');
    const [dragging, setDragging] = useState<string | null>(null);

    const filtered = filterOrgId
        ? deliverables.filter(d => d.org_id === filterOrgId)
        : deliverables;

    const byStatus = STATUS_COLUMNS.reduce((acc, status) => {
        acc[status] = filtered.filter(d => d.status === status);
        return acc;
    }, {} as Record<Status, typeof filtered>);

    function handleSuccess() {
        router.refresh();
    }

    async function handleDrop(deliverableId: string, newStatus: Status) {
        const supabase = createBrowserClient();

        // Optimistic update
        setDeliverables(prev => prev.map(d =>
            d.id === deliverableId ? { ...d, status: newStatus } : d
        ));

        await supabase
            .from('deliverables')
            .update({ status: newStatus })
            .eq('id', deliverableId);

        setDragging(null);
    }

    function handleDragStart(e: React.DragEvent, id: string) {
        e.dataTransfer.setData('text/plain', id);
        setDragging(id);
    }

    function handleDragOver(e: React.DragEvent) {
        e.preventDefault();
    }

    function handleDropEvent(e: React.DragEvent, status: Status) {
        e.preventDefault();
        const id = e.dataTransfer.getData('text/plain');
        if (id) handleDrop(id, status);
    }

    return (
        <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                <div className="flex gap-2 items-center">
                    <select
                        value={filterOrgId}
                        onChange={(e) => setFilterOrgId(e.target.value)}
                        className="px-3 py-1.5 text-sm border border-neutral-200 rounded-md bg-white"
                    >
                        <option value="">All organisations</option>
                        {orgs.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>
                <button onClick={() => setGenerateOpen(true)} className="btn-primary flex items-center gap-2 shrink-0">
                    <Plus size={16} />
                    Generate Monthly
                </button>
            </div>

            {/* Kanban Board */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
                {STATUS_COLUMNS.map(status => (
                    <div
                        key={status}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDropEvent(e, status)}
                        className={`
                            bg-neutral-50 rounded-lg p-3 min-h-[400px]
                            ${dragging ? 'border-2 border-dashed border-neutral-300' : ''}
                        `}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <Chip variant={statusVariants[status]}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </Chip>
                            <span className="text-xs text-neutral-400">{byStatus[status].length}</span>
                        </div>

                        <div className="space-y-2">
                            {byStatus[status].map(d => (
                                <div
                                    key={d.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, d.id)}
                                    className={`
                                        bg-white rounded-md p-3 shadow-sm border border-neutral-100
                                        cursor-grab active:cursor-grabbing
                                        hover:shadow-md transition-shadow
                                        ${dragging === d.id ? 'opacity-50' : ''}
                                    `}
                                >
                                    <div className="flex items-start gap-2">
                                        <GripVertical size={14} className="text-neutral-300 mt-0.5 flex-shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium text-neutral-900 truncate">{d.title}</p>
                                            <p className="text-xs text-neutral-500 mt-1">{d.org?.name || '—'}</p>
                                            {d.category && (
                                                <span className="inline-block mt-1 text-[10px] px-1.5 py-0.5 bg-neutral-100 rounded text-neutral-500">
                                                    {d.category}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>

            <GenerateDeliverablesModal
                orgs={orgs}
                subscriptions={subscriptions}
                open={generateOpen}
                onClose={() => setGenerateOpen(false)}
                onSuccess={handleSuccess}
            />
        </>
    );
}

