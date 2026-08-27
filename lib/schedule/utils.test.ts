import { describe, it, expect } from 'vitest';
import {
    addDaysISO,
    assignmentForDate,
    cellJobs,
    crewLabel,
    crewWarning,
    dayIndex,
    defaultAssignment,
    diffFromDefault,
    expandHolidayRange,
    formatWC,
    fromISO,
    heatLevel,
    holdingJobs,
    indexByDateAndVan,
    jobCustomer,
    jobMeta,
    mapUrl,
    mondayOfISO,
    mondaysTouchingMonth,
    resolveDay,
    toISO,
    visibleMonthDayIndices,
    visibleWeekDays,
    weekLoad,
    jobEndDate,
    jobCoversDate,
    isMultiDay,
    jobDates,
    daysBetweenISO,
    toggleSpanDay,
} from './utils';
import type {
    DayCrewOverrideRow,
    DefaultCrewRow,
    Fitter,
    FittingJobView,
    Van,
} from './types';

// --- fixtures --------------------------------------------------------------

const VANS: Van[] = [
    { id: 'v1', name: 'Van 1', sort_order: 1, is_active: true, is_additional: false },
    { id: 'v2', name: 'Van 2', sort_order: 2, is_active: true, is_additional: false },
    { id: 'v3', name: 'Van 3', sort_order: 3, is_active: true, is_additional: false },
];

const FITTERS: Fitter[] = [
    { id: 'paul', name: 'Paul', roster_group: 'crew', sort_order: 1, is_active: true },
    { id: 'aaron', name: 'Aaron', roster_group: 'crew', sort_order: 2, is_active: true },
    { id: 'dave', name: 'Dave', roster_group: 'crew', sort_order: 3, is_active: true },
    { id: 'mark', name: 'Mark', roster_group: 'crew', sort_order: 4, is_active: true },
    { id: 'lewis', name: 'Lewis', roster_group: 'crew', sort_order: 5, is_active: true },
    { id: 'josh', name: 'Josh', roster_group: 'crew', sort_order: 6, is_active: true },
    { id: 'mak', name: 'Mak', roster_group: 'additional', sort_order: 1, is_active: true },
];

const DEFAULT_CREW: DefaultCrewRow[] = [
    { van_id: 'v1', fitter_id: 'paul' },
    { van_id: 'v1', fitter_id: 'aaron' },
    { van_id: 'v2', fitter_id: 'dave' },
    { van_id: 'v2', fitter_id: 'mark' },
    { van_id: 'v3', fitter_id: 'josh' },
    { van_id: 'v3', fitter_id: 'lewis' },
];

let jobSeq = 0;
function job(over: Partial<FittingJobView> = {}): FittingJobView {
    jobSeq += 1;
    return {
        id: `job-${jobSeq}`,
        job_ref: `FIT-2026-${String(jobSeq).padStart(6, '0')}`,
        org_id: null, contact_id: null, site_id: null,
        quote_id: null, production_job_id: null,
        customer_fallback: 'Test Customer',
        quote_ref: null, location: null, postcode: null,
        latitude: null, longitude: null,
        pm_id: 'pm-adam',
        van_id: 'v1',
        scheduled_date: '2026-08-17', end_date: null,
        lane: 'scheduled', slot: 'AM', sort_order: 0,
        done: false, done_at: null,
        delivery_required: false, delivery_id: null,
        crew_override: null, access_equipment: null, summary: null, notes: null,
        archived_at: null,
        created_by: null, updated_by: null,
        created_at: `2026-08-01T00:00:${String(jobSeq).padStart(2, '0')}Z`,
        updated_at: '2026-08-01T00:00:00Z',
        org_name: null, site_name: null, site_postcode: null,
        contact_name: null, quote_number: null, updated_by_name: null,
        ...over,
    };
}

// --- dates -----------------------------------------------------------------

