'use client';

import type { ReactNode } from 'react';
import { Truck } from 'lucide-react';
import type { PlanningDelivery } from '@/lib/planning/utils';
import { deliveriesByDate, deliveryLabel, groupByDriver } from '@/lib/schedule/deliveries';
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
import { bankHolidayMap } from '@/lib/schedule/holidays';
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
    /** Read-only delivery runs, shown alongside the vans when switched on. */
    deliveries: PlanningDelivery[];
    showDeliveries: boolean;
    onOpenJob: (id: string) => void;
    onAddJob: (date: string, vanId: string, slot: Slot) => void;
    onEditCrew: (date: string) => void;
    onOpenDayRoute: (date: string) => void;
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
    deliveries,
    showDeliveries,
    onOpenJob,
    onAddJob,
    onEditCrew,
    onOpenDayRoute,
}: Props) {
    const days = visibleWeekDays(monday, jobs, showWeekends);
    const today = toISO(new Date());
    const pmById = new Map(pms.map((p) => [p.id, p]));
    const fitterById = new Map(fitters.map((f) => [f.id, f]));

    // The column header shows each van's standing pairing; per-day changes
    // surface on the day row and in the affected cell rather than up here.
    const standingCrew = resolveDay(monday, vans, fitters, defaultCrew, []);
    const deliveryDays = deliveriesByDate(deliveries);
    // A week can straddle New Year, so cover both years it might touch.
    const year = Number(monday.slice(0, 4));
    const holidays = bankHolidayMap(year, year + 1);

    return (
        <div
            className="sb-grid"
            style={{
                // The day column carries the date, a crew-change tag and the
                // crew button, so it needs more room than a date alone.
                gridTemplateColumns: `${tv ? '11rem' : '9.5rem'} repeat(${vans.length}, 1fr)${
                    showDeliveries ? ' 13rem' : ''
                }`,
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
            {showDeliveries && (
                <div className="sb-hcell">
                    <div className="van">Deliveries</div>
                    <div className="crew">drivers</div>
                </div>
            )}

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
                        bankHoliday={holidays.get(date) ?? null}
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
                        deliveries={showDeliveries ? (deliveryDays.get(date) ?? []) : null}
                        onOpenDayRoute={onOpenDayRoute}
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
    /** Name of the bank holiday falling on this day, or null. */
    bankHoliday: string | null;
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
    /** null when the deliveries column is switched off. */
    deliveries: PlanningDelivery[] | null;
    onOpenDayRoute: (date: string) => void;
}

function DayRow({
    date,
    dayName,
    weekend,
    bankHoliday,
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
    deliveries,
    onOpenDayRoute,
}: DayRowProps) {
    return (
        <>
            <div
                className={`sb-dcell ${isToday ? 'today' : ''} ${weekend ? 'wkend' : ''} ${
                    bankHoliday ? 'bankhol' : ''
                }`}
            >
                <div className="dname">{dayName}</div>
                <div className="ddate">{formatWC(date)}</div>
                {/* Nobody is fitting on a bank holiday, so the day says so
                    before somebody books work onto it. */}
                {bankHoliday && <span className="sb-bhtag">{bankHoliday}</span>}
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
                    <div
                        key={van.id}
                        className={`sb-cell ${weekend ? 'wkend' : ''} ${
                            bankHoliday ? 'bankhol' : ''
                        }`}
                    >
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

            {deliveries && (
                <div className={`sb-cell sb-delcell ${weekend ? 'wkend' : ''}`}>
                    {deliveries.length === 0 ? (
                        <p className="sb-delempty">—</p>
                    ) : (
                        <button
                            className="sb-delbtn"
                            onClick={() => onOpenDayRoute(date)}
                            title="See each driver's round in the order it should be driven"
                        >
                            {groupByDriver(deliveries).map((round) => (
                                <span key={round.driverId ?? 'unassigned'} className="sb-delround">
                                    <span className="who">
                                        <Truck size={11} /> {round.driverName}
                                    </span>
                                    <span className="stops">
                                        {round.stops.map((s) => deliveryLabel(s)).join(', ')}
                                    </span>
                                </span>
                            ))}
                            <span className="sb-delcta">Plan route →</span>
                        </button>
                    )}
                </div>
            )}
        </>
    );
}
