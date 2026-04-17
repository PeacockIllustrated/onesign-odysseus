import { describe, it, expect } from 'vitest';
import { groupDeliveriesByDriverAndDay, getWeekDates } from './utils';

describe('getWeekDates', () => {
    it('returns 5 dates for Mon-Fri starting from the given Monday', () => {
        const dates = getWeekDates('2026-04-20', false);
        expect(dates).toEqual(['2026-04-20', '2026-04-21', '2026-04-22', '2026-04-23', '2026-04-24']);
    });
    it('returns 7 dates when weekends included', () => {
        const dates = getWeekDates('2026-04-20', true);
        expect(dates).toHaveLength(7);
        expect(dates[6]).toBe('2026-04-26');
    });
});

describe('groupDeliveriesByDriverAndDay', () => {
    const deliveries = [
        { id: '1', scheduled_date: '2026-04-20', driver_id: 'dave', driver_name: 'Dave', site_name: 'Site A' },
        { id: '2', scheduled_date: '2026-04-20', driver_id: 'dave', driver_name: 'Dave', site_name: 'Site B' },
        { id: '3', scheduled_date: '2026-04-20', driver_id: null, driver_name: null, site_name: 'Site C' },
        { id: '4', scheduled_date: '2026-04-21', driver_id: 'keith', driver_name: 'Keith', site_name: 'Site D' },
    ];

    it('groups by date and driver', () => {
        const result = groupDeliveriesByDriverAndDay(deliveries as any);
        const mon = result['2026-04-20'];
        expect(mon).toBeDefined();
        expect(mon.drivers['dave']).toHaveLength(2);
        expect(mon.unassigned).toHaveLength(1);
    });

    it('puts unassigned deliveries in the unassigned bucket', () => {
        const result = groupDeliveriesByDriverAndDay(deliveries as any);
        expect(result['2026-04-20'].unassigned[0].id).toBe('3');
    });

    it('creates entries for days with deliveries', () => {
        const result = groupDeliveriesByDriverAndDay(deliveries as any);
        expect(Object.keys(result)).toContain('2026-04-21');
        expect(result['2026-04-21'].drivers['keith']).toHaveLength(1);
    });
});
