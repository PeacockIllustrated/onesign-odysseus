'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PlanningDelivery } from '@/lib/planning/utils';
import { useRealtimeStatus } from '@/lib/realtime/useRealtimeStatus';
import type {
    FittingJobView,
    ProjectManager,
    ScheduleBoardData,
} from '@/lib/schedule/types';
import {
    MONTH_NAMES,
    addDaysISO,
    formatLong,
    holdingJobs,
    mondayOfISO,
    toISO,
} from '@/lib/schedule/utils';
import { TV_VIEWS, cycleView, fitScale, keyToTvAction, type TvView } from '@/lib/schedule/tv';
import { WeekView } from '@/app/(portal)/admin/schedule/WeekView';
import { MonthView } from '@/app/(portal)/admin/schedule/MonthView';
import { YearView } from '@/app/(portal)/admin/schedule/YearView';
import { JobCard } from '@/app/(portal)/admin/schedule/JobCard';
import { Marquee } from './Marquee';
import '@/app/(portal)/admin/schedule/schedule.css';
import './tv.css';

/**
 * The workshop TV board.
 *
 * A wall screen is not a small desk — it has no pointer, nobody scrolls it, and
 * it is read from across a room. So this is its own shell rather than the
 * office `ScheduleBoard` with things switched off: the toolbar, legend, holding
 * panels, drag context and every modal are gone, leaving the grid and a single
 * line of label.
 *
 * What it deliberately does NOT own is the grid itself. `WeekView`, `MonthView`
 * and `YearView` are the same components the office board renders, so the week
 * on the wall cannot drift from the week on the desk — the invariant in
 * CLAUDE.md §2d. What changed is the chrome around them, which was never the
 * part that had to agree.
 *
 * Three behaviours make it work unattended:
 *
 *  - **Remote control.** Left/right steps week → month → year; up/down steps
 *    the period. There is nothing to click.
 *  - **One page, never scrolled, nothing hidden.** The grid is measured and
 *    scaled to the viewport, however far down that goes. Everything on the
 *    board is on the board at all times — no rotation, no collapsing, nothing
 *    you have to wait for.
 *  - **Never silently stale.** Realtime pushes redraw it, a slow interval
 *    catches anything the socket missed, and a dropped connection says so.
 */

interface Props {
    data: ScheduleBoardData;
    deliveries: PlanningDelivery[];
    view: TvView;
    monday: string;
    month: { y: number; m: number };
    year: number;
}

/**
 * Safety-net refresh. Realtime is the fast path; this catches a socket that
 * died quietly — a TV browser throttling a background tab, a workshop wifi
 * blip — so the wall can never be more than a minute behind the office.
 */
const POLL_MS = 60_000;

