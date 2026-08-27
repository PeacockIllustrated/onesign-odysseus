'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import type { PlanningDelivery } from '@/lib/planning/utils';
import { useRealtimeStatus } from '@/lib/realtime/useRealtimeStatus';
import type { ScheduleBoardData } from '@/lib/schedule/types';
import {
    MONTH_NAMES,
    addDaysISO,
    formatLong,
    holdingJobs,
    mondayOfISO,
    toISO,
} from '@/lib/schedule/utils';
import {
    TV_VIEWS,
    cycleView,
    fitScale,
    keyToTvAction,
    needsCondensing,
    nextSpotlight,
    spotlightSequence,
    type TvView,
} from '@/lib/schedule/tv';
import { WeekView } from '@/app/(portal)/admin/schedule/WeekView';
import { MonthView } from '@/app/(portal)/admin/schedule/MonthView';
import { YearView } from '@/app/(portal)/admin/schedule/YearView';
import { HoldingPanel } from '@/app/(portal)/admin/schedule/HoldingPanel';
import { TvDisplayProvider } from '@/app/(portal)/admin/schedule/TvDisplayContext';
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
 *  - **One page, never scrolled.** The grid is measured and scaled to the
 *    viewport. If fitting it whole would push it below legibility, cards
 *    condense to one line and a spotlight rotates their detail into view
 *    instead of shrinking further.
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

/** How long each spotlighted card stays open before the rotation moves on. */
const SPOTLIGHT_MS = 4500;

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
    const [condensed, setCondensed] = useState(false);

    /**
     * Whatever changes the board's shape. When this changes the measurement
     * starts again from an open board, because the "would it fit?" question can
     * only be asked of a board with every card open.
     */
    const shapeKey = `${view}|${monday}|${month.y}-${month.m}|${year}|${data.jobs.length}|${data.vans.length}|${deliveries.length}`;

    // Mirrors of the state for the measure callback, which runs outside React's
    // render and would otherwise close over a stale value.
    const condensedRef = useRef(condensed);
    useEffect(() => {
        condensedRef.current = condensed;
    }, [condensed]);
    const shapeRef = useRef<string | null>(null);
    const fullHeightRef = useRef(0);

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

                // New content: forget the old board and open the cards so the
                // next pass measures a full-height board. One frame at full
                // size, which is not visible.
                if (shapeRef.current !== shapeKey) {
                    shapeRef.current = shapeKey;
                    fullHeightRef.current = 0;
                    setCondensed(false);
                    return;
                }

                // Only an open board tells us the full height; while condensed
                // we keep the last one, which is what stops the decision
                // oscillating (see needsCondensing).
                if (!condensedRef.current) fullHeightRef.current = natural;
                const full = fullHeightRef.current || natural;

                setCondensed(needsCondensing(full, available));
                // Scale from what is actually rendered right now, not from the
                // full height — and never clip, however small that lands.
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
    }, [shapeKey, condensed]);

    // --- spotlight rotation ------------------------------------------------

    const sequence = useMemo(
        () => spotlightSequence(data.jobs, data.vans.map((v) => v.id)),
        [data.jobs, data.vans]
    );

    const [spotlightRaw, setSpotlightRaw] = useState<string | null>(null);

    // Only the week view shows full cards, so it is the only one with detail to
    // reveal; month and year are already one-line chips.
    const rotating = condensed && view === 'week' && sequence.length > 1;

    // Read through a ref so a realtime refresh — which rebuilds the sequence
    // array — doesn't restart the timer and cut the current card's turn short.
    const sequenceRef = useRef(sequence);
    useEffect(() => {
        sequenceRef.current = sequence;
    }, [sequence]);

    useEffect(() => {
        if (!rotating) return;
        // Nothing opens for the first interval, which gives a board that has
        // just been resized or refreshed a moment to settle before it starts
        // animating.
        const id = setInterval(() => {
            setSpotlightRaw((cur) => nextSpotlight(sequenceRef.current, cur));
        }, SPOTLIGHT_MS);
        return () => clearInterval(id);
    }, [rotating]);

    // Derived rather than reset in an effect: when the board stops being packed
    // the spotlight simply stops applying, with no extra render to clear it.
    const spotlightId = rotating ? spotlightRaw : null;

    const display = useMemo(
        () => ({ condensed: rotating, spotlightId }),
        [rotating, spotlightId]
    );

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
                    <TvDisplayProvider value={display}>
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
                    </TvDisplayProvider>
                </div>
            </div>

            {/* What is waiting to be booked in, and what is going out without a
                fitting team. The office board keeps these in a side rail; on a
                wall the width is worth more than the height, so they run along
                the bottom in a fixed band the grid above is sized around. */}
            <footer className="tvb-holding">
                <HoldingPanel
                    lane="scheduled"
                    title="To be scheduled"
                    jobs={toSchedule}
                    empty="Nothing waiting"
                    note=""
                    pms={data.pms}
                    readOnly
                    onOpenJob={noop}
                    onAdd={noop}
                />
                <HoldingPanel
                    lane="delivery"
                    title="To be delivered"
                    jobs={toDeliver}
                    empty="Nothing to deliver"
                    note=""
                    pms={data.pms}
                    readOnly
                    onOpenJob={noop}
                    onAdd={noop}
                />
            </footer>
        </div>
    );
}

/** The TV is read-only; every callback the grid views expect goes nowhere. */
function noop() {}
