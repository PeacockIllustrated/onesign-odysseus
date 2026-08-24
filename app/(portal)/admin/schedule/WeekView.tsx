'use client';

import type { ReactNode } from 'react';
import type {
    DayCrewOverrideRow,
    DefaultCrewRow,
    Fitter,
    FittingJobView,
    ProjectManager,
    Slot,
    Van,
} from '@/lib/schedule/types';
import {
    DAY_NAMES,
    cellJobs,
    crewLabel,
    crewWarning,
    dayIndex,
    formatWC,
    resolveDay,
    toISO,
    visibleWeekDays,
} from '@/lib/schedule/utils';
import { JobCard } from './JobCard';
import { DropZone } from './DropZone';

interface Props {
    monday: string;
    jobs: FittingJobView[];
    vans: Van[];
    fitters: Fitter[];
    pms: ProjectManager[];
    defaultCrew: DefaultCrewRow[];
    overrides: DayCrewOverrideRow[];
    showWeekends: boolean;
    readOnly: boolean;
    tv: boolean;
    onOpenJob: (id: string) => void;
    onAddJob: (date: string, vanId: string, slot: Slot) => void;
    onEditCrew: (date: string) => void;
}

export function WeekView({
    monday,
    jobs,
    vans,
    fitters,
    pms,
    defaultCrew,
    overrides,
    showWeekends,
    readOnly,
    tv,
    onOpenJob,
    onAddJob,
    onEditCrew,
}: Props) {
    const days = visibleWeekDays(monday, jobs, showWeekends);
    const today = toISO(new Date());
    const pmById = new Map(pms.map((p) => [p.id, p]));
    const fitterById = new Map(fitters.map((f) => [f.id, f]));

    // The column header shows each van's standing pairing; per-day changes
    // surface on the day row and in the affected cell rather than up here.
    const standingCrew = resolveDay(monday, vans, fitters, defaultCrew, []);

    return (
        <div
            className="sb-grid"
            style={{
                // The day column carries the date, a crew-change tag and the
                // crew button, so it needs more room than a date alone.
                gridTemplateColumns: `${tv ? '11rem' : '9.5rem'} repeat(${vans.length}, 1fr)`,
            }}
        >
            <div className="sb-hcell" />
            {vans.map((v) => (
                <div key={v.id} className="sb-hcell">
                    <div className="van">{v.name}</div>
                    <div className="crew">
                        {crewLabel(standingCrew.crews[v.id] ?? [], fitters)}
                    </div>
                </div>
            ))}

            {days.map((date) => {
                const di = dayIndex(date);
                const day = resolveDay(date, vans, fitters, defaultCrew, overrides);
                const holidayNames = day.holiday
                    .map((id) => fitterById.get(id)?.name)
                    .filter((n): n is string => !!n);

                return (
                    <DayRow
                        key={date}
                        date={date}
                        dayName={DAY_NAMES[di]}
                        weekend={di >= 5}
                        isToday={date === today}
                        override={day.override}
                        holidayNames={holidayNames}
                        crews={day.crews}
                        vans={vans}
                        fitters={fitters}
                        jobs={jobs}
                        pmById={pmById}
                        readOnly={readOnly}
                        onOpenJob={onOpenJob}
                        onAddJob={onAddJob}
                        onEditCrew={onEditCrew}
                    />
                );
            })}
        </div>
    );
}

interface DayRowProps {
    date: string;
    dayName: string;
    weekend: boolean;
    isToday: boolean;
    override: boolean;
    holidayNames: string[];
    crews: Record<string, string[]>;
    vans: Van[];
    fitters: Fitter[];
    jobs: FittingJobView[];
    pmById: Map<string, ProjectManager>;
    readOnly: boolean;
    onOpenJob: (id: string) => void;
    onAddJob: (date: string, vanId: string, slot: Slot) => void;
    onEditCrew: (date: string) => void;
}