export function TvBoard({ data, deliveries, view, monday, month, year }: Props) {
    const router = useRouter();
    const refresh = useCallback(() => router.refresh(), [router]);

    const syncStatus = useRealtimeStatus({
        channel: 'fitting_schedule_tv',
        tables: [
            'fitting_jobs',
            'day_crew_overrides',
            'default_crew',
            'vans',
            'fitters',
            'project_managers',
        ],
        onChange: refresh,
    });

    // --- keeping the wall in step ------------------------------------------

    useEffect(() => {
        const id = setInterval(refresh, POLL_MS);
        return () => clearInterval(id);
    }, [refresh]);

    // A TV that was asleep, or a tab the browser parked, comes back with a
    // stale board and possibly a dead socket. Pull fresh data the moment it is
    // on screen again rather than waiting out the poll.
    useEffect(() => {
        const onWake = () => {
            if (document.visibilityState === 'visible') refresh();
        };
        document.addEventListener('visibilitychange', onWake);
        window.addEventListener('online', refresh);
        return () => {
            document.removeEventListener('visibilitychange', onWake);
            window.removeEventListener('online', refresh);
        };
    }, [refresh]);

    // --- remote control ----------------------------------------------------

    const go = useCallback(
        (next: { view?: TvView; week?: string; y?: number; m?: number }) => {
            const params = new URLSearchParams({
                view: next.view ?? view,
                week: next.week ?? monday,
                year: String(next.y ?? (next.view === 'month' ? month.y : year)),
                month: String(next.m ?? month.m),
            });
            router.push(`/schedule/tv?${params.toString()}`);
        },
        [router, view, monday, month.m, month.y, year]
    );

    const stepPeriod = useCallback(
        (dir: -1 | 1) => {
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
        },
        [go, view, monday, month.m, month.y, year]
    );

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const action = keyToTvAction(e.key);
            if (!action) return;
            // Stop the browser scrolling the page under us — the whole point
            // is that this board never scrolls.
            e.preventDefault();
            if (action === 'view-prev') go({ view: cycleView(view, -1) });
            else if (action === 'view-next') go({ view: cycleView(view, 1) });
            else if (action === 'period-prev') stepPeriod(-1);
            else if (action === 'period-next') stepPeriod(1);
            else if (action === 'today') {
                const now = new Date();
                go({
                    week: mondayOfISO(toISO(now)),
                    y: now.getFullYear(),
                    m: now.getMonth(),
                });
            }
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go, stepPeriod, view]);

    // --- fitting the board to the screen -----------------------------------

    const stageRef = useRef<HTMLDivElement>(null);
    const fitRef = useRef<HTMLDivElement>(null);
    const [scale, setScale] = useState(1);

    // `offsetHeight` reports the PRE-transform layout height, so the board's
    // natural size can be read while a scale is already applied — no reset pass,
    // and no feedback loop between measuring and scaling.
    //
    // useEffect rather than useLayoutEffect: the work happens inside a rAF, so
    // a layout effect buys nothing, and useLayoutEffect warns on the server
    // render Next does of every client component.
    useEffect(() => {
        const stage = stageRef.current;
        const fit = fitRef.current;
        if (!stage || !fit) return;

        let frame = 0;
        const measure = () => {
            cancelAnimationFrame(frame);
            frame = requestAnimationFrame(() => {
                const available = stage.clientHeight;
                const natural = fit.offsetHeight;
                if (available <= 0 || natural <= 0) return;

                // Never clip, however small that lands: on a screen nobody can
                // scroll, a board scaled down still shows every job, where a
                // clipped one silently hides Friday.
                //
                // Deadband: the width compensation below feeds back into the
                // measured height, so ignore sub-percent wobble rather than
                // letting the two chase each other across frames.
                const next = fitScale(natural, available);
                setScale((prev) => (Math.abs(prev - next) > 0.004 ? next : prev));
            });
        };

        measure();
        const ro = new ResizeObserver(measure);
        ro.observe(stage);
        ro.observe(fit);
        return () => {
            cancelAnimationFrame(frame);
            ro.disconnect();
        };
    }, []);

    // --- label -------------------------------------------------------------

    const toSchedule = useMemo(() => holdingJobs(data.jobs, 'scheduled'), [data.jobs]);
    const toDeliver = useMemo(() => holdingJobs(data.jobs, 'delivery'), [data.jobs]);

    const period =
        view === 'week'
            ? `w/c ${formatLong(monday)}`
            : view === 'month'
              ? `${MONTH_NAMES[month.m]} ${month.y}`
              : String(year);

    return (
        <div className="osd-board tv tvb">
            {syncStatus === 'down' && (
                <div className="tvb-offline">
                    <AlertTriangle size={16} />
                    Not syncing — this board may be out of date. Reconnecting…
                </div>
            )}

            {/* Chrome is one line: who owns the colours on the left, where you
                are on the right. The chevrons are not buttons — they label what
                left and right on the remote will do. */}
            <header className="tvb-head">
                {/* Card colour is whose job it is (CLAUDE.md §2d), which is
                    unreadable on a wall without the key that decodes it. */}
                <div className="tvb-key">
                    {data.pms.map((p) => (
                        <span key={p.id} className="k">
                            <span className="sw" style={{ background: p.colour }} />
                            {p.name}
                        </span>
                    ))}
                </div>

                <div className="tvb-where">
                    <ChevronLeft className="tvb-arrow" size={20} aria-hidden />
                    <div className="tvb-views" role="status" aria-live="polite">
                        {TV_VIEWS.map((v) => (
                            <span key={v} className={v === view ? 'on' : ''}>
                                {v}
                            </span>
                        ))}
                    </div>
                    <ChevronRight className="tvb-arrow" size={20} aria-hidden />
                    <span className="tvb-period">{period}</span>
                </div>
            </header>

            <div className="tvb-stage" ref={stageRef}>
                <div
                    className="tvb-fit"
                    ref={fitRef}
                    style={{
                        transform: `scale(${scale})`,
                        // Uniform scaling shrinks the width as well as the
                        // height, which on a packed board left a third of the
                        // panel empty. Laying out this much wider means the
                        // scaled result lands back at exactly the stage width,
                        // so the board fills the TV and the extra room goes to
                        // the cards.
                        width: `${100 / scale}%`,
                    }}
                >
                        {view === 'week' && (
                            <WeekView
                                monday={monday}
                                jobs={data.jobs}
                                vans={data.vans}
                                fitters={data.fitters}
                                pms={data.pms}
                                defaultCrew={data.defaultCrew}
                                overrides={data.overrides}
                                showWeekends={false}
                                readOnly
                                tv
                                onOpenJob={noop}
                                onAddJob={noop}
                                onEditCrew={noop}
                                deliveries={deliveries}
                                showDeliveries={false}
                                onOpenDayRoute={noop}
                            />
                        )}

                        {view === 'month' && (
                            <MonthView
                                year={month.y}
                                month={month.m}
                                jobs={data.jobs}
                                vans={data.vans}
                                pms={data.pms}
                                showWeekends={false}
                                readOnly
                                onOpenJob={noop}
                                onJumpWeek={noop}
                            />
                        )}

                        {view === 'year' && (
                            <YearView
                                year={year}
                                jobs={data.jobs}
                                vans={data.vans}
                                onJumpWeek={noop}
                            />
                        )}
                </div>
            </div>

            {/* What is waiting to be booked in, and what is going out without a
                fitting team. The office board keeps these in a side rail; on a
                wall the width is worth more than the height, so they run along
                the bottom as two shallow bands.

                Each band is one row at the same card scale as the grid above —
                a taller band would take the room the week needs. A list longer
                than the row drifts past instead of being clipped behind a
                scrollbar nobody on a wall can reach, so everything waiting
                comes round. */}
            <footer
                className="tvb-holding"
                // The grid is scaled to fit; the band is not, so without this a
                // packed week ends up with waiting jobs rendered LARGER than the
                // booked ones above them. Handing the band the same factor keeps
                // a card the same size wherever it sits. Its height stays fixed,
                // so this can't feed back into the measurement that produced it.
                style={{ ['--tvb-cardscale' as string]: scale }}
            >
                <TvHoldingBand title="To be scheduled" empty="Nothing waiting" jobs={toSchedule} pms={data.pms} />
                <TvHoldingBand title="To be delivered" empty="Nothing to deliver" jobs={toDeliver} pms={data.pms} />
            </footer>
        </div>
    );
}

/**
 * One holding list as a moving band.
 *
 * Cards are the same component and the same scale as the grid's, so a job
 * waiting to be scheduled looks like the job it becomes once it is placed.
 */
function TvHoldingBand({
    title,
    empty,
    jobs,
    pms,
}: {
    title: string;
    empty: string;
    jobs: FittingJobView[];
    pms: ProjectManager[];
}) {
    const pmById = new Map(pms.map((p) => [p.id, p]));

    return (
        <section className="tvb-band">
            <h2 className="tvb-bandhead">
                {title}
                <span className="n">{jobs.length}</span>
            </h2>

            {jobs.length === 0 ? (
                <p className="tvb-bandempty">{empty}</p>
            ) : (
                <Marquee>
                    {jobs.map((job) => (
                        <JobCard
                            key={job.id}
                            job={job}
                            pm={job.pm_id ? (pmById.get(job.pm_id) ?? null) : null}
                            readOnly
                            onOpen={noop}
                        />
                    ))}
                </Marquee>
            )}
        </section>
    );
}

/** The TV is read-only; every callback the grid views expect goes nowhere. */
function noop() {}
