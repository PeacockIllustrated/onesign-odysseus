/**
 * Pure helpers for the fitting schedule board. DOM-free and side-effect-free
 * so the whole engine is Vitest-covered without a browser or a live database
 * (same spirit as lib/nesting and lib/quoter/engine).
 *
 * All dates are handled as `YYYY-MM-DD` strings in local terms. Constructing
 * Date objects from those strings goes through `fromISO`, which builds a local
 * midnight rather than parsing as UTC — a UTC parse shifts the whole board by
 * a day for anyone west of Greenwich, and shifts it seasonally for us.
 */

import type {
    CrewWarning,
    DayAssignment,
    DayCrewOverrideRow,
    DefaultCrewRow,
    Fitter,
    FittingJobView,
    Placement,
    ResolvedDay,
    Slot,
    Van,
} from './types';

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

export const DAY_NAMES = [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday',
] as const;

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

export const MONTH_NAMES = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
] as const;

/** `YYYY-MM-DD` -> local-midnight Date. */
export function fromISO(iso: string): Date {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
}

/** Date -> `YYYY-MM-DD` in local terms. */
export function toISO(d: Date): string {
    const p = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function addDays(d: Date, n: number): Date {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

export function addDaysISO(iso: string, n: number): string {
    return toISO(addDays(fromISO(iso), n));
}

/**
 * Whole days from `a` to `b`, negative when b is earlier.
 *
 * Counted by walking local-midnight dates rather than dividing a millisecond
 * difference: across a DST boundary a day is 23 or 25 hours, and the division
 * silently loses or gains one.
 */
export function daysBetweenISO(a: string, b: string): number {
    const start = fromISO(a);
    const end = fromISO(b);
    const dir = end >= start ? 1 : -1;
    let n = 0;
    let cur = a;
    while (cur !== b) {
        cur = addDaysISO(cur, dir);
        n += dir;
        // A malformed date would otherwise loop forever.
        if (Math.abs(n) > 3660) return 0;
    }
    return n;
}

/** Monday of the week containing `d`. Weeks run Monday-first throughout. */
export function mondayOf(d: Date): Date {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
}

export function mondayOfISO(iso: string): string {
    return toISO(mondayOf(fromISO(iso)));
}

/** 0 = Monday … 6 = Sunday. */
export function dayIndex(iso: string): number {
    return (fromISO(iso).getDay() + 6) % 7;
}

/** Every Monday whose week touches the given month. */
export function mondaysTouchingMonth(year: number, month: number): string[] {
    const out: string[] = [];
    let mo = mondayOf(new Date(year, month, 1));
    const end = new Date(year, month + 1, 0);
    while (mo <= end) {
        out.push(toISO(mo));
        mo = addDays(mo, 7);
    }
    return out;
}

/** `w/c 17 Aug` — the board's compact week label. */
export function formatWC(iso: string): string {
    const d = fromISO(iso);
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()].slice(0, 3)}`;
}

/** `Monday 17 August 2026`. */
export function formatLong(iso: string): string {
    const d = fromISO(iso);
    return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Which day columns the week view shows. Weekends are hidden by default and
 * appear only when the toggle is on *or* a weekend day actually carries a job
 * — they're needed only occasionally, and an always-on weekend costs two
 * columns of width on a board read from across a room.
 */
export function visibleWeekDays(
    monday: string,
    jobs: Pick<FittingJobView, 'scheduled_date'>[],
    showWeekends: boolean
): string[] {
    const days = [0, 1, 2, 3, 4].map((i) => addDaysISO(monday, i));
    for (const i of [5, 6]) {
        const iso = addDaysISO(monday, i);
        if (showWeekends || jobs.some((j) => j.scheduled_date === iso)) {
            days.push(iso);
        }
    }
    return days;
}

/** Month-view row set: same weekend rule, applied across every w/c on screen. */
export function visibleMonthDayIndices(
    mondays: string[],
    jobs: Pick<FittingJobView, 'scheduled_date'>[],
    showWeekends: boolean
): number[] {
    const rows = [0, 1, 2, 3, 4];
    const weekIsos = new Set(mondays);
    for (const i of [5, 6]) {
        const hasJob = jobs.some(
            (j) =>
                j.scheduled_date != null &&
                dayIndex(j.scheduled_date) === i &&
                weekIsos.has(mondayOfISO(j.scheduled_date))
        );
        if (showWeekends || hasJob) rows.push(i);
    }
    return rows;
}

// ---------------------------------------------------------------------------
// Crew resolution
// ---------------------------------------------------------------------------

/**
 * The standing pairing, expressed as a placement per fitter. Anyone without a
 * default van is 'off' — in the workshop rather than out fitting.
 */
export function defaultAssignment(
    fitters: Fitter[],
    defaultCrew: DefaultCrewRow[]
): DayAssignment {
    const out: DayAssignment = {};
    for (const f of fitters) out[f.id] = { kind: 'off' };
    for (const row of defaultCrew) {
        if (out[row.fitter_id]) out[row.fitter_id] = { kind: 'van', vanId: row.van_id };
    }
    return out;
}

/**
 * Resolve a date by starting from the standing pairing and applying that
 * date's overrides. Overrides for fitters who have since been deactivated are
 * ignored, so a leaver can't reappear on a future day.
 */
export function assignmentForDate(
    date: string,
    fitters: Fitter[],
    defaultCrew: DefaultCrewRow[],
    overrides: DayCrewOverrideRow[]
): { assignment: DayAssignment; override: boolean } {
    const assignment = defaultAssignment(fitters, defaultCrew);
    const forDate = overrides.filter((o) => o.date === date && assignment[o.fitter_id]);
    for (const o of forDate) {
        assignment[o.fitter_id] =
            o.assignment === 'van' && o.van_id
                ? { kind: 'van', vanId: o.van_id }
                : ({ kind: o.assignment === 'van' ? 'off' : o.assignment } as Placement);
    }
    return { assignment, override: forDate.length > 0 };
}

/** Group a resolved day into per-van crews plus the holiday / off lists. */
export function resolveDay(
    date: string,
    vans: Van[],
    fitters: Fitter[],
    defaultCrew: DefaultCrewRow[],
    overrides: DayCrewOverrideRow[]
): ResolvedDay {
    const { assignment, override } = assignmentForDate(date, fitters, defaultCrew, overrides);
    const crews: Record<string, string[]> = {};
    for (const v of vans) crews[v.id] = [];
    const holiday: string[] = [];
    const off: string[] = [];

    // Iterate the roster, not the assignment map, so crews come out in roster
    // order rather than whatever order the rows arrived in.
    for (const f of fitters) {
        const p = assignment[f.id];
        if (!p) continue;
        if (p.kind === 'holiday') holiday.push(f.id);
        else if (p.kind === 'off') off.push(f.id);
        else if (crews[p.vanId]) crews[p.vanId].push(f.id);
    }
    return { crews, holiday, off, override };
}

/** One fitter on a van is a warning; nobody on it is an error. */
export function crewWarning(crew: string[]): CrewWarning {
    if (crew.length === 0) return 'empty';
    if (crew.length === 1) return 'solo';
    return 'none';
}

/** "Paul & Aaron" — the board's crew label. */
export function crewLabel(fitterIds: string[], fitters: Fitter[]): string {
    const byId = new Map(fitters.map((f) => [f.id, f.name]));
    return fitterIds
        .map((id) => byId.get(id))
        .filter((n): n is string => !!n)
        .join(' & ');
}

/**
 * Expand a holiday range into one override per working day. Weekends are
 * skipped unless asked for, since a fitter being "off" on a Saturday the board
 * doesn't show is noise.
 */
export function expandHolidayRange(
    from: string,
    to: string,
    includeWeekends = false
): string[] {
    const out: string[] = [];
    let cur = from;
    // Guard against an inverted range; the schema rejects it too, but this
    // function is called from tests and future callers directly.
    if (from > to) return out;
    while (cur <= to) {
        if (includeWeekends || dayIndex(cur) < 5) out.push(cur);
        cur = addDaysISO(cur, 1);
    }
    return out;
}

/**
 * Overrides worth persisting: rows that actually differ from the standing
 * pairing. Saving a day that matches the default would light the "crew change"
 * tag for no reason, so the editor stores nothing in that case.
 */
export function diffFromDefault(
    assignment: DayAssignment,
    fitters: Fitter[],
    defaultCrew: DefaultCrewRow[]
): { fitter_id: string; assignment: Placement }[] {
    const base = defaultAssignment(fitters, defaultCrew);
    const out: { fitter_id: string; assignment: Placement }[] = [];
    for (const [fitterId, placement] of Object.entries(assignment)) {
        const b = base[fitterId];
        if (!b) continue;
        const same =
            b.kind === placement.kind &&
            (b.kind !== 'van' ||
                (placement.kind === 'van' && b.vanId === placement.vanId));
        if (!same) out.push({ fitter_id: fitterId, assignment: placement });
    }
    return out;
}

// ---------------------------------------------------------------------------
// Job grouping
// ---------------------------------------------------------------------------

export const SLOT_ORDER: Slot[] = ['DAY', 'AM', 'PM', 'OOH'];

/**
 * Tick a weekday on or off a job's span, keeping the result contiguous.
 *
 * The office ticks days on a week, but a job is a range with a first and last
 * day — "Monday and Friday but not Tuesday" is two jobs, not one with a hole.
 * So the ticks drive the two ends and everything between comes along, which
 * is why the days inside a span render ticked and read-only.
 *
 * Rules, in the order a person would expect them:
 *  - a day outside the span extends the nearer end to reach it,
 *  - an end of a multi-day span pulls that end in by one,
 *  - a day inside a span truncates it there, so Mon–Wed then Tue gives Mon–Tue,
 *  - the only day of a single-day job does nothing: a job is always somewhere.
 */
export function toggleSpanDay(
    start: number,
    end: number,
    day: number
): { start: number; end: number } {
    if (day < start) return { start: day, end };
    if (day > end) return { start, end: day };
    if (start === end) return { start, end };
    if (day === start) return { start: start + 1, end };
    if (day === end) return { start, end: end - 1 };
    return { start, end: day };
}

/** Live board jobs — archived work never renders. */
export function liveJobs(jobs: FittingJobView[]): FittingJobView[] {
    return jobs.filter((j) => j.archived_at == null);
}

export function scheduledJobs(jobs: FittingJobView[]): FittingJobView[] {
    return liveJobs(jobs).filter((j) => j.scheduled_date != null);
}

/** The two holding panels: unscheduled work, split by lane. */
export function holdingJobs(jobs: FittingJobView[], lane: 'scheduled' | 'delivery') {
    return liveJobs(jobs)
        .filter((j) => j.scheduled_date == null && j.lane === lane)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));
}

const bySortThenCreated = (a: FittingJobView, b: FittingJobView) =>
    a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at);

/**
 * The last day a job occupies. A single-day job ends the day it starts, so
 * `end_date` being null is not a missing value — it is the common case.
 */
export function jobEndDate(job: FittingJobView): string | null {
    if (job.scheduled_date == null) return null;
    const end = job.end_date;
    // Defend against a row where end_date drifted before the start: render it
    // as a single day rather than as nothing at all.
    if (!end || end < job.scheduled_date) return job.scheduled_date;
    return end;
}

/** Does a multi-day job cover this date? */
export function jobCoversDate(job: FittingJobView, date: string): boolean {
    if (job.scheduled_date == null) return false;
    const end = jobEndDate(job);
    return job.scheduled_date <= date && end != null && date <= end;
}

/** True when the job runs across more than one day. */
export function isMultiDay(job: FittingJobView): boolean {
    const end = jobEndDate(job);
    return end != null && job.scheduled_date != null && end > job.scheduled_date;
}

/** Every date a job occupies, inclusive. Empty for an unscheduled job. */
export function jobDates(job: FittingJobView): string[] {
    if (job.scheduled_date == null) return [];
    const end = jobEndDate(job)!;
    const out: string[] = [];
    // Walk rather than diff: date arithmetic through the local-midnight helpers
    // is the only thing in here that survives a DST boundary intact.
    for (let d = job.scheduled_date; d <= end; d = addDaysISO(d, 1)) {
        out.push(d);
        // A corrupt row with a wild end_date must not spin forever.
        if (out.length > 366) break;
    }
    return out;
}

/**
 * Jobs in one day × van cell, split by slot.
 *
 * A multi-day job appears in the cell for every day it spans, which is what
 * makes it read as one job running Monday to Wednesday rather than three.
 */
export function cellJobs(
    jobs: FittingJobView[],
    date: string,
    vanId: string
): Record<Slot, FittingJobView[]> {
    const out: Record<Slot, FittingJobView[]> = { AM: [], PM: [], DAY: [], OOH: [] };
    for (const j of jobs) {
        if (j.archived_at != null) continue;
        if (j.van_id !== vanId || !jobCoversDate(j, date)) continue;
        out[j.slot].push(j);
    }
    for (const slot of SLOT_ORDER) out[slot].sort(bySortThenCreated);
    return out;
}

/**
 * Index the board once per render rather than filtering the whole job list per
 * cell — a year view over three vans is otherwise O(weeks × vans × jobs).
 * Key is `date|vanId`.
 */
export function indexByDateAndVan(
    jobs: FittingJobView[]
): Map<string, FittingJobView[]> {
    const map = new Map<string, FittingJobView[]>();
    for (const j of jobs) {
        if (j.archived_at != null || j.scheduled_date == null || j.van_id == null) continue;
        // A multi-day job is indexed under each of its days, so the month and
        // year views count it on every day it actually occupies a van.
        for (const date of jobDates(j)) {
            const key = `${date}|${j.van_id}`;
            const arr = map.get(key);
            if (arr) arr.push(j);
            else map.set(key, [j]);
        }
    }
    for (const arr of map.values()) arr.sort(bySortThenCreated);
    return map;
}

/** Live (not-yet-fitted) job count for a van across a week — the year heatmap. */
export function weekLoad(
    index: Map<string, FittingJobView[]>,
    monday: string,
    vanId: string
): number {
    let n = 0;
    for (let i = 0; i < 7; i++) {
        const cell = index.get(`${addDaysISO(monday, i)}|${vanId}`);
        if (cell) n += cell.filter((j) => !j.done).length;
    }
    return n;
}

/** Five-step heat bucket for the year view. */
export function heatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
    if (count === 0) return 0;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 7) return 3;
    return 4;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * What the card calls the client. The inherited org record wins; the free-text
 * fallback covers jobs that reached the board before a quote existed.
 */
export function jobCustomer(job: FittingJobView): string {
    return job.org_name?.trim() || job.customer_fallback?.trim() || 'Untitled job';
}

/** The card's second line: quote ref, then where it is. */
export function jobMeta(job: FittingJobView): string[] {
    const ref = job.quote_number?.trim() || job.quote_ref?.trim();
    const where = [job.location?.trim(), (job.postcode || job.site_postcode)?.trim()]
        .filter(Boolean)
        .join(', ');
    return [ref, where].filter((x): x is string => !!x);
}

/**
 * "Mon–Wed" for a job that runs across days, null for a single-day one.
 *
 * Shown on every card of the span rather than only the first, because each day
 * a card appears the reader is asking the same question — is this all of it,
 * or part of something longer?
 */
export function jobSpanLabel(job: FittingJobView): string | null {
    if (!isMultiDay(job) || job.scheduled_date == null) return null;
    const end = jobEndDate(job);
    if (end == null) return null;
    return `${DAY_SHORT[dayIndex(job.scheduled_date)]}–${DAY_SHORT[dayIndex(end)]}`;
}

/** The card's third line: crew override and access note. */
export function jobExtra(job: FittingJobView): string {
    return [
        job.crew_override?.trim() && `Crew: ${job.crew_override.trim()}`,
        job.access_equipment?.trim(),
    ]
        .filter(Boolean)
        .join(' · ');
}

/** Google Maps query for the job's site. Empty when there's nothing to search. */
export function mapQuery(job: FittingJobView): string {
    return [job.location?.trim(), (job.postcode || job.site_postcode)?.trim()]
        .filter(Boolean)
        .join(', ');
}

export function mapUrl(job: FittingJobView): string | null {
    const q = mapQuery(job);
    return q
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
        : null;
}
