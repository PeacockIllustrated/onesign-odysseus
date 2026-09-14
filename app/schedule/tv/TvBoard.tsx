'use client';

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
    AlertTriangle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronUp,
    CalendarCheck,
} from 'lucide-react';
import type { PlanningDelivery } from '@/lib/planning/utils';
import { useRealtimeStatus } from '@/lib/realtime/useRealtimeStatus';
import { setAdditionalVanActive } from '@/lib/schedule/actions';
import type {
    FittingJobView,
    ProjectManager,
    ScheduleBoardData,
} from '@/lib/schedule/types';
import {
    MONTH_NAMES,
    activePms,
    addDaysISO,
    formatLong,
    holdingJobs,
    mondayOfISO,
    toISO,
} from '@/lib/schedule/utils';
import {
    fitScale,
    keyToTvAction,
    monthOfWeek,
    nextTvView,
    weekOfMonthStart,
    type TvAction,
    type TvView,
} from '@/lib/schedule/tv';
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
 * Four behaviours make it work unattended:
 *
 *  - **Remote control, two ways round.** Left/right step the week — scanning
 *    ahead is what the wall is for. Down swaps week and month; up switches the
 *    spare van's column. But a Google TV's D-pad drives a virtual mouse
 *    pointer rather than sending arrow keys to the page, and no web API can
 *    turn that off, so every action is BOTH a key and a real button in the
 *    header: press the arrow on a remote that sends keys, or steer the cursor
 *    onto the control and hit OK. The buttons sit on the logo's line, so
 *    having them costs no height.
 *  - **One page, never scrolled, nothing hidden.** The grid is measured and
 *    scaled to the viewport, however far down that goes. Everything on the
 *    board is on the board at all times — no rotation, no collapsing, nothing
 *    you have to wait for.
 *  - **It comes home on its own.** Someone who scans four weeks ahead and
 *    walks away would otherwise leave the wall showing a week that is not
 *    this one, which is worse than showing nothing.
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

/**
 * How long a board sits on a week somebody scrolled to before returning to
 * this one. Long enough to read a month ahead and talk about it, short enough
 * that the wall is showing today by the time the next person looks up.
 */
const IDLE_HOME_MS = 5 * 60_000;

