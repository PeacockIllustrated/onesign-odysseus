'use client';

import { useDraggable } from '@dnd-kit/core';
import type { FittingJobView, ProjectManager } from '@/lib/schedule/types';
import { jobCustomer, jobExtra, jobMeta } from '@/lib/schedule/utils';

interface Props {
    job: FittingJobView;
    pm: ProjectManager | null;
    /** Month view renders a one-line chip instead of a full card. */
    compact?: boolean;
    /** All-day work spans the cell, over where AM and PM would be. */
    allDay?: boolean;
    readOnly?: boolean;
    onOpen: (id: string) => void;
}

export function JobCard({ job, pm, compact, allDay, readOnly, onOpen }: Props) {
    const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
        id: job.id,
        disabled: readOnly,
    });

    const customer = jobCustomer(job);
    // The PM's hex drives the card's fill, border and text via color-mix in
    // the stylesheet, so a PM added next year needs no new CSS.
    const style = { ['--sb-pm' as string]: pm?.colour ?? 'var(--sb-line2)' };
    const title = pm ? `${customer} · PM: ${pm.name}` : customer;

    if (compact) {
        return (
            <button
                ref={setNodeRef}
                {...listeners}
                {...attributes}
                style={style}
                title={title}
                onClick={() => onOpen(job.id)}
                className={`sb-chip ${job.done ? 'done' : ''} ${isDragging ? 'dragsrc' : ''}`}
            >
                {job.done ? '✓ ' : ''}
                {customer}
            </button>
        );
    }

    const meta = jobMeta(job);
    const extra = jobExtra(job);

    return (
        <button
            ref={setNodeRef}
            {...listeners}
            {...attributes}
            style={style}
            title={title}
            onClick={() => onOpen(job.id)}
            className={`sb-card ${job.done ? 'done' : ''} ${allDay ? 'allday' : ''} ${
                isDragging ? 'dragsrc' : ''
            }`}
        >
            {allDay && <span className="sb-alldaytag">all day</span>}
            <div className="top">
                <span className="name">{customer}</span>
                {job.done && <span className="fitted">✓ fitted</span>}
                {!job.done && job.delivery_required && (
                    <span className="sb-delmark" title="Materials to be delivered ahead of the fit">
                        del
                    </span>
                )}
            </div>
            {meta.length > 0 && (
                <div className="meta">
                    {meta.map((m) => (
                        <span key={m}>{m}</span>
                    ))}
                </div>
            )}
            {extra && <div className="extra">{extra}</div>}
        </button>
    );
}
