import { requireAdmin } from '@/lib/auth';
import { getScheduleBoard } from '@/lib/schedule/queries';
import { bankHolidayMap } from '@/lib/schedule/holidays';
import type { FittingJobView, ProjectManager, Slot, Van } from '@/lib/schedule/types';
import {
    DAY_NAMES,
    DAY_SHORT,
    SLOT_ORDER,
    activePms,
    addDaysISO,
    cellJobs,
    crewLabel,
    crewWarning,
    dayIndex,
    formatLong,
    holdingJobs,
    isMultiDay,
    jobCustomer,
    jobEndDate,
    jobExtra,
    jobMeta,
    mondayOfISO,
    resolveDay,
    toISO,
    visibleWeekDays,
} from '@/lib/schedule/utils';

/**
 * The fitting schedule, on paper.
 *
 * The wall TV answers "what is on this week" for anybody walking past; this
 * answers it for somebody who wants it in their hand, at a size they can
 * actually read. Which is the whole reason it exists: the board was asked for
 * BIGGER on paper, so the default here is A3 landscape rather than the A4
 * every other print view in the project uses, and there is a day-per-sheet
 * layout that hands one day the whole page at nearly twice the type again.
 *
 * Three things it deliberately does differently from the board:
 *
 *  - **The PM is named, not just coloured.** Card colour is whose job it is
 *    (CLAUDE.md §2d), and colour is exactly what an office mono printer throws
 *    away. The colour still prints for the sheets that come off a colour
 *    printer; the name is what makes the sheet survive the other one.
 *  - **A multi-day job states its span on a day sheet.** The board drops that
 *    tag because the job renders in every cell it covers, so the calendar
 *    already answers it — but a single day torn off on its own has no other
 *    days to compare against, so there it carries "Mon–Wed".
 *  - **Nothing is hidden behind a hover or a click.** Every line a card can
 *    carry is on the page: what the job is, its reference, where it is, the
 *    crew note and the access equipment.
 *
 * It renders from the same `getScheduleBoard` payload and the same pure
 * helpers as the office board and the TV, so the paper cannot disagree with
 * either — the same invariant that keeps the wall and the desk in step.
 */

export const dynamic = 'force-dynamic';
export const revalidate = 0;

type Paper = 'a3' | 'a4';
type Layout = 'week' | 'day';

/**
 * Paper, and the type size that fits it.
 *
 * Everything in the stylesheet is in `em` off the sheet's base, so these two
 * numbers per paper are the only ones to tune — the same one-knob approach the
 * TV board uses for its density.
 */
const PAPERS: Record<
    Paper,
    { label: string; w: number; h: number; week: number; day: number }
> = {
    a3: { label: 'A3', w: 420, h: 297, week: 12, day: 21 },
    a4: { label: 'A4', w: 297, h: 210, week: 8.5, day: 15 },
};

/** How many weeks one run may cover. A term's worth is somebody's mistake. */
const MAX_WEEKS = 6;

const SLOT_LABEL: Record<Slot, string> = {
    DAY: 'All day',
    AM: 'AM',
    PM: 'PM',
    OOH: 'Out of hours',
};

interface PageProps {
    searchParams: Promise<{
        week?: string;
        weeks?: string;
        paper?: string;
        layout?: string;
        weekends?: string;
        waiting?: string;
    }>;
}