describe('date helpers', () => {
    it('round-trips ISO through a local-midnight Date', () => {
        expect(toISO(fromISO('2026-08-17'))).toBe('2026-08-17');
    });

    it('does not shift the day when parsing (the UTC-parse trap)', () => {
        // A `new Date('2026-08-17')` parse is UTC midnight, which is the
        // previous day anywhere west of Greenwich.
        expect(fromISO('2026-08-17').getDate()).toBe(17);
        expect(fromISO('2026-01-01').getMonth()).toBe(0);
    });

    it('finds the Monday of a week, Monday-first', () => {
        expect(mondayOfISO('2026-08-17')).toBe('2026-08-17'); // a Monday
        expect(mondayOfISO('2026-08-21')).toBe('2026-08-17'); // Friday
        expect(mondayOfISO('2026-08-23')).toBe('2026-08-17'); // Sunday belongs back
    });

    it('indexes days Monday=0 through Sunday=6', () => {
        expect(dayIndex('2026-08-17')).toBe(0);
        expect(dayIndex('2026-08-22')).toBe(5);
        expect(dayIndex('2026-08-23')).toBe(6);
    });

    it('adds days across a month boundary', () => {
        expect(addDaysISO('2026-08-31', 1)).toBe('2026-09-01');
        expect(addDaysISO('2026-01-01', -1)).toBe('2025-12-31');
    });

    it('lists every Monday touching a month', () => {
        // 1 Aug 2026 is a Saturday, so the first w/c is 27 Jul.
        const mondays = mondaysTouchingMonth(2026, 7);
        expect(mondays[0]).toBe('2026-07-27');
        expect(mondays).toContain('2026-08-31');
        expect(mondays.every((m) => dayIndex(m) === 0)).toBe(true);
    });

    it('formats the compact week label', () => {
        expect(formatWC('2026-08-17')).toBe('17 Aug');
    });
});

// --- weekend reveal --------------------------------------------------------

describe('visibleWeekDays', () => {
    it('hides weekends by default', () => {
        expect(visibleWeekDays('2026-08-17', [], false)).toHaveLength(5);
    });

    it('shows weekends when the toggle is on', () => {
        expect(visibleWeekDays('2026-08-17', [], true)).toHaveLength(7);
    });

    it('reveals a weekend day that actually carries a job', () => {
        const days = visibleWeekDays(
            '2026-08-17',
            [job({ scheduled_date: '2026-08-22' })],
            false
        );
        expect(days).toHaveLength(6);
        expect(days).toContain('2026-08-22');
        expect(days).not.toContain('2026-08-23');
    });

    it('ignores a weekend job in a different week', () => {
        const days = visibleWeekDays(
            '2026-08-17',
            [job({ scheduled_date: '2026-08-29' })],
            false
        );
        expect(days).toHaveLength(5);
    });
});

describe('visibleMonthDayIndices', () => {
    const mondays = ['2026-08-17', '2026-08-24'];

    it('hides weekend rows by default', () => {
        expect(visibleMonthDayIndices(mondays, [], false)).toEqual([0, 1, 2, 3, 4]);
    });

    it('reveals a weekend row when a job lands on it in a visible week', () => {
        const rows = visibleMonthDayIndices(
            mondays,
            [job({ scheduled_date: '2026-08-22' })],
            false
        );
        expect(rows).toContain(5);
        expect(rows).not.toContain(6);
    });

    it('ignores weekend jobs from weeks not on screen', () => {
        const rows = visibleMonthDayIndices(
            mondays,
            [job({ scheduled_date: '2026-09-12' })],
            false
        );
        expect(rows).toEqual([0, 1, 2, 3, 4]);
    });
});

// --- crew resolution -------------------------------------------------------

describe('defaultAssignment', () => {
    it('places standing crews on their vans and everyone else off', () => {
        const a = defaultAssignment(FITTERS, DEFAULT_CREW);
        expect(a['paul']).toEqual({ kind: 'van', vanId: 'v1' });
        expect(a['lewis']).toEqual({ kind: 'van', vanId: 'v3' });
        expect(a['mak']).toEqual({ kind: 'off' });
    });
});

