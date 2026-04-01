// app/(portal)/admin/jobs/ClientGroupCard.tsx
// Grouped Kanban card: one card per client, sub-grouped by job, compact item rows.
// Each item row is individually draggable for the Kanban board.
'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle } from 'lucide-react';
import type { JobItemWithJob } from '@/lib/production/types';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';

const PRIORITY_ORDER: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
const PRIORITY_LABEL: Record<string, string> = {
    urgent: 'bg-red-50 text-red-700',
    high: 'bg-amber-50 text-amber-700',
};
const PRIORITY_BORDER: Record<string, string> = {
    urgent: 'border-l-red-500',
    high: 'border-l-amber-400',
    normal: 'border-l-neutral-200',
    low: 'border-l-neutral-100',
};

interface ClientGroupCardProps {
    clientName: string;
    items: JobItemWithJob[];
    onCardClick: (id: string) => void;
}

export function ClientGroupCard({ clientName, items, onCardClick }: ClientGroupCardProps) {
    // Group items by job
    const jobGroups = new Map<string, { jobNumber: string; priority: string; dueDate: string | null; items: JobItemWithJob[] }>();
    for (const item of items) {
        const jid = item.job.id;
        if (!jobGroups.has(jid)) {
            jobGroups.set(jid, {
                jobNumber: item.job.job_number,
                priority: item.job.priority,
                dueDate: item.job.due_date,
                items: [],
            });
        }
        jobGroups.get(jid)!.items.push(item);
    }

    // Highest priority across all items
    const topPriority = items.reduce(
        (best, i) => (PRIORITY_ORDER[i.job.priority] ?? 2) < (PRIORITY_ORDER[best] ?? 2) ? i.job.priority : best,
        'normal' as string
    );

    // Any overdue?
    const anyOverdue = items.some(i => isJobOverdue(i.job.due_date));

    const jobs = Array.from(jobGroups.entries());
    const isSingleItem = items.length === 1;

    // Single item: render as a compact standalone card (no grouping overhead)
    if (isSingleItem) {
        const item = items[0];
        return <SingleItemCard item={item} onClick={() => onCardClick(item.id)} />;
    }

    return (
        <div className={`
            bg-white rounded-[var(--radius-sm)] border-l-4 border border-neutral-200
            ${PRIORITY_BORDER[topPriority]}
            shadow-sm transition-all
        `}>
            {/* Client header */}
            <div className="px-3 pt-2.5 pb-1.5 flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-neutral-900 leading-tight truncate">
                        {clientName}
                    </p>
                    <span className="text-[10px] text-neutral-400">
                        {items.length} item{items.length !== 1 ? 's' : ''}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {topPriority !== 'normal' && topPriority !== 'low' && (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORITY_LABEL[topPriority] || ''}`}>
                            {topPriority}
                        </span>
                    )}
                    {anyOverdue && (
                        <AlertCircle size={12} className="text-red-500" />
                    )}
                </div>
            </div>

            {/* Job sub-groups */}
            {jobs.map(([jobId, group], groupIdx) => (
                <div key={jobId}>
                    {/* Job sub-header (only show if multiple jobs) */}
                    {jobs.length > 1 && (
                        <div className="px-3 pt-1.5 pb-0.5">
                            <code className="text-[9px] font-mono text-[#4e7e8c]/70 font-semibold tracking-tight">
                                {group.jobNumber}
                            </code>
                        </div>
                    )}
                    {/* If single job, show job number inline */}
                    {jobs.length === 1 && (
                        <div className="px-3 pb-0.5">
                            <code className="text-[10px] font-mono text-[#4e7e8c] font-semibold tracking-tight">
                                {group.jobNumber}
                            </code>
                        </div>
                    )}

                    {/* Compact item rows */}
                    <div className={`${groupIdx < jobs.length - 1 ? 'border-b border-neutral-100' : ''}`}>
                        {group.items.map(item => (
                            <CompactItemRow
                                key={item.id}
                                item={item}
                                showDueDate={group.items.indexOf(item) === 0}
                                dueDate={group.dueDate}
                                onClick={() => onCardClick(item.id)}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* Padding at bottom */}
            <div className="h-1" />
        </div>
    );
}

/** Compact row for an item inside a group — individually draggable */
function CompactItemRow({
    item,
    showDueDate,
    dueDate,
    onClick,
}: {
    item: JobItemWithJob;
    showDueDate: boolean;
    dueDate: string | null;
    onClick: () => void;
}) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.25 : 1,
        zIndex: isDragging ? 50 : undefined,
    };

    const routingLen = item.stage_routing.length;
    const currentIdx = routingLen > 0 ? item.stage_routing.indexOf(item.current_stage_id ?? '') : -1;
    const MAX_DOTS = 6;
    const dotsToShow = Math.min(routingLen, MAX_DOTS);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={isDragging ? undefined : onClick}
            className={`
                flex items-center gap-2 px-3 py-1.5 cursor-pointer select-none
                hover:bg-[#4e7e8c]/5 transition-colors
                ${isDragging ? 'bg-neutral-50 shadow-sm rounded' : ''}
            `}
        >
            {/* Item letter */}
            <code className="text-[10px] font-mono text-[#4e7e8c] font-bold w-3 flex-shrink-0">
                {item.item_number || '·'}
            </code>

            {/* Description */}
            <span className="flex-1 text-xs text-neutral-600 truncate leading-tight">
                {item.description}
            </span>

            {/* Routing dots */}
            {routingLen > 0 && (
                <div className="flex items-center gap-px flex-shrink-0">
                    {Array.from({ length: dotsToShow }).map((_, i) => (
                        <div
                            key={i}
                            className={`w-1 h-1 rounded-full ${
                                i < currentIdx ? 'bg-neutral-300' :
                                i === currentIdx ? 'bg-[#4e7e8c]' :
                                'bg-neutral-200'
                            }`}
                        />
                    ))}
                </div>
            )}

            {/* Due date (only on first row of each job group) */}
            {showDueDate && dueDate && (
                <span className={`text-[9px] flex-shrink-0 ${
                    isJobOverdue(dueDate) ? 'text-red-600 font-semibold' : 'text-neutral-400'
                }`}>
                    {formatDueDate(dueDate)}
                </span>
            )}
        </div>
    );
}

/** Single item: renders as a full card (same as the old ItemCard) but slightly more compact */
function SingleItemCard({ item, onClick }: { item: JobItemWithJob; onClick: () => void }) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
    };

    const overdue = isJobOverdue(item.job.due_date);
    const routingLen = item.stage_routing.length;
    const currentIdx = routingLen > 0 ? item.stage_routing.indexOf(item.current_stage_id ?? '') : -1;
    const MAX_DOTS = 8;
    const dotsToShow = Math.min(routingLen, MAX_DOTS);
    const extraDots = routingLen > MAX_DOTS ? routingLen - MAX_DOTS : 0;

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={isDragging ? undefined : onClick}
            className={`
                bg-white rounded-[var(--radius-sm)] border-l-4 border border-neutral-200
                ${PRIORITY_BORDER[item.job.priority]}
                shadow-sm hover:shadow-md transition-all cursor-pointer select-none p-3
                ${isDragging ? 'rotate-1 shadow-lg' : ''}
            `}
        >
            <div className="flex items-start justify-between gap-2 mb-1">
                <code className="text-[10px] font-mono text-[#4e7e8c] font-semibold tracking-tight leading-tight">
                    {item.job.job_number}{item.item_number ? ` · ${item.item_number}` : ''}
                </code>
                {item.job.priority !== 'normal' && item.job.priority !== 'low' && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_LABEL[item.job.priority] || ''}`}>
                        {item.job.priority}
                    </span>
                )}
            </div>
            <p className="text-sm font-semibold text-neutral-900 leading-tight mb-0.5 truncate">
                {item.job.client_name}
            </p>
            <p className="text-xs text-neutral-500 leading-snug mb-2 line-clamp-2">
                {item.description}
            </p>
            <div className="flex items-center justify-between gap-2">
                {routingLen > 0 ? (
                    <div className="flex items-center gap-0.5">
                        {Array.from({ length: dotsToShow }).map((_, i) => (
                            <div
                                key={i}
                                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                                    i < currentIdx ? 'bg-neutral-300' :
                                    i === currentIdx ? 'bg-[#4e7e8c]' :
                                    'bg-neutral-200'
                                }`}
                            />
                        ))}
                        {extraDots > 0 && (
                            <span className="text-[9px] text-neutral-400 ml-0.5">+{extraDots}</span>
                        )}
                    </div>
                ) : (
                    <span className="text-[10px] text-neutral-300">no routing</span>
                )}
                {item.job.due_date && (
                    <span className={`text-[10px] flex items-center gap-0.5 flex-shrink-0 ${
                        overdue ? 'text-red-600 font-semibold' : 'text-neutral-400'
                    }`}>
                        {overdue && <AlertCircle size={10} />}
                        {formatDueDate(item.job.due_date)}
                    </span>
                )}
            </div>
        </div>
    );
}
