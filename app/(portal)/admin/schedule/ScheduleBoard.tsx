'use client';

import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    DndContext,
    DragEndEvent,
    DragOverlay,
    DragStartEvent,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import {
    AlertTriangle,
    ChevronLeft,
    ChevronRight,
    Monitor,
    Users,
} from 'lucide-react';
import { useRealtimeStatus } from '@/lib/realtime/useRealtimeStatus';
import { moveFittingJob } from '@/lib/schedule/actions';
import type {
    FittingJobView,
    Lane,
    ScheduleBoardData,
    Slot,
} from '@/lib/schedule/types';
import {
    MONTH_NAMES,
    addDaysISO,
    formatLong,
    holdingJobs,
    mondayOfISO,
    toISO,
} from '@/lib/schedule/utils';
import { WeekView } from './WeekView';
import { MonthView } from './MonthView';
import { YearView } from './YearView';
import { HoldingPanel } from './HoldingPanel';
import { JobCard } from './JobCard';
import { JobModal, blankDraft, draftFromJob, type Draft } from './JobModal';
import { DayCrewModal } from './DayCrewModal';
import { RosterModal } from './RosterModal';
import { QuotePickerModal } from './QuotePickerModal';
import { parseDropTarget } from './DropZone';
import './schedule.css';

type View = 'week' | 'month' | 'year';

const WEEKENDS_KEY = 'odysseus-schedule-weekends';

interface Props {
    data: ScheduleBoardData;
    clients: Array<{ id: string; name: string }>;
    /**
     * View state lives in the URL rather than in component state: the server
     * has to know which window of dates to load, and a month or year view
     * needs far more than the week the board opened on. It also means the TV
     * can be pointed at an exact view, and a week is shareable as a link.
     */
    view: View;
    monday: string;
    month: { y: number; m: number };
    year: number;
    /** Where navigation pushes to — /admin/schedule, or the TV route. */
    basePath: string;
    /** The workshop TV: read-only, larger type, dark by default. */
    tv?: boolean;
}