describe('assignmentForDate', () => {
    it('reports no override for a plain day', () => {
        const { override } = assignmentForDate('2026-08-17', FITTERS, DEFAULT_CREW, []);
        expect(override).toBe(false);
    });

    it('applies that day\'s overrides over the standing pairing', () => {
        const overrides: DayCrewOverrideRow[] = [
            { id: 'o1', date: '2026-08-19', fitter_id: 'lewis', assignment: 'holiday', van_id: null },
            { id: 'o2', date: '2026-08-19', fitter_id: 'mak', assignment: 'van', van_id: 'v3' },
        ];
        const { assignment, override } = assignmentForDate(
            '2026-08-19', FITTERS, DEFAULT_CREW, overrides
        );
        expect(override).toBe(true);
        expect(assignment['lewis']).toEqual({ kind: 'holiday' });
        expect(assignment['mak']).toEqual({ kind: 'van', vanId: 'v3' });
        expect(assignment['paul']).toEqual({ kind: 'van', vanId: 'v1' });
    });

    it('leaves other dates untouched', () => {
        const overrides: DayCrewOverrideRow[] = [
            { id: 'o1', date: '2026-08-19', fitter_id: 'lewis', assignment: 'holiday', van_id: null },
        ];
        const { assignment, override } = assignmentForDate(
            '2026-08-20', FITTERS, DEFAULT_CREW, overrides
        );
        expect(override).toBe(false);
        expect(assignment['lewis']).toEqual({ kind: 'van', vanId: 'v3' });
    });

    it('ignores an override for a fitter no longer on the roster', () => {
        const overrides: DayCrewOverrideRow[] = [
            { id: 'o1', date: '2026-08-19', fitter_id: 'leaver', assignment: 'van', van_id: 'v1' },
        ];
        const { assignment, override } = assignmentForDate(
            '2026-08-19', FITTERS, DEFAULT_CREW, overrides
        );
        expect(assignment['leaver']).toBeUndefined();
        expect(override).toBe(false);
    });
});

describe('resolveDay', () => {
    it('groups the standing crews per van', () => {
        const r = resolveDay('2026-08-17', VANS, FITTERS, DEFAULT_CREW, []);
        expect(r.crews['v1']).toEqual(['paul', 'aaron']);
        // Roster order, not the order the pairing rows arrived in.
        expect(r.crews['v3']).toEqual(['lewis', 'josh']);
        expect(r.holiday).toEqual([]);
        expect(r.off).toEqual(['mak']);
    });

    it('models the agreed case: Lewis and Josh both off on the Wednesday', () => {
        const overrides: DayCrewOverrideRow[] = [
            { id: 'o1', date: '2026-08-19', fitter_id: 'lewis', assignment: 'holiday', van_id: null },
            { id: 'o2', date: '2026-08-19', fitter_id: 'josh', assignment: 'holiday', van_id: null },
        ];
        const r = resolveDay('2026-08-19', VANS, FITTERS, DEFAULT_CREW, overrides);
        expect(r.crews['v3']).toEqual([]);
        expect(r.holiday).toEqual(['lewis', 'josh']);
        expect(r.override).toBe(true);
        expect(crewWarning(r.crews['v3'])).toBe('empty');
    });

    it('returns crews in roster order regardless of row order', () => {
        const shuffled = [...DEFAULT_CREW].reverse();
        const r = resolveDay('2026-08-17', VANS, FITTERS, shuffled, []);
        expect(r.crews['v1']).toEqual(['paul', 'aaron']);
    });
});

describe('crewWarning', () => {
    it('flags an empty van as an error and a solo fitter as a warning', () => {
        expect(crewWarning([])).toBe('empty');
        expect(crewWarning(['paul'])).toBe('solo');
        expect(crewWarning(['paul', 'aaron'])).toBe('none');
    });
});

describe('crewLabel', () => {
    it('joins names with an ampersand and drops unknown ids', () => {
        expect(crewLabel(['paul', 'aaron'], FITTERS)).toBe('Paul & Aaron');
        expect(crewLabel(['paul', 'ghost'], FITTERS)).toBe('Paul');
    });
});

// --- holidays --------------------------------------------------------------

describe('expandHolidayRange', () => {
    it('expands a fortnight into working days only', () => {
        // Wed 12 Aug 2026 to Wed 19 Aug 2026.
        const days = expandHolidayRange('2026-08-12', '2026-08-19');
        expect(days).toEqual([
            '2026-08-12', '2026-08-13', '2026-08-14',
            '2026-08-17', '2026-08-18', '2026-08-19',
        ]);
    });

    it('includes weekends when asked', () => {
        expect(expandHolidayRange('2026-08-14', '2026-08-17', true)).toHaveLength(4);
    });

    it('handles a single day', () => {
        expect(expandHolidayRange('2026-08-17', '2026-08-17')).toEqual(['2026-08-17']);
    });

    it('returns nothing for an inverted range', () => {
        expect(expandHolidayRange('2026-08-19', '2026-08-12')).toEqual([]);
    });

    it('returns nothing for a weekend-only range with weekends excluded', () => {
        expect(expandHolidayRange('2026-08-22', '2026-08-23')).toEqual([]);
    });
});