export default async function SchedulePrintPage({ searchParams }: PageProps) {
    await requireAdmin();
    const params = await searchParams;

    const paper: Paper = params.paper === 'a4' ? 'a4' : 'a3';
    const layout: Layout = params.layout === 'day' ? 'day' : 'week';
    const showWeekends = params.weekends === '1';
    const showWaiting = params.waiting !== '0';

    // A malformed ?week= falls back to this week rather than 500ing, exactly
    // as the board's own window resolver does.
    const monday = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? '')
        ? mondayOfISO(params.week!)
        : mondayOfISO(toISO(new Date()));
    const weeks = Math.min(MAX_WEEKS, Math.max(1, Number(params.weeks) || 1));

    const mondays = Array.from({ length: weeks }, (_, i) => addDaysISO(monday, i * 7));
    const from = mondays[0];
    const to = addDaysISO(mondays[mondays.length - 1], 6);

    const data = await getScheduleBoard(from, to);
    const pmById = new Map(data.pms.map((p) => [p.id, p]));
    const holidays = bankHolidayMap(Number(from.slice(0, 4)), Number(to.slice(0, 4)) + 1);

    const size = PAPERS[paper];
    const base = layout === 'day' ? size.day : size.week;

    const toSchedule = holdingJobs(data.jobs, 'scheduled');
    const toDeliver = holdingJobs(data.jobs, 'delivery');
    const anyWaiting = showWaiting && (toSchedule.length > 0 || toDeliver.length > 0);

    /** Every link in the bar is this page with one thing changed. */
    const href = (over: Record<string, string>) =>
        `/admin/schedule/print?${new URLSearchParams({
            week: monday,
            weeks: String(weeks),
            paper,
            layout,
            weekends: showWeekends ? '1' : '0',
            waiting: showWaiting ? '1' : '0',
            ...over,
        }).toString()}`;

    const range =
        weeks === 1 ? `w/c ${formatLong(monday)}` : `${formatLong(monday)} – ${formatLong(to)}`;

    return (
        <div className="sp-root">
            <title>{`Fitting schedule — ${range}`}</title>
            <style>{`
                @page { size: ${size.label} landscape; margin: 8mm; }

                @media print {
                    .sp-hint { display: none !important; }
                    .sp-root { background: white; padding: 0; }
                    .sp-sheet { width: auto; min-height: 0; margin: 0; box-shadow: none; border: 0; }
                    .sp-inner { padding: 0; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }

                .sp-root {
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                    background: #e9eced;
                    color: #1a1a1a;
                    padding: 0 0 48px;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }

                /* One sheet of paper, shown on screen at the size it will come
                   out of the printer — the point of the page is the type size,
                   so a preview that is not to scale is no preview at all. */
                .sp-sheet {
                    font-size: ${base}pt;
                    line-height: 1.25;
                    width: ${size.w - 16}mm;
                    min-height: ${size.h - 16}mm;
                    margin: 0 auto 24px;
                    background: white;
                    border: 1px solid #c9d0d2;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.08);
                    break-after: page;
                    page-break-after: always;
                }
                .sp-sheet:last-child { break-after: auto; page-break-after: auto; margin-bottom: 0; }
                .sp-inner { padding: 6mm; }

                /* --- sheet head --- */
                .sp-head {
                    display: flex;
                    align-items: baseline;
                    gap: 0.8em;
                    border-bottom: 2pt solid #4e7e8c;
                    padding-bottom: 0.35em;
                    margin-bottom: 0.5em;
                }
                .sp-title { font-size: 1.5em; font-weight: 700; letter-spacing: -0.01em; }
                .sp-when { font-size: 1.15em; font-weight: 600; color: #4e7e8c; }
                .sp-brand {
                    margin-left: auto;
                    font-size: 0.8em;
                    font-weight: 600;
                    color: #6b7678;
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                }

                /* The key still prints, for the sheets that come off a colour
                   printer — every card names its PM as well, so a mono print
                   loses the shortcut and nothing else. */
                .sp-key {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 0.25em 1em;
                    margin-bottom: 0.5em;
                    font-size: 0.85em;
                    color: #45525a;
                }
                .sp-key .k { display: inline-flex; align-items: center; gap: 0.35em; }
                .sp-key i {
                    width: 0.8em;
                    height: 0.8em;
                    border-radius: 50%;
                    display: inline-block;
                    border: 0.5pt solid rgba(0,0,0,0.25);
                }

                /* --- the grids --- */
                .sp-grid, .sp-daygrid {
                    display: grid;
                    border-top: 1pt solid #9aa5a8;
                    border-left: 1pt solid #9aa5a8;
                }
                .sp-grid > div, .sp-daygrid > div {
                    border-right: 1pt solid #9aa5a8;
                    border-bottom: 1pt solid #9aa5a8;
                }

                .sp-hcell { padding: 0.3em 0.45em; background: #eef2f3; }
                .sp-hcell .van { font-weight: 700; font-size: 1.05em; }
                .sp-hcell .crew { font-size: 0.78em; color: #566065; }

                .sp-dcell { padding: 0.35em 0.45em; background: #f6f8f8; }
                .sp-dcell .dname { font-weight: 700; font-size: 1.05em; }
                .sp-dcell .ddate { font-size: 0.8em; color: #566065; }
                .sp-dcell .tag {
                    display: block;
                    margin-top: 0.25em;
                    font-size: 0.72em;
                    font-weight: 600;
                    color: #8a5a10;
                }
                .sp-dcell .tag.away { color: #7a3d3d; }

                .sp-cell { padding: 0.3em 0.35em; }
                .sp-cell.bankhol { background: #faf4ea; }
                .sp-cell.wkend { background: #f7f8f8; }
                .sp-slotcell { padding: 0.35em 0.45em; background: #f6f8f8; font-weight: 700; }

                .sp-crewbadge {
                    display: block;
                    font-size: 0.72em;
                    font-weight: 600;
                    color: #566065;
                    margin-bottom: 0.2em;
                }
                .sp-crewbadge.bad { color: #9a2f2f; }

                .sp-slot { margin-bottom: 0.3em; }
                .sp-slot:last-child { margin-bottom: 0; }
                .sp-slotlabel {
                    font-size: 0.7em;
                    font-weight: 700;
                    letter-spacing: 0.08em;
                    text-transform: uppercase;
                    color: #6b7678;
                }

                /* --- a job --- */
                .sp-job {
                    border: 0.75pt solid #c6cfd1;
                    border-left: 3pt solid var(--pm, #9aa5a8);
                    border-radius: 2pt;
                    padding: 0.25em 0.4em;
                    margin-top: 0.15em;
                    break-inside: avoid;
                    page-break-inside: avoid;
                }
                .sp-job .n { font-weight: 700; font-size: 1.02em; }
                .sp-job .s { font-size: 0.88em; }
                .sp-job .m { font-size: 0.8em; color: #4d585d; }
                .sp-job .m span + span::before { content: ' · '; }
                .sp-job .x { font-size: 0.78em; color: #4d585d; }
                .sp-job .pm { font-size: 0.78em; font-weight: 600; color: #38484f; }
                .sp-job .span { font-size: 0.78em; font-weight: 600; color: #6b7678; }
                .sp-job .del { font-size: 0.72em; font-weight: 700; color: #8a5a10; }
                .sp-job.done { background: #f4f6f6; }
                .sp-job.done .n { text-decoration: line-through; }
                .sp-job .tick { color: #2f6b45; }

                /* --- waiting --- */
                .sp-waiting { margin-top: 0.8em; }
                .sp-waiting h2 {
                    font-size: 1em;
                    font-weight: 700;
                    margin: 0 0 0.3em;
                    padding-bottom: 0.2em;
                    border-bottom: 1pt solid #c6cfd1;
                }
                .sp-waitlist { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.25em 0.8em; }
                .sp-waitlist .w { font-size: 0.85em; break-inside: avoid; }
                .sp-waitlist .w span { color: #4d585d; }

                .sp-empty { font-size: 0.9em; color: #6b7678; padding: 0.8em 0; }

                /* --- the screen-only control bar --- */
                .sp-hint {
                    position: sticky;
                    top: 0;
                    z-index: 10;
                    display: flex;
                    flex-wrap: wrap;
                    align-items: center;
                    gap: 6px;
                    padding: 10px 16px;
                    margin-bottom: 20px;
                    background: #1a1f23;
                    color: white;
                    font-size: 13px;
                }
                .sp-hint b { font-weight: 700; }
                .sp-hint .grp { display: inline-flex; align-items: center; gap: 4px; margin-left: 12px; }
                .sp-hint .lab {
                    color: #9fb0b6;
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.06em;
                }
                .sp-hint a {
                    color: white;
                    text-decoration: none;
                    border: 1px solid rgba(255,255,255,0.25);
                    border-radius: 999px;
                    padding: 4px 10px;
                }
                .sp-hint a.on { background: #4e7e8c; border-color: #4e7e8c; }
                .sp-hint button {
                    margin-left: auto;
                    background: white;
                    color: #1a1f23;
                    border: none;
                    border-radius: 6px;
                    padding: 7px 14px;
                    font-weight: 700;
                    font-size: 13px;
                    cursor: pointer;
                }
            `}</style>

            {/* Screen only. The paper size is chosen HERE rather than in the
                browser's print dialog, because that dialog will happily shrink
                an A3 layout onto A4 and hand back exactly the small type this
                page exists to avoid. */}
            <div className="sp-hint">
                <b>Fitting schedule</b> {range}
                <span className="grp">
                    <span className="lab">Paper</span>
                    {(Object.keys(PAPERS) as Paper[]).map((p) => (
                        <a key={p} className={p === paper ? 'on' : ''} href={href({ paper: p })}>
                            {PAPERS[p].label}
                        </a>
                    ))}
                </span>
                <span className="grp">
                    <span className="lab">Sheet</span>
                    <a className={layout === 'week' ? 'on' : ''} href={href({ layout: 'week' })}>
                        Week per sheet
                    </a>
                    <a className={layout === 'day' ? 'on' : ''} href={href({ layout: 'day' })}>
                        Day per sheet — largest
                    </a>
                </span>
                <span className="grp">
                    <span className="lab">Weeks</span>
                    {[1, 2, 4].map((n) => (
                        <a
                            key={n}
                            className={n === weeks ? 'on' : ''}
                            href={href({ weeks: String(n) })}
                        >
                            {n}
                        </a>
                    ))}
                </span>
                <span className="grp">
                    <a
                        className={showWeekends ? 'on' : ''}
                        href={href({ weekends: showWeekends ? '0' : '1' })}
                    >
                        Weekends
                    </a>
                    <a
                        className={showWaiting ? 'on' : ''}
                        href={href({ waiting: showWaiting ? '0' : '1' })}
                    >
                        Waiting lists
                    </a>
                </span>
                <button id="sp-print">Print</button>
            </div>

            <script
                dangerouslySetInnerHTML={{
                    __html: `(function(){var b=document.getElementById('sp-print');if(b)b.addEventListener('click',function(){window.print();});})();`,
                }}
            />

            {layout === 'week'
                ? mondays.map((wc, i) => (
                      <WeekSheet
                          key={wc}
                          monday={wc}
                          data={data}
                          pmById={pmById}
                          holidays={holidays}
                          showWeekends={showWeekends}
                          // On the last sheet only: the waiting lists are the
                          // same two lists whatever week is on the page, and
                          // repeating them per week is paper for nothing.
                          waiting={
                              anyWaiting && i === mondays.length - 1
                                  ? { toSchedule, toDeliver }
                                  : null
                          }
                      />
                  ))
                : mondays.flatMap((wc) =>
                      visibleWeekDays(wc, data.jobs, showWeekends).map((date) => (
                          <DaySheet
                              key={date}
                              date={date}
                              data={data}
                              pmById={pmById}
                              holiday={holidays.get(date) ?? null}
                          />
                      ))
                  )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Sheets
// ---------------------------------------------------------------------------

type BoardData = Awaited<ReturnType<typeof getScheduleBoard>>;

function SheetHead({ when, pms }: { when: string; pms: ProjectManager[] }) {
    return (
        <>
            <div className="sp-head">
                <span className="sp-title">Fitting schedule</span>
                <span className="sp-when">{when}</span>
                <span className="sp-brand">Onesign &amp; Digital</span>
            </div>
            {pms.length > 0 && (
                <div className="sp-key">
                    {pms.map((p) => (
                        <span key={p.id} className="k">
                            <i style={{ background: p.colour }} />
                            {p.name}
                        </span>
                    ))}
                </div>
            )}
        </>
    );
}

/** One week on one sheet: days down the side, vans across the top. */
function WeekSheet({
    monday,
    data,
    pmById,
    holidays,
    showWeekends,
    waiting,
}: {
    monday: string;
    data: BoardData;
    pmById: Map<string, ProjectManager>;
    holidays: Map<string, string>;
    showWeekends: boolean;
    waiting: { toSchedule: FittingJobView[]; toDeliver: FittingJobView[] } | null;
}) {
    const days = visibleWeekDays(monday, data.jobs, showWeekends);
    // The column header carries each van's standing pairing; a day that
    // differs says so in the cell, exactly as the board does it.
    const standing = resolveDay(monday, data.vans, data.fitters, data.defaultCrew, []);
    const fitterById = new Map(data.fitters.map((f) => [f.id, f.name]));

    return (
        <section className="sp-sheet">
            <div className="sp-inner">
                <SheetHead when={`w/c ${formatLong(monday)}`} pms={activePms(data.pms)} />

                <div
                    className="sp-grid"
                    style={{ gridTemplateColumns: `26mm repeat(${data.vans.length}, 1fr)` }}
                >
                    <div className="sp-hcell" />
                    {data.vans.map((v) => (
                        <div key={v.id} className="sp-hcell">
                            <div className="van">{v.name}</div>
                            <div className="crew">
                                {crewLabel(standing.crews[v.id] ?? [], data.fitters)}
                            </div>
                        </div>
                    ))}

                    {days.map((date) => {
                        const day = resolveDay(
                            date,
                            data.vans,
                            data.fitters,
                            data.defaultCrew,
                            data.overrides
                        );
                        const away = day.holiday
                            .map((id) => fitterById.get(id))
                            .filter((n): n is string => !!n);

                        return (
                            <WeekDayRow
                                key={date}
                                date={date}
                                bankHoliday={holidays.get(date) ?? null}
                                away={away}
                                crews={day.crews}
                                override={day.override}
                                data={data}
                                pmById={pmById}
                            />
                        );
                    })}
                </div>

                {waiting && (
                    <Waiting toSchedule={waiting.toSchedule} toDeliver={waiting.toDeliver} />
                )}
            </div>
        </section>
    );
}

function WeekDayRow({
    date,
    bankHoliday,
    away,
    crews,
    override,
    data,
    pmById,
}: {
    date: string;
    bankHoliday: string | null;
    away: string[];
    crews: Record<string, string[]>;
    override: boolean;
    data: BoardData;
    pmById: Map<string, ProjectManager>;
}) {
    const di = dayIndex(date);

    return (
        <>
            <div className="sp-dcell">
                <div className="dname">{DAY_NAMES[di]}</div>
                <div className="ddate">{formatLong(date)}</div>
                {/* Nobody is fitting on a bank holiday, so the day says so on
                    paper too — the sheet is what somebody plans from when they
                    are away from the board. */}
                {bankHoliday && <span className="tag">{bankHoliday}</span>}
                {away.length > 0 && <span className="tag away">Off: {away.join(', ')}</span>}
            </div>

            {data.vans.map((van) => {
                const cell = cellJobs(data.jobs, date, van.id);
                const crew = crews[van.id] ?? [];
                const warn = crewWarning(crew);

                return (
                    <div
                        key={van.id}
                        className={`sp-cell ${bankHoliday ? 'bankhol' : ''} ${di >= 5 ? 'wkend' : ''}`}
                    >
                        {/* Only on a day whose crew differs from the standing
                            pairing — the column header already says who is
                            normally on this van. */}
                        {override && (
                            <span className={`sp-crewbadge ${warn === 'empty' ? 'bad' : ''}`}>
                                {warn === 'empty'
                                    ? 'No crew'
                                    : warn === 'solo'
                                      ? `${crewLabel(crew, data.fitters)} only`
                                      : crewLabel(crew, data.fitters)}
                            </span>
                        )}

                        {SLOT_ORDER.filter((slot) => cell[slot].length > 0).map((slot) => (
                            <div key={slot} className="sp-slot">
                                <span className="sp-slotlabel">{SLOT_LABEL[slot]}</span>
                                {cell[slot].map((job) => (
                                    <Job
                                        key={job.id}
                                        job={job}
                                        pm={job.pm_id ? (pmById.get(job.pm_id) ?? null) : null}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                );
            })}
        </>
    );
}

/**
 * One day across a whole sheet — the largest type this page offers.
 *
 * Vans across the top as on the board, slots down the side, and only the slots
 * that carry work: a sheet for a single day has room to be generous, and empty
 * AM / PM bands would spend it on nothing.
 */
function DaySheet({
    date,
    data,
    pmById,
    holiday,
}: {
    date: string;
    data: BoardData;
    pmById: Map<string, ProjectManager>;
    holiday: string | null;
}) {
    const day = resolveDay(date, data.vans, data.fitters, data.defaultCrew, data.overrides);
    const cells = new Map(data.vans.map((v) => [v.id, cellJobs(data.jobs, date, v.id)] as const));
    const slots = SLOT_ORDER.filter((slot) =>
        data.vans.some((v) => (cells.get(v.id)?.[slot].length ?? 0) > 0)
    );

    return (
        <section className="sp-sheet">
            <div className="sp-inner">
                <SheetHead
                    when={`${DAY_NAMES[dayIndex(date)]} ${formatLong(date)}${
                        holiday ? ` — ${holiday}` : ''
                    }`}
                    pms={activePms(data.pms)}
                />

                {slots.length === 0 ? (
                    <p className="sp-empty">Nothing booked in.</p>
                ) : (
                    <div
                        className="sp-daygrid"
                        style={{ gridTemplateColumns: `24mm repeat(${data.vans.length}, 1fr)` }}
                    >
                        <div className="sp-hcell" />
                        {data.vans.map((v) => {
                            const crew = day.crews[v.id] ?? [];
                            return (
                                <div key={v.id} className="sp-hcell">
                                    <div className="van">{v.name}</div>
                                    <div className="crew">
                                        {crewWarning(crew) === 'empty'
                                            ? 'No crew'
                                            : crewLabel(crew, data.fitters)}
                                    </div>
                                </div>
                            );
                        })}

                        {slots.map((slot) => (
                            <DaySlotRow
                                key={slot}
                                slot={slot}
                                date={date}
                                vans={data.vans}
                                cells={cells}
                                pmById={pmById}
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}

function DaySlotRow({
    slot,
    date,
    vans,
    cells,
    pmById,
}: {
    slot: Slot;
    date: string;
    vans: Van[];
    cells: Map<string, Record<Slot, FittingJobView[]>>;
    pmById: Map<string, ProjectManager>;
}) {
    return (
        <>
            <div className="sp-slotcell">{SLOT_LABEL[slot]}</div>
            {vans.map((v) => (
                <div key={v.id} className="sp-cell">
                    {(cells.get(v.id)?.[slot] ?? []).map((job) => (
                        <Job
                            key={job.id}
                            job={job}
                            pm={job.pm_id ? (pmById.get(job.pm_id) ?? null) : null}
                            single={date}
                        />
                    ))}
                </div>
            ))}
        </>
    );
}

// ---------------------------------------------------------------------------
// A job, on paper
// ---------------------------------------------------------------------------

function Job({
    job,
    pm,
    single,
}: {
    job: FittingJobView;
    pm: ProjectManager | null;
    /** Set on a day sheet, where a span has to be spelled out. */
    single?: string;
}) {
    const meta = jobMeta(job);
    const extra = jobExtra(job);
    const summary = job.summary?.trim();

    // A day torn off on its own has no other days to compare against, so a
    // multi-day fit says where it sits. The week sheet needs no such tag: the
    // job is printed in every day it covers, which answers it already.
    const end = jobEndDate(job);
    const span =
        single && isMultiDay(job) && job.scheduled_date && end
            ? `${DAY_SHORT[dayIndex(job.scheduled_date)]}–${DAY_SHORT[dayIndex(end)]}`
            : null;

    return (
        <div
            className={`sp-job ${job.done ? 'done' : ''}`}
            style={{ ['--pm' as string]: pm?.colour ?? '#9aa5a8' }}
        >
            <div className="n">
                {job.done && <span className="tick">✓ </span>}
                {jobCustomer(job)}
            </div>
            {summary && <div className="s">{summary}</div>}
            {meta.length > 0 && (
                <div className="m">
                    {meta.map((m) => (
                        <span key={m}>{m}</span>
                    ))}
                </div>
            )}
            {extra && <div className="x">{extra}</div>}
            {/* Named, not only coloured: a mono printer throws the colour away,
                and whose job it is is the one thing on the card you cannot work
                out from the rest of it. */}
            {pm && <div className="pm">PM: {pm.name}</div>}
            {span && <div className="span">{span}</div>}
            {!job.done && job.delivery_required && <div className="del">Materials to deliver</div>}
        </div>
    );
}

/** What is waiting for a date, and what is going out without a fitting team. */
function Waiting({
    toSchedule,
    toDeliver,
}: {
    toSchedule: FittingJobView[];
    toDeliver: FittingJobView[];
}) {
    const line = (job: FittingJobView) =>
        [job.summary?.trim(), ...jobMeta(job)].filter(Boolean).join(' · ');

    return (
        <div className="sp-waiting">
            {toSchedule.length > 0 && (
                <>
                    <h2>To be scheduled ({toSchedule.length})</h2>
                    <div className="sp-waitlist">
                        {toSchedule.map((j) => (
                            <div key={j.id} className="w">
                                <b>{jobCustomer(j)}</b> <span>{line(j)}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
            {toDeliver.length > 0 && (
                <>
                    <h2>To be delivered ({toDeliver.length})</h2>
                    <div className="sp-waitlist">
                        {toDeliver.map((j) => (
                            <div key={j.id} className="w">
                                <b>{jobCustomer(j)}</b> <span>{line(j)}</span>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}
