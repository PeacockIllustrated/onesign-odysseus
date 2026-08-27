/**
 * UK bank holidays for the fitting schedule.
 *
 * Computed from the rules rather than held in a table of dates. A table has to
 * be topped up every couple of years, and the year it runs out the board
 * silently stops warning anybody — which is worse than not having it, because
 * by then people trust it.
 *
 * England & Wales, because that is where Onesign fits. Scotland and Northern
 * Ireland differ (2 January, St Andrew's Day, the Twelfth) and are not covered:
 * see `EXTRA_HOLIDAYS` for how to add a one-off.
 *
 * DOM-free and dependency-free, like the rest of `lib/schedule`.
 */

/** Local-midnight ISO date, matching the convention in utils.ts. */
function iso(y: number, m: number, d: number): string {
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function weekdayOf(isoDate: string): number {
    const [y, m, d] = isoDate.split('-').map(Number);
    // Constructed at local midnight so the day never shifts under a timezone.
    return new Date(y, m - 1, d).getDay();
}

function addDays(isoDate: string, n: number): string {
    const [y, m, d] = isoDate.split('-').map(Number);
    const next = new Date(y, m - 1, d + n);
    return iso(next.getFullYear(), next.getMonth() + 1, next.getDate());
}

/**
 * Easter Sunday, by the anonymous Gregorian algorithm (Meeus/Jones/Butcher).
 *
 * Good Friday and Easter Monday are the only two bank holidays that move, and
 * they move by this. Exported so the tests can pin it directly.
 */
export function easterSunday(year: number): string {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return iso(year, month, day);
}

/** First `weekday` (0=Sun) on or after the given date. */
function firstWeekdayOnOrAfter(from: string, weekday: number): string {
    let cur = from;
    for (let i = 0; i < 7; i++) {
        if (weekdayOf(cur) === weekday) return cur;
        cur = addDays(cur, 1);
    }
    return from;
}

/** Last `weekday` (0=Sun) in a month. */
function lastWeekdayOfMonth(year: number, month: number, weekday: number): string {
    // Day 0 of the next month is the last day of this one.
    const last = new Date(year, month, 0).getDate();
    let cur = iso(year, month, last);
    for (let i = 0; i < 7; i++) {
        if (weekdayOf(cur) === weekday) return cur;
        cur = addDays(cur, -1);
    }
    return cur;
}

/**
 * A fixed-date holiday landing on a weekend moves to the next weekday that is
 * not already a holiday — which is why Christmas on a Saturday pushes Boxing
 * Day to the Tuesday rather than both landing on the Monday.
 */
function substitute(date: string, taken: Set<string>): string {
    let cur = date;
    while (weekdayOf(cur) === 0 || weekdayOf(cur) === 6 || taken.has(cur)) {
        cur = addDays(cur, 1);
    }
    return cur;
}

/**
 * One-off holidays that no rule predicts — a coronation, a jubilee, a state
 * funeral. Add them here as they are announced; keyed by ISO date.
 */
export const EXTRA_HOLIDAYS: Record<string, string> = {
    // '2023-05-08': 'Coronation of King Charles III',
};

export interface BankHoliday {
    date: string;
    name: string;
    /** True when the date moved because the real one fell at a weekend. */
    substitute: boolean;
}

/** England & Wales bank holidays for one calendar year, in date order. */
export function ukBankHolidays(year: number): BankHoliday[] {
    const taken = new Set<string>();
    const out: BankHoliday[] = [];

    const add = (date: string, name: string, isSub = false) => {
        taken.add(date);
        out.push({ date, name, substitute: isSub });
    };

    const newYear = iso(year, 1, 1);
    const newYearActual = substitute(newYear, taken);
    add(newYearActual, "New Year's Day", newYearActual !== newYear);

    const easter = easterSunday(year);
    add(addDays(easter, -2), 'Good Friday');
    add(addDays(easter, 1), 'Easter Monday');

    // First Monday in May, last Monday in May, last Monday in August.
    add(firstWeekdayOnOrAfter(iso(year, 5, 1), 1), 'Early May bank holiday');
    add(lastWeekdayOfMonth(year, 5, 1), 'Spring bank holiday');
    add(lastWeekdayOfMonth(year, 8, 1), 'Summer bank holiday');

    // Christmas before Boxing Day: the order decides which substitute lands
    // on the Monday when both fall at a weekend.
    const xmas = iso(year, 12, 25);
    const xmasActual = substitute(xmas, taken);
    add(xmasActual, 'Christmas Day', xmasActual !== xmas);

    const boxing = iso(year, 12, 26);
    const boxingActual = substitute(boxing, taken);
    add(boxingActual, 'Boxing Day', boxingActual !== boxing);

    for (const [date, name] of Object.entries(EXTRA_HOLIDAYS)) {
        if (date.startsWith(String(year))) add(date, name);
    }

    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Lookup for a span of dates. Built per render rather than cached globally:
 * a board shows at most a year, and the whole computation is a few dozen
 * date operations.
 */
export function bankHolidayMap(fromYear: number, toYear: number): Map<string, string> {
    const map = new Map<string, string>();
    for (let y = fromYear; y <= toYear; y++) {
        for (const h of ukBankHolidays(y)) {
            map.set(h.date, h.name + (h.substitute ? ' (substitute day)' : ''));
        }
    }
    return map;
}

/** The bank holiday on this date, or null. Convenience for a single lookup. */
export function bankHolidayOn(isoDate: string): string | null {
    const year = Number(isoDate.slice(0, 4));
    if (!Number.isFinite(year)) return null;
    return bankHolidayMap(year, year).get(isoDate) ?? null;
}