// --- override diffing ------------------------------------------------------

describe('diffFromDefault', () => {
    it('stores nothing when the day matches the standing pairing', () => {
        const a = defaultAssignment(FITTERS, DEFAULT_CREW);
        expect(diffFromDefault(a, FITTERS, DEFAULT_CREW)).toEqual([]);
    });

    it('stores only the fitters who actually moved', () => {
        const a = defaultAssignment(FITTERS, DEFAULT_CREW);
        a['lewis'] = { kind: 'holiday' };
        a['mak'] = { kind: 'van', vanId: 'v3' };
        const diff = diffFromDefault(a, FITTERS, DEFAULT_CREW);
        expect(diff).toHaveLength(2);
        expect(diff.map((d) => d.fitter_id).sort()).toEqual(['lewis', 'mak']);
    });

    it('treats a van swap as a change', () => {
        const a = defaultAssignment(FITTERS, DEFAULT_CREW);
        a['paul'] = { kind: 'van', vanId: 'v2' };
        expect(diffFromDefault(a, FITTERS, DEFAULT_CREW)).toEqual([
            { fitter_id: 'paul', assignment: { kind: 'van', vanId: 'v2' } },
        ]);
    });
});

// --- job grouping ----------------------------------------------------------

describe('cellJobs', () => {
    it('splits a cell by slot and excludes other cells', () => {
        const jobs = [
            job({ slot: 'AM' }),
            job({ slot: 'PM' }),
            job({ slot: 'DAY' }),
            job({ slot: 'OOH' }),
            job({ slot: 'AM', van_id: 'v2' }),
            job({ slot: 'AM', scheduled_date: '2026-08-18' }),
        ];
        const cell = cellJobs(jobs, '2026-08-17', 'v1');
        expect(cell.AM).toHaveLength(1);
        expect(cell.PM).toHaveLength(1);
        expect(cell.DAY).toHaveLength(1);
        expect(cell.OOH).toHaveLength(1);
    });

    it('stacks several jobs in one slot with no cap', () => {
        const jobs = Array.from({ length: 5 }, () => job({ slot: 'AM' }));
        expect(cellJobs(jobs, '2026-08-17', 'v1').AM).toHaveLength(5);
    });

    it('never renders archived work', () => {
        const jobs = [job({ slot: 'AM' }), job({ slot: 'AM', archived_at: '2026-08-02T00:00:00Z' })];
        expect(cellJobs(jobs, '2026-08-17', 'v1').AM).toHaveLength(1);
    });

    it('keeps completed jobs in place as a permanent record', () => {
        const jobs = [job({ slot: 'AM', done: true, done_at: '2026-08-17T15:00:00Z' })];
        expect(cellJobs(jobs, '2026-08-17', 'v1').AM).toHaveLength(1);
    });

    it('orders by sort_order then creation', () => {
        const a = job({ slot: 'AM', sort_order: 2 });
        const b = job({ slot: 'AM', sort_order: 1 });
        expect(cellJobs([a, b], '2026-08-17', 'v1').AM.map((j) => j.id)).toEqual([b.id, a.id]);
    });
});

describe('holdingJobs', () => {
    it('separates the two panels and excludes scheduled work', () => {
        const jobs = [
            job({ scheduled_date: null, van_id: null, lane: 'scheduled' }),
            job({ scheduled_date: null, van_id: null, lane: 'delivery' }),
            job({ scheduled_date: null, van_id: null, lane: 'delivery' }),
            job(),
        ];
        expect(holdingJobs(jobs, 'scheduled')).toHaveLength(1);
        expect(holdingJobs(jobs, 'delivery')).toHaveLength(2);
    });

    it('excludes archived jobs from the panels', () => {
        const jobs = [
            job({ scheduled_date: null, van_id: null, lane: 'scheduled', archived_at: '2026-08-02T00:00:00Z' }),
        ];
        expect(holdingJobs(jobs, 'scheduled')).toHaveLength(0);
    });
});