export function ScheduleBoard({
    data,
    clients,
    view,
    monday,
    month,
    year,
    basePath,
    tv = false,
}: Props) {
    const router = useRouter();
    const [showWeekends, setShowWeekends] = useState(false);

    // Optimistic overlay: a drag applies here immediately and is reconciled by
    // the server refresh, or rolled back if the move is rejected.
    const [pendingMoves, setPendingMoves] = useState<Record<string, Partial<FittingJobView>>>({});
    const [dragging, setDragging] = useState<FittingJobView | null>(null);
    const [moveError, setMoveError] = useState<string | null>(null);
    const [, startTransition] = useTransition();

    const [jobDraft, setJobDraft] = useState<Draft | null>(null);
    // Bumped on every open so the modal remounts with a clean form rather than
    // merging the new draft into the previous card's state.
    const [draftSeq, setDraftSeq] = useState(0);
    const openDraft = useCallback((d: Draft) => {
        setDraftSeq((n) => n + 1);
        setJobDraft(d);
    }, []);
    const [crewDate, setCrewDate] = useState<string | null>(null);
    const [rosterOpen, setRosterOpen] = useState(false);
    const [quoteLane, setQuoteLane] = useState<Lane | null>(null);

    const readOnly = tv;

    // Light/dark is the app's, set on <html> by the topbar toggle — the board
    // has no theme of its own. Only the weekend column preference is local.
    useEffect(() => {
        if (typeof window === 'undefined' || tv) return;
        setShowWeekends(window.localStorage.getItem(WEEKENDS_KEY) === '1');
    }, [tv]);

    function changeWeekends(next: boolean) {
        setShowWeekends(next);
        if (typeof window !== 'undefined')
            window.localStorage.setItem(WEEKENDS_KEY, next ? '1' : '0');
    }

    const refresh = useCallback(() => router.refresh(), [router]);

    // Any change to a job, a crew or the roster redraws every open board.
    const syncStatus = useRealtimeStatus({
        channel: 'fitting_schedule_board',
        tables: ['fitting_jobs', 'day_crew_overrides', 'default_crew', 'vans', 'fitters', 'project_managers'],
        onChange: refresh,
        // Holding a job's modal open would otherwise let a background refresh
        // yank the form out from under whoever is typing.
        enabled: jobDraft == null && crewDate == null && !rosterOpen,
    });

    const jobs = useMemo(
        () =>
            data.jobs.map((j) =>
                pendingMoves[j.id] ? ({ ...j, ...pendingMoves[j.id] } as FittingJobView) : j
            ),
        [data.jobs, pendingMoves]
    );

    const sensors = useSensors(
        // 8px activation keeps a click on a card a click, not a stray drag.
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } })
    );

    function handleDragStart(e: DragStartEvent) {
        const job = jobs.find((j) => j.id === String(e.active.id)) ?? null;
        setDragging(job);
        document.querySelector('.osd-board')?.classList.add('dragging');
    }

    function handleDragEnd(e: DragEndEvent) {
        setDragging(null);
        document.querySelector('.osd-board')?.classList.remove('dragging');

        const { active, over } = e;
        if (!over) return;

        const jobId = String(active.id);
        const job = jobs.find((j) => j.id === jobId);
        const target = parseDropTarget(String(over.id));
        if (!job || !target) return;

        const patch: Partial<FittingJobView> =
            target.kind === 'cell'
                ? {
                      scheduled_date: target.date,
                      van_id: target.vanId,
                      // Month view omits the slot: keep what the job had.
                      slot: target.slot ?? job.slot,
                  }
                : { scheduled_date: null, van_id: null, lane: target.lane };

        const unchanged =
            patch.scheduled_date === job.scheduled_date &&
            patch.van_id === job.van_id &&
            (patch.slot ?? job.slot) === job.slot &&
            (patch.lane ?? job.lane) === job.lane;
        if (unchanged) return;

        setMoveError(null);
        setPendingMoves((prev) => ({ ...prev, [jobId]: patch }));

        startTransition(async () => {
            const res = await moveFittingJob({
                id: jobId,
                van_id: patch.van_id ?? null,
                scheduled_date: patch.scheduled_date ?? null,
                slot: target.kind === 'cell' ? (patch.slot as Slot) : undefined,
                lane: target.kind === 'holding' ? target.lane : undefined,
            });
            if (!res.ok) {
                // Roll the card back to where it was rather than leaving the
                // board showing a move the database refused.
                setPendingMoves((prev) => {
                    const next = { ...prev };
                    delete next[jobId];
                    return next;
                });
                setMoveError(res.error);
                return;
            }
            // Server data now matches; drop the overlay so realtime owns it.
            setPendingMoves((prev) => {
                const next = { ...prev };
                delete next[jobId];
                return next;
            });
            refresh();
        });
    }

    function afterMutation() {
        setJobDraft(null);
        setCrewDate(null);
        setQuoteLane(null);
        refresh();
    }

    // --- navigation --------------------------------------------------------

    const go = useCallback(
        (next: { view?: View; week?: string; y?: number; m?: number }) => {
            const params = new URLSearchParams({
                view: next.view ?? view,
                week: next.week ?? monday,
                year: String(next.y ?? (next.view === 'month' ? month.y : year)),
                month: String(next.m ?? month.m),
            });
            router.push(`${basePath}?${params.toString()}`);
        },
        [router, basePath, view, monday, month.m, month.y, year]
    );

    function navigate(dir: -1 | 1) {
        if (view === 'week') {
            go({ week: addDaysISO(monday, dir * 7) });
        } else if (view === 'month') {
            const nm = month.m + dir;
            if (nm < 0) go({ y: month.y - 1, m: 11 });
            else if (nm > 11) go({ y: month.y + 1, m: 0 });
            else go({ y: month.y, m: nm });
        } else {
            go({ y: year + dir });
        }
    }

    function goToday() {
        const now = new Date();
        go({
            week: mondayOfISO(toISO(now)),
            y: view === 'year' ? now.getFullYear() : now.getFullYear(),
            m: now.getMonth(),
        });
    }

    function jumpWeek(m: string) {
        go({ view: 'week', week: m });
    }

    const title =
        view === 'week'
            ? `week commencing ${formatLong(monday)}`
            : view === 'month'
              ? `${MONTH_NAMES[month.m]} ${month.y}`
              : String(year);

    const toSchedule = holdingJobs(jobs, 'scheduled');
    const toDeliver = holdingJobs(jobs, 'delivery');
    const openJob = (id: string) => {
        const job = jobs.find((j) => j.id === id);
        if (job && !readOnly) openDraft(draftFromJob(job));
    };
    const editingJob = jobDraft?.id
        ? jobs.find((j) => j.id === jobDraft.id) ?? null
        : null;

    return (
        <div className={`osd-board ${tv ? 'tv' : ''}`}>
            {syncStatus === 'down' && (
                <div className="sb-syncbanner">
                    <AlertTriangle size={15} />
                    Not syncing — this board may be out of date. Reconnecting…
                </div>
            )}
            {moveError && (
                <div className="sb-syncbanner">
                    <AlertTriangle size={15} />
                    {moveError}
                </div>
            )}

            <div className="sb-bar">
                <div className="sb-seg">
                    {(['week', 'month', 'year'] as const).map((v) => (
                        <button
                            key={v}
                            className={v === view ? 'on' : ''}
                            onClick={() => go({ view: v })}
                        >
                            {v[0].toUpperCase() + v.slice(1)}
                        </button>
                    ))}
                </div>

                <button className="sb-navbtn" onClick={() => navigate(-1)} aria-label="Previous">
                    <ChevronLeft size={16} />
                </button>
                <button className="sb-pill" onClick={goToday}>
                    Today
                </button>
                <button className="sb-navbtn" onClick={() => navigate(1)} aria-label="Next">
                    <ChevronRight size={16} />
                </button>

                <span className="sb-title">{title}</span>

                <div className="sb-right">
                    <span className="sb-sync" data-state={syncStatus === 'live' ? 'live' : syncStatus === 'down' ? 'down' : 'connecting'}>
                        <span className="dot" />
                        {syncStatus === 'live' ? 'Live' : syncStatus === 'down' ? 'Offline' : 'Connecting'}
                    </span>
                    {view !== 'year' && (
                        <button
                            className={`sb-pill ${showWeekends ? 'on' : ''}`}
                            onClick={() => changeWeekends(!showWeekends)}
                        >
                            Weekends
                        </button>
                    )}
                    {!readOnly && (
                        <button className="sb-pill" onClick={() => setRosterOpen(true)}>
                            <Users size={14} /> Vans &amp; fitters
                        </button>
                    )}
                    {!tv && (
                        // A separate page, not an in-place toggle: hiding the
                        // board's own controls still leaves the portal sidebar
                        // and topbar, which is not what a wall TV wants.
                        <a
                            className="sb-pill"
                            href={`/schedule/tv?${new URLSearchParams({
                                view,
                                week: monday,
                                year: String(year),
                                month: String(month.m),
                            }).toString()}`}
                            target="_blank"
                            rel="noreferrer"
                        >
                            <Monitor size={14} /> TV view
                        </a>
                    )}
                </div>
            </div>

            <div className="sb-legend">
                {data.pms.map((p) => (
                    <span key={p.id} className="l">
                        <span className="sb-swatch" style={{ background: p.colour }} />
                        {p.name}
                    </span>
                ))}
                <span className="l" style={{ fontWeight: 400 }}>
                    ✓ = fitted (jobs stay on as a record)
                </span>
                {view === 'week' && !readOnly && (
                    <span className="sb-hint">
                        Drag cards between days, vans and slots, or into a holding list
                    </span>
                )}
            </div>

            <DndContext
                sensors={sensors}
                onDragStart={handleDragStart}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                    setDragging(null);
                    document.querySelector('.osd-board')?.classList.remove('dragging');
                }}
            >
                <div className="sb-main">
                    {view === 'week' && (
                        <div className="sb-weekwrap">
                            <div className="sb-boardcol">
                                <WeekView
                                    monday={monday}
                                    jobs={jobs}
                                    vans={data.vans}
                                    fitters={data.fitters}
                                    pms={data.pms}
                                    defaultCrew={data.defaultCrew}
                                    overrides={data.overrides}
                                    showWeekends={showWeekends}
                                    readOnly={readOnly}
                                    tv={tv}
                                    onOpenJob={openJob}
                                    onAddJob={(date, vanId, slot) =>
                                        openDraft(blankDraft(date, vanId, slot))
                                    }
                                    onEditCrew={(date) => setCrewDate(date)}
                                />
                            </div>

                            <aside className="sb-sidebar">
                                <HoldingPanel
                                    lane="scheduled"
                                    title="To be scheduled"
                                    jobs={toSchedule}
                                    empty="Nothing waiting — drag a job here to unschedule it"
                                    note="Accepted quotes land here, then drag them onto the board once dates are confirmed."
                                    pms={data.pms}
                                    readOnly={readOnly}
                                    onOpenJob={openJob}
                                    onAdd={(lane) =>
                                        openDraft(blankDraft(null, null, 'AM', lane))
                                    }
                                    onPullQuote={() => setQuoteLane('scheduled')}
                                />
                                <HoldingPanel
                                    lane="delivery"
                                    title="To be delivered"
                                    jobs={toDeliver}
                                    empty="Nothing to deliver — drag a job here when it only needs dropping to site"
                                    note="Items going to site without a fitting team. Drag onto the board if a van ends up running it."
                                    pms={data.pms}
                                    readOnly={readOnly}
                                    onOpenJob={openJob}
                                    onAdd={(lane) =>
                                        openDraft(blankDraft(null, null, 'AM', lane))
                                    }
                                />
                            </aside>
                        </div>
                    )}

                    {view === 'month' && (
                        <MonthView
                            year={month.y}
                            month={month.m}
                            jobs={jobs}
                            vans={data.vans}
                            pms={data.pms}
                            showWeekends={showWeekends}
                            readOnly={readOnly}
                            onOpenJob={openJob}
                            onJumpWeek={jumpWeek}
                        />
                    )}

                    {view === 'year' && (
                        <YearView
                            year={year}
                            jobs={jobs}
                            vans={data.vans}
                            onJumpWeek={jumpWeek}
                        />
                    )}
                </div>

                <DragOverlay dropAnimation={null}>
                    {dragging && (
                        <JobCard
                            job={dragging}
                            pm={
                                dragging.pm_id
                                    ? data.pms.find((p) => p.id === dragging.pm_id) ?? null
                                    : null
                            }
                            readOnly
                            onOpen={() => {}}
                        />
                    )}
                </DragOverlay>
            </DndContext>

            {jobDraft && (
                <JobModal
                    key={draftSeq}
                    draft={jobDraft}
                    job={editingJob}
                    vans={data.vans}
                    pms={data.pms}
                    clients={clients}
                    onClose={() => setJobDraft(null)}
                    onSaved={afterMutation}
                />
            )}

            {crewDate && (
                <DayCrewModal
                    date={crewDate}
                    vans={data.vans}
                    fitters={data.fitters}
                    defaultCrew={data.defaultCrew}
                    overrides={data.overrides}
                    onClose={() => setCrewDate(null)}
                    onSaved={afterMutation}
                />
            )}

            {rosterOpen && (
                <RosterModal
                    vans={data.vans}
                    fitters={data.fitters}
                    defaultCrew={data.defaultCrew}
                    onClose={() => setRosterOpen(false)}
                    onSaved={refresh}
                />
            )}

            {quoteLane && (
                <QuotePickerModal
                    lane={quoteLane}
                    onClose={() => setQuoteLane(null)}
                    onSaved={afterMutation}
                />
            )}
        </div>
    );
}
