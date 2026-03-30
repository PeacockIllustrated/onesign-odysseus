// app/(portal)/admin/jobs/JobCard.tsx
'use client';

import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle } from 'lucide-react';
import type { JobWithStage } from '@/lib/production/types';
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

interface JobCardProps {
    job: JobWithStage;
    onClick: () => void;
}

export function JobCard({ job, onClick }: JobCardProps) {
    const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
        id: job.id,
    });

    const style = {
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 50 : undefined,
    };

    const overdue = isJobOverdue(job.due_date);

    return (
        <div
            ref={setNodeRef}
            style={style}
            {...listeners}
            {...attributes}
            onClick={isDragging ? undefined : onClick}
            className={`
                bg-white rounded-[var(--radius-sm)] border-l-4 border border-neutral-200
                ${PRIORITY_BORDER[job.priority]}
                shadow-sm hover:shadow-md transition-all cursor-pointer select-none p-3
                ${isDragging ? 'rotate-1 shadow-lg' : ''}
            `}
        >
            <div className="flex items-start justify-between gap-2 mb-1">
                <code className="text-[10px] font-mono text-[#4e7e8c] font-semibold tracking-tight">
                    {job.job_number}
                </code>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                    {job.priority !== 'normal' && job.priority !== 'low' && (
                        <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${PRIORITY_LABEL[job.priority]}`}>
                            {job.priority}
                        </span>
                    )}
                    {job.assigned_initials && (
                        <div className="w-5 h-5 rounded-full bg-[#4e7e8c] flex items-center justify-center">
                            <span className="text-[9px] text-white font-bold leading-none">
                                {job.assigned_initials}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            <p className="text-sm font-semibold text-neutral-900 leading-tight mb-0.5 truncate">
                {job.client_name}
            </p>
            <p className="text-xs text-neutral-500 leading-snug mb-2 line-clamp-2">
                {job.title}
            </p>

            <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] text-neutral-400">
                    {job.total_items} item{job.total_items !== 1 ? 's' : ''}
                </span>
                {job.due_date && (
                    <span className={`text-[10px] flex items-center gap-0.5 ${
                        overdue ? 'text-red-600 font-semibold' : 'text-neutral-400'
                    }`}>
                        {overdue && <AlertCircle size={10} />}
                        {formatDueDate(job.due_date)}
                    </span>
                )}
            </div>
        </div>
    );
}