/** How long a note about a remote press stays on screen. */
const NOTE_MS = 6_000;

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

    // --- navigation --------------------------------------------------------

    /**
     * Week and month always point at the same place.
     *
     * Both live in the URL because the server has to know which dates to load,
     * and they are kept in step on every move: stepping a week updates the
     * month it falls in, stepping a month moves to that month's first week. So
     * down-then-up returns you to where you were instead of snapping back to
     * whatever month the board happened to open on.
     */
    const go = useCallback(
        (next: { view?: TvView; week?: string; y?: number; m?: number }) => {
            const params = new URLSearchParams({
                view: next.view ?? view,
                week: next.week ?? monday,
                year: String(next.y ?? year),
                month: String(next.m ?? month.m),
            });
            router.push(`/schedule/tv?${params.toString()}`);
        },
        [router, view, monday, month.m, year]
    );

    const stepPeriod = useCallback(
        (dir: -1 | 1) => {
            if (view === 'week') {
                const week = addDaysISO(monday, dir * 7);
                const { y, m } = monthOfWeek(week);
                go({ week, y, m });
            } else if (view === 'month') {
                const raw = month.m + dir;
                const y = month.y + (raw < 0 ? -1 : raw > 11 ? 1 : 0);
                const m = (raw + 12) % 12;
                go({ y, m, week: weekOfMonthStart(y, m) });
            } else {
                go({ y: year + dir });
            }
        },
        [go, view, monday, month.m, month.y, year]
    );

    const cycleView = useCallback(() => {
        const next = nextTvView(view);
        if (next === 'month') {
            const { y, m } = monthOfWeek(monday);
            go({ view: 'month', y, m });
            return;
        }
        // Coming back to the week: keep the week we were on if it belongs to
        // the month on screen, otherwise open that month's first week. The two
        // only disagree when the URL was set by hand or by the office board.
        const cur = monthOfWeek(monday);
        const inside = cur.y === month.y && cur.m === month.m;
        go({ view: 'week', week: inside ? monday : weekOfMonthStart(month.y, month.m) });
    }, [go, view, monday, month.y, month.m]);

    const today = toISO(new Date());
    const thisMonday = mondayOfISO(today);

    const goHome = useCallback(() => {
        const now = new Date();
        go({
            view: 'week',
            week: mondayOfISO(toISO(now)),
            y: now.getFullYear(),
            m: now.getMonth(),
        });
    }, [go]);

    // --- the spare van's column --------------------------------------------

    const extraVan = data.additionalVan;

    // One transient line for anything a press has to say back. The board is
    // otherwise silent, so this is the only place a refused or consequential
    // press is visible at all.
    const [note, setNote] = useState<string | null>(null);
    useEffect(() => {
        if (!note) return;
        const id = setTimeout(() => setNote(null), NOTE_MS);
        return () => clearTimeout(id);
    }, [note]);

    const [busy, startToggle] = useTransition();
    const busyRef = useRef(false);

    /**
     * Switch the spare van on or off from the remote.
     *
     * Shared DB state, exactly as the office toolbar's pill does it — a fourth
     * column only one room could see would be worse than none (CLAUDE.md §2d).
     * Which is also why turning it off has to say what happened to any work
     * standing on it, rather than just dropping a column.
     */
    const toggleVan = useCallback(() => {
        if (!extraVan) {
            setNote('No spare van is set up.');
            return;
        }
        // A held-down remote button repeats; one flight at a time, or the
        // column flickers on and off.
        if (busyRef.current) return;
        busyRef.current = true;
        const turningOff = extraVan.is_active;

        startToggle(async () => {
            const res = await setAdditionalVanActive(!extraVan.is_active);
            busyRef.current = false;
            if (!res.ok) {
                setNote(`${extraVan.name} could not be switched: ${res.error}`);
                return;
            }
            if (turningOff && res.data.strandedJobs > 0) {
                setNote(
                    `${extraVan.name} hidden — ${res.data.strandedJobs} job${
                        res.data.strandedJobs === 1 ? '' : 's'
                    } stayed on it and will reappear when it is switched back on.`
                );
            } else {
                setNote(`${extraVan.name} ${turningOff ? 'hidden' : 'on the board'}.`);
            }
            refresh();
        });
    }, [extraVan, refresh]);

    // --- remote control ----------------------------------------------------

    // When the board was last driven by hand. 0 means nobody has touched it,
    // which is how a board the office pointed at a specific week stays there.
    const lastPressRef = useRef(0);

    /**
     * Every action arrives here, however it was triggered.
     *
     * Two kinds of TV remote reach this board and they look nothing alike from
     * the page's side: one sends arrow keydowns, the other (Google TV, and
     * Android TV generally) moves a virtual mouse cursor with the D-pad and
     * sends the page no keys at all. Funnelling both into one dispatcher is
     * what keeps them from drifting — there is one definition of what "next
     * week" does, and the header buttons and the key handler are two doors
     * into it rather than two implementations.
     */
    const press = useCallback(
        (action: TvAction) => {
            // Only the actions that MOVE the board arm the idle return. The
            // van switch is not navigation, and arming on it would eventually
            // drag a board the office pointed at a particular week back to
            // this one for no reason.
            if (action === 'period-prev' || action === 'period-next' || action === 'view-cycle') {
                lastPressRef.current = Date.now();
            }

            if (action === 'period-prev') stepPeriod(-1);
            else if (action === 'period-next') stepPeriod(1);
            else if (action === 'view-cycle') cycleView();
            else if (action === 'toggle-van') toggleVan();
            else if (action === 'today') {
                // Back where it belongs by hand: stop counting down.
                lastPressRef.current = 0;
                goHome();
            }
        },
        [stepPeriod, cycleView, toggleVan, goHome]
    );

    useEffect(() => {
        function onKey(e: KeyboardEvent) {
            const action = keyToTvAction(e.key);
            if (!action) return;

            // Enter means "today" on a bare board, but if one of the header
            // controls holds focus it has to mean THAT control — a remote that
            // sends keys can Tab onto "next week", and having OK jump to today
            // instead would be indefensible. Let the button's own click run.
            if (
                e.key === 'Enter' &&
                e.target instanceof Element &&
                e.target.closest('.tvb-remote')
            ) {
                return;
            }

            // Stop the browser scrolling the page under us — the whole point
            // is that this board never scrolls.
            e.preventDefault();
            press(action);
        }
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [press]);

    // Come back to this week once the board has been left alone. Only when a
    // person actually moved it: a board opened on a particular week from the
    // office board's "TV view" button is meant to sit there.
    const atHome = view === 'week' && monday === thisMonday;
    useEffect(() => {
        if (atHome) return;
        const id = setInterval(() => {
            if (lastPressRef.current === 0) return;
            if (Date.now() - lastPressRef.current < IDLE_HOME_MS) return;
            lastPressRef.current = 0;
            goHome();
        }, 30_000);
        return () => clearInterval(id);
    }, [atHome, goHome]);

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
    // Nothing waiting anywhere means the band earns none of the screen, and
    // the week takes the room instead.
    const anyHolding = toSchedule.length > 0 || toDeliver.length > 0;

    // The key decodes card colour, so it lists the PMs whose work can appear
    // on a card today — a name nobody is running any more is one more thing to
    // read from across a workshop.
    const keyPms = useMemo(() => activePms(data.pms), [data.pms]);

    // What left/right step, named on the buttons that do it.
    const periodUnit = view === 'week' ? 'week' : view === 'month' ? 'month' : 'year';

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
            {note && <div className="tvb-note">{note}</div>}

            {/* Chrome is one line: the logo, the controls, who owns the
                colours, and where you are. The controls sit up here beside the
                logo precisely so they cost no height — the week below is what
                the screen is for. */}
            <header className="tvb-head">
                {/* The white mark: the TV always runs the dark stage. Plain
                    <img> like the sidebar's — a static SVG has nothing for the
                    image optimiser to do. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                    src="/Odysseus-Logo.svg"
                    alt="Onesign Odysseus"
                    className="tvb-logo"
                />

                {/* Real buttons, not a legend.
                    These started as labels naming what each arrow on the
                    remote would do, on the reasoning that a wall screen has no
                    pointer. A Google TV does: its D-pad moves a virtual mouse
                    cursor and the arrow keys never reach the page, and there
                    is no way for a page to opt out of that. So each control
                    carries the arrow that triggers it AND is clickable, which
                    covers both kinds of remote with one row and no modes. */}
                <div className="tvb-remote">
                    <button className="r" onClick={() => press('period-prev')}>
                        <ChevronLeft size={16} />
                        last {periodUnit}
                    </button>
                    <button className="r" onClick={() => press('period-next')}>
                        next {periodUnit}
                        <ChevronRight size={16} />
                    </button>
                    <button className="r" onClick={() => press('view-cycle')}>
                        <ChevronDown size={16} />
                        {nextTvView(view)} view
                    </button>
                    {extraVan && (
                        <button
                            className={`r ${extraVan.is_active ? 'on' : ''} ${busy ? 'busy' : ''}`}
                            onClick={() => press('toggle-van')}
                        >
                            <ChevronUp size={16} />
                            {extraVan.name}
                            <b>{extraVan.is_active ? 'on' : 'off'}</b>
                        </button>
                    )}
                    {/* Only reachable by pointer or Tab: a Google TV remote has
                        no Home key, so without this a cursor-driven board has
                        no way back to this week. */}
                    <button
                        className={`r ${atHome ? 'here' : 'home'}`}
                        onClick={() => press('today')}
                        disabled={atHome}
                    >
                        <CalendarCheck size={16} />
                        {atHome ? 'this week' : 'today'}
                    </button>
                </div>

                {/* Card colour is whose job it is (CLAUDE.md §2d), which is
                    unreadable on a wall without the key that decodes it. */}
                <div className="tvb-key">
                    {keyPms.map((p) => (
                        <span key={p.id} className="k">
                            <span className="sw" style={{ background: p.colour }} />
                            {p.name}
                        </span>
                    ))}
                </div>

                <div className="tvb-where" role="status" aria-live="polite">
                    <span className="tvb-view">{view}</span>
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
                the bottom as two shallow bands — and only while there is
                something in them, because an empty band is height the week
                could have had.

                Each band is one row at the same card scale as the grid above.
                A list longer than the row drifts past instead of being clipped
                behind a scrollbar nobody on a wall can reach, so everything
                waiting comes round. */}
            {anyHolding && (
                <footer
                    className="tvb-holding"
                    // The grid is scaled to fit; the band is not, so without this a
                    // packed week ends up with waiting jobs rendered LARGER than the
                    // booked ones above them. Handing the band the same factor keeps
                    // a card the same size wherever it sits. Its height stays fixed,
                    // so this can't feed back into the measurement that produced it.
                    style={{ ['--tvb-cardscale' as string]: scale }}
                >
                    {toSchedule.length > 0 && (
                        <TvHoldingBand
                            title="To be scheduled"
                            jobs={toSchedule}
                            pms={data.pms}
                        />
                    )}
                    {toDeliver.length > 0 && (
                        <TvHoldingBand
                            title="To be delivered"
                            jobs={toDeliver}
                            pms={data.pms}
                        />
                    )}
                </footer>
            )}
        </div>
    );
}

/**
 * One holding list as a moving band.
 *
 * Cards are the same component and the same scale as the grid's, so a job
 * waiting to be scheduled looks like the job it becomes once it is placed.
 * Only rendered with something in it, so the two bands split the width when
 * both lists are busy and one takes it all when the other is clear.
 */
function TvHoldingBand({
    title,
    jobs,
    pms,
}: {
    title: string;
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
        </section>
    );
}

/** The TV is read-only; every callback the grid views expect goes nowhere. */
function noop() {}
