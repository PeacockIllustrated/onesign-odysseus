// app/(portal)/admin/jobs/JobCard.tsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle } from 'lucide-react';
import type { JobItemWithJob } from '@/lib/production/types';
import { isJobOverdue, formatDueDate } from '@/lib/production/utils';

const PRIORITY_BORDER: Record<string, string> = {
    urgent: 'border-l-red-500',
    high: 'border-l-amber-400',
    normal: 'border-l-neutral-200',
    low: 'border-l-neutral-100',
};
const PRIORITY_LABEL: Record<string, string> = {
    urgent: 'bg-red-50 text-red-700',
    high: 'bg-amber-50 text-amber-700',
    normal: '',
    low: '',
};

interface ItemCardProps {
    item: JobItemWithJob;
    onClick: () => void;
}

export function ItemCard({ item, onClick }: ItemCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
    const style = { transform: CSS.Translate.toString(transform), opacity: isDragging ? 0.4 : 1, zIndex: isDragging ? 50 : undefined };

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
            {/* Top row: job+item ref + priority badge */}
            <div className="flex items-start justify-between gap-2 mb-1">
                <code className="text-[10px] font-mono text-[#4e7e8c] font-semibold tracking-tight leading-tight">
                    {item.job.job_number}{item.item_number ? ` · ${item.item_number}` : ''}
                </code>
                {item.job.priority !== 'normal' && item.job.priority !== 'low' && (
                    <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded flex-shrink-0 ${PRIORITY_LABEL[item.job.priority]}`}>
                        {item.job.priority}
                    </span>
                )}
            </div>

            {/* Client name */}
            <p className="text-sm font-semibold text-neutral-900 leading-tight mb-0.5 truncate">
                {item.job.client_name}
            </p>

            {/* Item description */}
            <p className="text-xs text-neutral-500 leading-snug mb-2 line-clamp-2">
                {item.description}
            </p>

            {/* Bottom row: routing dots + due date */}
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
