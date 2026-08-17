'use client';

import type { FittingJobView, Lane, ProjectManager } from '@/lib/schedule/types';
import { JobCard } from './JobCard';
import { DropZone } from './DropZone';

interface Props {
    lane: Lane;
    title: string;
    jobs: FittingJobView[];
    empty: string;
    note: string;
    pms: ProjectManager[];
    readOnly: boolean;
    onOpenJob: (id: string) => void;
    onAdd: (lane: Lane) => void;
    onPullQuote?: () => void;
}

/**
 * The sticky notes parked round the edge of the physical board. Both panels
 * look and behave identically — dragging a card out schedules it, dragging one
 * in unschedules it into that lane.
 */
export function HoldingPanel({
    lane,
    title,
    jobs,
    empty,
    note,
    pms,
    readOnly,
    onOpenJob,
    onAdd,
    onPullQuote,
}: Props) {
    const pmById = new Map(pms.map((p) => [p.id, p]));

    return (
        <section className="sb-holding">
            <div className="sb-bhead">
                <b>{title}</b>
                <span className="cnt">{jobs.length}</span>
            </div>

            <DropZone target={{ kind: 'holding', lane }} className="sb-backloglist">
                {jobs.map((j) => (
                    <JobCard
                        key={j.id}
                        job={j}
                        pm={j.pm_id ? pmById.get(j.pm_id) ?? null : null}
                        readOnly={readOnly}
                        onOpen={onOpenJob}
                    />
                ))}
                {jobs.length === 0 && <div className="sb-bempty">{empty}</div>}
            </DropZone>

            {!readOnly && (
                <div className="sb-bactions">
                    <button onClick={() => onAdd(lane)}>+ add job</button>
                    {onPullQuote && <button onClick={onPullQuote}>from a quote</button>}
                </div>
            )}
            <div className="sb-bnote">{note}</div>
        </section>
    );
}