describe('indexByDateAndVan / weekLoad / heatLevel', () => {
    it('indexes only placed, live jobs', () => {
        const idx = indexByDateAndVan([
            job(),
            job({ scheduled_date: null, van_id: null }),
            job({ archived_at: '2026-08-02T00:00:00Z' }),
        ]);
        expect(idx.get('2026-08-17|v1')).toHaveLength(1);
    });

    it('counts a van\'s live load across the week, ignoring fitted work', () => {
        const idx = indexByDateAndVan([
            job({ scheduled_date: '2026-08-17' }),
            job({ scheduled_date: '2026-08-19' }),
            job({ scheduled_date: '2026-08-20', done: true }),
            job({ scheduled_date: '2026-08-19', van_id: 'v2' }),
        ]);
        expect(weekLoad(idx, '2026-08-17', 'v1')).toBe(2);
        expect(weekLoad(idx, '2026-08-17', 'v2')).toBe(1);
        expect(weekLoad(idx, '2026-08-24', 'v1')).toBe(0);
    });

    it('buckets load into five heat levels', () => {
        expect(heatLevel(0)).toBe(0);
        expect(heatLevel(2)).toBe(1);
        expect(heatLevel(4)).toBe(2);
        expect(heatLevel(7)).toBe(3);
        expect(heatLevel(12)).toBe(4);
    });
});

// --- display ---------------------------------------------------------------

describe('job display helpers', () => {
    it('prefers the inherited client record over the free-text fallback', () => {
        expect(jobCustomer(job({ org_name: 'Robertson', customer_fallback: 'typo' })))
            .toBe('Robertson');
        expect(jobCustomer(job({ org_name: null, customer_fallback: 'Lennys' })))
            .toBe('Lennys');
        expect(jobCustomer(job({ org_name: null, customer_fallback: null })))
            .toBe('Untitled job');
    });

    it('prefers the linked quote number over the free-text ref', () => {
        expect(jobMeta(job({ quote_number: 'OSD-2026-000123', quote_ref: 'Q-999' })))
            .toContain('OSD-2026-000123');
    });

    it('falls back to the site postcode when the job carries none', () => {
        expect(jobMeta(job({ location: 'Hebburn', postcode: null, site_postcode: 'NE31 1LA' })))
            .toEqual(['Hebburn, NE31 1LA']);
    });

    it('builds a maps link only when there is something to search', () => {
        expect(mapUrl(job({ location: 'Durham', postcode: 'DH1 3EX' })))
            .toBe('https://www.google.com/maps/search/?api=1&query=Durham%2C%20DH1%203EX');
        expect(mapUrl(job({ location: null, postcode: null }))).toBeNull();
    });
});

// --- multi-day jobs --------------------------------------------------------

