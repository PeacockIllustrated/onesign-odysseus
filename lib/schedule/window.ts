/**
 * Which dates the server loads for a given view.
 *
 * View state is a URL param, so the server knows up front whether it is
 * serving one week, a month of weeks, or a year of counts — a month view fed
 * only the current week's rows would quietly render an empty board.
 */

import { addDaysISO, mondayOfISO, mondaysTouchingMonth, toISO } from './utils';

export type ScheduleView = 'week' | 'month' | 'year';

export interface ScheduleWindow {
    view: ScheduleView;
    monday: string;
    month: { y: number; m: number };
    year: number;
    from: string;
    to: string;
}

function asInt(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isInteger(n) ? n : fallback;
}

export function resolveScheduleWindow(params: {
    view?: string;
    week?: string;
    month?: string;
    year?: string;
}): ScheduleWindow {
    const now = new Date();
    const today = toISO(now);

    const view: ScheduleView =
        params.view === 'month' || params.view === 'year' ? params.view : 'week';

    // A malformed ?week= falls back to this week rather than 500ing the board.
    const week = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? '')
        ? mondayOfISO(params.week!)
        : mondayOfISO(today);

    const year = asInt(params.year, now.getFullYear());
    const rawMonth = asInt(params.month, now.getMonth());
    const month = { y: year, m: Math.min(11, Math.max(0, rawMonth)) };

    if (view === 'week') {
        return { view, monday: week, month, year, from: week, to: addDaysISO(week, 6) };
    }

    if (view === 'month') {
        const mondays = mondaysTouchingMonth(month.y, month.m);
        return {
            view,
            monday: week,
            month,
            year,
            from: mondays[0],
            to: addDaysISO(mondays[mondays.length - 1], 6),
        };
    }

    // The year view only counts jobs, but it counts every week on screen —
    // including the weeks either side that straddle January and December.
    return {
        view,
        monday: week,
        month,
        year,
        from: addDaysISO(mondayOfISO(`${year}-01-01`), 0),
        to: addDaysISO(mondayOfISO(`${year}-12-31`), 6),
    };
}