function DayRow({
    date,
    dayName,
    weekend,
    isToday,
    override,
    holidayNames,
    crews,
    vans,
    fitters,
    jobs,
    pmById,
    readOnly,
    onOpenJob,
    onAddJob,
    onEditCrew,
}: DayRowProps) {
    return (
        <>
            <div className={`sb-dcell ${isToday ? 'today' : ''} ${weekend ? 'wkend' : ''}`}>
                <div className="dname">{dayName}</div>
                <div className="ddate">{formatWC(date)}</div>
                {override && <span className="sb-daytag">Crew change</span>}
                {holidayNames.length > 0 && (
                    <span className="sb-holtag">On holiday: {holidayNames.join(', ')}</span>
                )}
                {!readOnly && (
                    <button className="sb-crewbtn" onClick={() => onEditCrew(date)}>
                        {override ? 'Edit crews' : 'Change crews'}
                    </button>
                )}
            </div>

            {vans.map((van) => {
                const cell = cellJobs(jobs, date, van.id);
                const hasDay = cell.DAY.length > 0;
                const hasSlotJob = cell.AM.length + cell.PM.length > 0;

                // The crew badge appears only on a changed day — otherwise the
                // column header already says who is on the van.
                let badge: ReactNode = null;
                if (override) {
                    const crew = crews[van.id] ?? [];
                    const warn = crewWarning(crew);
                    badge =
                        warn === 'empty' ? (
                            <span className="sb-crewbadge bad">No crew</span>
                        ) : warn === 'solo' ? (
                            <span className="sb-crewbadge">
                                {crewLabel(crew, fitters)} only
                            </span>
                        ) : (
                            <span className="sb-crewbadge">{crewLabel(crew, fitters)}</span>
                        );
                }

                return (
                    <div key={van.id} className={`sb-cell ${weekend ? 'wkend' : ''}`}>
                        {badge}
                        <div className="sb-cellsplit">
                            {/* All-day work sits across the full width of the cell,
                                the way a sticky note covers the whole square. */}
                            <DropZone
                                target={{ kind: 'cell', date, vanId: van.id, slot: 'DAY' }}
                                className={`sb-dayrow ${hasDay ? 'show' : ''}`}
                            >
                                {cell.DAY.map((j) => (
                                    <JobCard
                                        key={j.id}
                                        job={j}
                                        pm={j.pm_id ? pmById.get(j.pm_id) ?? null : null}
                                        allDay
                                        readOnly={readOnly}
                                        onOpen={onOpenJob}
                                    />
                                ))}
                                {!hasDay && (
                                    <div className="sb-daydrop">Drop here for all day</div>
                                )}
                            </DropZone>

                            <div
                                className={`sb-ampmcol ${
                                    hasDay && !hasSlotJob ? 'hidden' : ''
                                }`}
                            >
                                {(['AM', 'PM'] as const).map((slot) => (
                                    <div key={slot} className="sb-slot">
                                        <span className="sb-slotlabel">{slot}</span>
                                        <DropZone
                                            target={{
                                                kind: 'cell',
                                                date,
                                                vanId: van.id,
                                                slot,
                                            }}
                                            className="sb-slotjobs"
                                        >
                                            {cell[slot].map((j) => (
                                                <JobCard
                                                    key={j.id}
                                                    job={j}
                                                    pm={
                                                        j.pm_id
                                                            ? pmById.get(j.pm_id) ?? null
                                                            : null
                                                    }
                                                    readOnly={readOnly}
                                                    onOpen={onOpenJob}
                                                />
                                            ))}
                                            {!readOnly && (
                                                <button
                                                    className="sb-addbtn"
                                                    onClick={() =>
                                                        onAddJob(date, van.id, slot)
                                                    }
                                                >
                                                    + Add job
                                                </button>
                                            )}
                                        </DropZone>
                                    </div>
                                ))}
                            </div>

                            {/* With an all-day job covering the cell the AM/PM labels
                                go, so a slim add line keeps the click path open. */}
                            {hasDay && !hasSlotJob && !readOnly && (
                                <div className="sb-slimadd">
                                    <button onClick={() => onAddJob(date, van.id, 'AM')}>
                                        + AM job
                                    </button>
                                    <button onClick={() => onAddJob(date, van.id, 'PM')}>
                                        + PM job
                                    </button>
                                </div>
                            )}

                            {/* Out of hours: hidden unless used, revealed while dragging. */}
                            <div
                                className={`sb-slot sb-oohrow ${
                                    cell.OOH.length ? 'show' : ''
                                }`}
                            >
                                <span className="sb-slotlabel ooh">OOH</span>
                                <DropZone
                                    target={{ kind: 'cell', date, vanId: van.id, slot: 'OOH' }}
                                    className="sb-slotjobs"
                                >
                                    {cell.OOH.map((j) => (
                                        <JobCard
                                            key={j.id}
                                            job={j}
                                            pm={j.pm_id ? pmById.get(j.pm_id) ?? null : null}
                                            readOnly={readOnly}
                                            onOpen={onOpenJob}
                                        />
                                    ))}
                                    {!readOnly && (
                                        <button
                                            className="sb-addbtn"
                                            onClick={() => onAddJob(date, van.id, 'OOH')}
                                        >
                                            {cell.OOH.length ? '+ Add job' : '+ Out of hours'}
                                        </button>
                                    )}
                                </DropZone>
                            </div>
                        </div>
                    </div>
                );
            })}
        </>
    );
}
