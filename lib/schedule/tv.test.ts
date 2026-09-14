import { describe, it, expect } from 'vitest';
import {
    keyToTvAction,
    monthOfWeek,
    nextTvView,
    fitScale,
    weekOfMonthStart,
    MAX_FIT_SCALE,
    TV_CYCLE_VIEWS,
    type TvView,
} from './tv';

describe('nextTvView', () => {
    it('alternates between the two views a wall screen needs', () => {
        expect(nextTvView('week')).toBe('month');
        expect(nextTvView('month')).toBe('week');
    });

    it('lets a down-press escape the year view', () => {
        // ?view=year is reachable from the office board's TV-view button, so
        // the remote has to have a way out of it.
        expect(nextTvView('year')).toBe('week');
    });

    it('only ever lands on a view in the cycle', () => {
        for (const v of ['week', 'month', 'year'] as TvView[]) {
            expect(TV_CYCLE_VIEWS).toContain(nextTvView(v));
        }
    });
});

describe('keyToTvAction', () => {
    it('steps the period with left/right — what the wall is actually used for', () => {
        expect(keyToTvAction('ArrowLeft')).toBe('period-prev');
        expect(keyToTvAction('ArrowRight')).toBe('period-next');
    });

    it('keeps the channel keys on the period too', () => {
        expect(keyToTvAction('PageUp')).toBe('period-prev');
        expect(keyToTvAction('PageDown')).toBe('period-next');
    });

    it('swaps the view on down and the spare van on up', () => {
        expect(keyToTvAction('ArrowDown')).toBe('view-cycle');
        expect(keyToTvAction('ArrowUp')).toBe('toggle-van');
    });

    it('returns to today on Home or Enter', () => {
        expect(keyToTvAction('Home')).toBe('today');
        expect(keyToTvAction('Enter')).toBe('today');
    });

    it('ignores anything else', () => {
        expect(keyToTvAction('a')).toBeNull();
        expect(keyToTvAction('Escape')).toBeNull();
        expect(keyToTvAction(' ')).toBeNull();
    });
});

describe('monthOfWeek', () => {
    it('reads the month off the week itself', () => {
        // Mon 17 Aug 2026.
        expect(monthOfWeek('2026-08-17')).toEqual({ y: 2026, m: 7 });
    });

    it('gives a straddling week to the month holding most of it', () => {
        // Mon 29 Jun 2026 — Thursday is 2 July, so the week is July's.
        expect(monthOfWeek('2026-06-29')).toEqual({ y: 2026, m: 6 });
        // Mon 27 Jul 2026 — Thursday is 30 July, so it stays in July.
        expect(monthOfWeek('2026-07-27')).toEqual({ y: 2026, m: 6 });
    });

    it('crosses the turn of the year', () => {
        // Mon 28 Dec 2026 — Thursday is 31 December.
        expect(monthOfWeek('2026-12-28')).toEqual({ y: 2026, m: 11 });
        // Mon 29 Dec 2025 — Thursday is 1 January 2026.
        expect(monthOfWeek('2025-12-29')).toEqual({ y: 2026, m: 0 });
    });
});

describe('weekOfMonthStart', () => {
    it('lands on the first week the month owns', () => {
        // 1 Sep 2026 is a Tuesday, so that week is September's.
        expect(weekOfMonthStart(2026, 8)).toBe('2026-08-31');
        // 1 Jun 2026 is itself a Monday.
        expect(weekOfMonthStart(2026, 5)).toBe('2026-06-01');
        // 1 Aug 2026 is a Saturday: its week is mostly July, so August starts
        // on the 3rd rather than bouncing the board back a month.
        expect(weekOfMonthStart(2026, 7)).toBe('2026-08-03');
    });

    it('round-trips every month of several years through a week and back', () => {
        // Down then up must land where it started, whatever day the month
        // opens on.
        for (const y of [2025, 2026, 2027, 2028]) {
            for (let m = 0; m < 12; m++) {
                expect(monthOfWeek(weekOfMonthStart(y, m))).toEqual({ y, m });
            }
        }
    });
});

describe('fitScale', () => {
    it('shrinks to fit', () => {
        expect(fitScale(1000, 500)).toBe(0.5);
    });

    it('grows a quiet board to fill the panel rather than leaving it black', () => {
        expect(fitScale(800, 1000)).toBe(1.25);
    });

    it('caps how far a nearly-empty board is blown up', () => {
        expect(fitScale(100, 1000)).toBe(MAX_FIT_SCALE);
    });

    it('returns 1 for an unmeasured element rather than collapsing it', () => {
        expect(fitScale(0, 800)).toBe(1);
        expect(fitScale(800, 0)).toBe(1);
    });
});

describe('fitting past the old legibility floor', () => {
    it('keeps shrinking instead of hiding anything', () => {
        // The board used to stop here and collapse cards to one line, rotating
        // the detail through them. It now just gets smaller, because a small
        // board that shows Friday beats a big one that does not.
        expect(fitScale(3000, 900)).toBeCloseTo(0.3);
        expect(fitScale(6000, 900)).toBeCloseTo(0.15);
    });

    it('has no lower bound at all', () => {
        expect(fitScale(100000, 900)).toBeGreaterThan(0);
        expect(fitScale(100000, 900)).toBeLessThan(0.01);
    });
});