describe('multi-day spans', () => {
    it('treats a null end_date as a single day, not a missing value', () => {
        const j = job({ scheduled_date: '2026-08-17', end_date: null });
        expect(jobEndDate(j)).toBe('2026-08-17');
        expect(isMultiDay(j)).toBe(false);
        expect(jobDates(j)).toEqual(['2026-08-17']);
    });

    it('expands a span to every day it occupies, inclusive', () => {
        const j = job({ scheduled_date: '2026-08-17', end_date: '2026-08-19' });
        expect(isMultiDay(j)).toBe(true);
        expect(jobDates(j)).toEqual(['2026-08-17', '2026-08-18', '2026-08-19']);
    });

    it('covers every day between the ends and nothing outside them', () => {
        const j = job({ scheduled_date: '2026-08-17', end_date: '2026-08-19' });
        expect(jobCoversDate(j, '2026-08-16')).toBe(false);
        expect(jobCoversDate(j, '2026-08-17')).toBe(true);
        expect(jobCoversDate(j, '2026-08-18')).toBe(true);
        expect(jobCoversDate(j, '2026-08-19')).toBe(true);
        expect(jobCoversDate(j, '2026-08-20')).toBe(false);
    });

    it('renders a row whose end drifted before its start as a single day', () => {
        const j = job({ scheduled_date: '2026-08-17', end_date: '2026-08-10' });
        expect(jobEndDate(j)).toBe('2026-08-17');
        expect(jobDates(j)).toEqual(['2026-08-17']);
    });

    it('has no dates at all while unscheduled', () => {
        const j = job({ scheduled_date: null, van_id: null, end_date: null });
        expect(jobDates(j)).toEqual([]);
        expect(jobCoversDate(j, '2026-08-17')).toBe(false);
    });

    it('puts a spanning job in the cell for each of its days', () => {
        const jobs = [job({ scheduled_date: '2026-08-17', end_date: '2026-08-19', van_id: 'v1', slot: 'DAY' })];
        expect(cellJobs(jobs, '2026-08-17', 'v1').DAY).toHaveLength(1);
        expect(cellJobs(jobs, '2026-08-18', 'v1').DAY).toHaveLength(1);
        expect(cellJobs(jobs, '2026-08-19', 'v1').DAY).toHaveLength(1);
        expect(cellJobs(jobs, '2026-08-20', 'v1').DAY).toHaveLength(0);
    });

    it('keeps a spanning job to its own van', () => {
        const jobs = [job({ scheduled_date: '2026-08-17', end_date: '2026-08-19', van_id: 'v1' })];
        expect(cellJobs(jobs, '2026-08-18', 'v2').AM).toHaveLength(0);
    });

    it('indexes a spanning job under every day for the month and year views', () => {
        const j = job({ scheduled_date: '2026-08-17', end_date: '2026-08-19', van_id: 'v1' });
        const index = indexByDateAndVan([j]);
        expect(index.get('2026-08-17|v1')).toHaveLength(1);
        expect(index.get('2026-08-18|v1')).toHaveLength(1);
        expect(index.get('2026-08-19|v1')).toHaveLength(1);
        expect(index.get('2026-08-20|v1')).toBeUndefined();
    });

    it('counts a spanning job on every day of the week load', () => {
        const j = job({ scheduled_date: '2026-08-17', end_date: '2026-08-19', van_id: 'v1', done: false });
        expect(weekLoad(indexByDateAndVan([j]), '2026-08-17', 'v1')).toBe(3);
    });
});

describe('daysBetweenISO', () => {
    it('counts forwards and backwards', () => {
        expect(daysBetweenISO('2026-08-17', '2026-08-20')).toBe(3);
        expect(daysBetweenISO('2026-08-20', '2026-08-17')).toBe(-3);
        expect(daysBetweenISO('2026-08-17', '2026-08-17')).toBe(0);
    });

    it('survives a DST boundary, where a day is not 24 hours', () => {
        // UK clocks go back on 25 Oct 2026 — a millisecond division across
        // this gives 7.04 days and floors to the wrong answer.
        expect(daysBetweenISO('2026-10-22', '2026-10-29')).toBe(7);
        expect(daysBetweenISO('2026-03-26', '2026-04-02')).toBe(7);
    });

    it('spans a year without drifting', () => {
        expect(daysBetweenISO('2026-01-01', '2027-01-01')).toBe(365);
    });
});

describe('toggleSpanDay', () => {
    it('extends the span to reach a day outside it', () => {
        expect(toggleSpanDay(2, 2, 0)).toEqual({ start: 0, end: 2 });
        expect(toggleSpanDay(2, 2, 4)).toEqual({ start: 2, end: 4 });
    });

    it('pulls an end of a multi-day span in by one', () => {
        expect(toggleSpanDay(1, 3, 1)).toEqual({ start: 2, end: 3 });
        expect(toggleSpanDay(1, 3, 3)).toEqual({ start: 1, end: 2 });
    });

    it('truncates at a day inside the span', () => {
        expect(toggleSpanDay(0, 4, 2)).toEqual({ start: 0, end: 2 });
    });

    it('refuses to leave a job on no day at all', () => {
        expect(toggleSpanDay(2, 2, 2)).toEqual({ start: 2, end: 2 });
    });

    it('always returns a span that is still contiguous and ordered', () => {
        for (let start = 0; start <= 6; start++) {
            for (let end = start; end <= 6; end++) {
                for (let day = 0; day <= 6; day++) {
                    const r = toggleSpanDay(start, end, day);
                    expect(r.end).toBeGreaterThanOrEqual(r.start);
                }
            }
        }
    });
});
