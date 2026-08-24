'use client';

import type { FittingJobView, ProjectManager, Van } from '@/lib/schedule/types';
import {
    DAY_SHORT,
    addDaysISO,
    formatWC,
    fromISO,
    indexByDateAndVan,
    mondaysTouchingMonth,
    visibleMonthDayIndices,
} from '@/lib/schedule/utils';
import { JobCard } from './JobCard';
import { DropZone } from './DropZone';

interface Props {
    year: number;
    month: number;
    jobs: FittingJobView[];
    vans: Van[];
    pms: ProjectManager[];
    showWeekends: boolean;
    readOnly: boolean;
    onOpenJob: (id: string) => void;
    onJumpWeek: (monday: string) => void;
}

/**
 * Columns are every w/c touching the month, each split into narrow van
 * sub-columns; rows are weekdays. Jobs render as one-line chips — enough to
 * spot a clash from a month out, and still draggable.
 */
export function MonthView({
    year,
    month,
    jobs,
    vans,
    pms,
    showWeekends,
    readOnly,
    onOpenJob,
    onJumpWeek,
}: Props) {
    const mondays = mondaysTouchingMonth(year, month);
    const rows = visibleMonthDayIndices(mondays, jobs, showWeekends);
    const pmById = new Map(pms.map((p) => [p.id, p]));
    const index = indexByDateAndVan(jobs);

    return (
        <div className="sb-mwrap">
            <div
                className="sb-grid sb-mgrid"
                style={{
                    gridTemplateColumns: `105px repeat(${mondays.length}, 1fr)`,
                    ['--sb-vans' as string]: vans.length,
                }}
            >
                <div className="sb-hcell" style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <span
                        style={{
                            fontSize: '0.75rem',
                            color: 'var(--fg-subtle)',
                            fontWeight: 600,
                        }}
                    >
                        Days
                    </span>
                </div>

                {mondays.map((m) => (
                    <div key={m} className="sb-wchead">
                        <button className="wc" onClick={() => onJumpWeek(m)}>
                            w/c {formatWC(m)}
                        </button>
                        <div className="sb-subvans">
                            {vans.map((v) => (
                                <span key={v.id}>{v.name.replace(/^Van /i, 'V')}</span>
                            ))}
                        </div>
                    </div>
                ))}

                {rows.map((di) => (
                    <MonthRow
                        key={di}
                        dayIdx={di}
                        mondays={mondays}
                        month={month}
                        vans={vans}
                        index={index}
                        pmById={pmById}
                        readOnly={readOnly}
                        onOpenJob={onOpenJob}
                    />
                ))}
            </div>
        </div>
    );
}

interface RowProps {
    dayIdx: number;
    mondays: string[];
    month: number;
    vans: Van[];
    index: Map<string, FittingJobView[]>;
    pmById: Map<string, ProjectManager>;
    readOnly: boolean;
    onOpenJob: (id: string) => void;
}

function MonthRow({
    dayIdx,
    mondays,
    month,
    vans,
    index,
    pmById,
    readOnly,
    onOpenJob,
}: RowProps) {
    return (
        <>
            <div className={`sb-dcell ${dayIdx >= 5 ? 'wkend' : ''}`}>
                <div className="dname" style={{ fontSize: 12 }}>
                    {DAY_SHORT[dayIdx]}
                </div>
            </div>

            {mondays.map((m) => {
                const date = addDaysISO(m, dayIdx);
                // Days that spill outside the month still take drops — a week
                // straddling the boundary is one week to the office.
                const inMonth = fromISO(date).getMonth() === month;
                return (
                    <div key={m} className={`sb-mcell ${inMonth ? '' : 'out'}`}>
                        <div className="tri">
                            {vans.map((van) => (
                                <DropZone
                                    key={van.id}
                                    // Month drops change day, van and week but keep
                                    // the slot the job already had.
                                    target={{ kind: 'cell', date, vanId: van.id }}
                                    className="sb-vslot"
                                >
                                    {(index.get(`${date}|${van.id}`) ?? []).map((j) => (
                                        <JobCard
                                            key={j.id}
                                            job={j}
                                            pm={j.pm_id ? pmById.get(j.pm_id) ?? null : null}
                                            compact
                                            readOnly={readOnly}
                                            onOpen={onOpenJob}
                                        />
                                    ))}
                                </DropZone>
                            ))}
                        </div>
                    </div>
                );
            })}
        </>
    );
}
