import { describe, it, expect } from 'vitest';
import { easterSunday, ukBankHolidays, bankHolidayMap, bankHolidayOn } from './holidays';

/**
 * Expected dates are the England & Wales list gov.uk publishes. If a year here
 * ever disagrees with gov.uk, the rules in holidays.ts are wrong — not this
 * file.
 */
const PUBLISHED: Record<number, Array<[string, string]>> = {
    2026: [
        ['2026-01-01', "New Year's Day"],
        ['2026-04-03', 'Good Friday'],
        ['2026-04-06', 'Easter Monday'],
        ['2026-05-04', 'Early May bank holiday'],
        ['2026-05-25', 'Spring bank holiday'],
        ['2026-08-31', 'Summer bank holiday'],
        ['2026-12-25', 'Christmas Day'],
        ['2026-12-28', 'Boxing Day'],
    ],
    2027: [
        ['2027-01-01', "New Year's Day"],
        ['2027-03-26', 'Good Friday'],
        ['2027-03-29', 'Easter Monday'],
        ['2027-05-03', 'Early May bank holiday'],
        ['2027-05-31', 'Spring bank holiday'],
        ['2027-08-30', 'Summer bank holiday'],
        ['2027-12-27', 'Christmas Day'],
        ['2027-12-28', 'Boxing Day'],
    ],
    2028: [
        ['2028-01-03', "New Year's Day"],
        ['2028-04-14', 'Good Friday'],
        ['2028-04-17', 'Easter Monday'],
        ['2028-05-01', 'Early May bank holiday'],
        ['2028-05-29', 'Spring bank holiday'],
        ['2028-08-28', 'Summer bank holiday'],
        ['2028-12-25', 'Christmas Day'],
        ['2028-12-26', 'Boxing Day'],
    ],
};

describe('easterSunday', () => {
    // Independently known dates — the two moving holidays hang off these.
    it.each([
        [2024, '2024-03-31'],
        [2025, '2025-04-20'],
        [2026, '2026-04-05'],
        [2027, '2027-03-28'],
        [2028, '2028-04-16'],
        [2030, '2030-04-21'],
    ])('Easter %i', (year, expected) => {
        expect(easterSunday(year)).toBe(expected);
    });
});

describe('ukBankHolidays', () => {
    for (const [year, expected] of Object.entries(PUBLISHED)) {
        it(`matches the published England & Wales list for ${year}`, () => {
            const got = ukBankHolidays(Number(year)).map((h) => [h.date, h.name]);
            expect(got).toEqual(expected);
        });
    }

    it('always returns eight, in date order', () => {
        for (let y = 2026; y <= 2035; y++) {
            const hs = ukBankHolidays(y);
            expect(hs).toHaveLength(8);
            const dates = hs.map((h) => h.date);
            expect([...dates].sort()).toEqual(dates);
        }
    });

    it('never lands a holiday on a weekend', () => {
        for (let y = 2026; y <= 2035; y++) {
            for (const h of ukBankHolidays(y)) {
                const [yy, mm, dd] = h.date.split('-').map(Number);
                const day = new Date(yy, mm - 1, dd).getDay();
                expect(day).not.toBe(0);
                expect(day).not.toBe(6);
            }
        }
    });

    it('never doubles two holidays onto one day', () => {
        for (let y = 2026; y <= 2035; y++) {
            const dates = ukBankHolidays(y).map((h) => h.date);
            expect(new Set(dates).size).toBe(dates.length);
        }
    });

    it('flags a moved day as a substitute, and a normal one as not', () => {
        // Boxing Day 2026 is a Saturday, so it moves to Monday 28th.
        const boxing2026 = ukBankHolidays(2026).find((h) => h.name === 'Boxing Day');
        expect(boxing2026).toMatchObject({ date: '2026-12-28', substitute: true });

        const xmas2026 = ukBankHolidays(2026).find((h) => h.name === 'Christmas Day');
        expect(xmas2026).toMatchObject({ date: '2026-12-25', substitute: false });
    });

    it('pushes Boxing Day past Christmas when both fall at a weekend', () => {
        // 25 Dec 2027 is a Saturday: Christmas takes Monday, Boxing Tuesday.
        const hs = ukBankHolidays(2027);
        expect(hs.find((h) => h.name === 'Christmas Day')?.date).toBe('2027-12-27');
        expect(hs.find((h) => h.name === 'Boxing Day')?.date).toBe('2027-12-28');
    });
});

describe('bankHolidayMap / bankHolidayOn', () => {
    it('spans years and labels substitutes', () => {
        const map = bankHolidayMap(2026, 2027);
        expect(map.get('2026-12-25')).toBe('Christmas Day');
        expect(map.get('2026-12-28')).toBe('Boxing Day (substitute day)');
        expect(map.get('2027-03-26')).toBe('Good Friday');
    });

    it('returns null for an ordinary working day', () => {
        expect(bankHolidayOn('2026-03-04')).toBeNull();
        expect(bankHolidayOn('2026-05-04')).toBe('Early May bank holiday');
    });

    it('does not throw on a malformed date', () => {
        expect(bankHolidayOn('not-a-date')).toBeNull();
    });
});
