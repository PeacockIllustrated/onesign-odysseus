import { describe, it, expect } from 'vitest';
import {
    groupAndCount,
    aggregateByDay,
    periodBounds,
    summariseScans,
    sortNewestFirst,
} from './analytics';
import type { QrScanEventRow } from './types';

// Fixed clock so the dense day series is deterministic.
const NOW = Date.parse('2026-06-15T12:00:00.000Z');
const DAY = 86_400_000;

function scan(partial: Partial<QrScanEventRow> & { scanned_at: string }): QrScanEventRow {
    return {
        country_code: null,
        device_type: null,
        os_family: null,
        browser_family: null,
        referrer_domain: null,
        ip_hash: null,
        ...partial,
    };
}

describe('groupAndCount', () => {
    it('counts descending and skips null keys', () => {
        const rows = [{ k: 'a' }, { k: 'b' }, { k: 'a' }, { k: null }, { k: '' }];
        expect(groupAndCount(rows, (r) => r.k)).toEqual([
            { key: 'a', count: 2 },
            { key: 'b', count: 1 },
        ]);
    });

    it('returns an empty list for no input', () => {
        expect(groupAndCount([], () => 'x')).toEqual([]);
    });
});

describe('aggregateByDay', () => {
    it('produces a dense series ending today, zero-filling quiet days', () => {
        const series = aggregateByDay(
            [
                { ts: new Date(NOW).toISOString() },
                { ts: new Date(NOW).toISOString() },
                { ts: new Date(NOW - 2 * DAY).toISOString() },
            ],
            4,
            NOW
        );
        expect(series).toHaveLength(4);
        expect(series.map((d) => d.count)).toEqual([0, 1, 0, 2]);
        expect(series[3].date).toBe('2026-06-15');
    });

    it('ignores scans older than the window', () => {
        const series = aggregateByDay([{ ts: new Date(NOW - 90 * DAY).toISOString() }], 7, NOW);
        expect(series.reduce((n, d) => n + d.count, 0)).toBe(0);
    });
});

describe('periodBounds', () => {
    it('maps each period to its day count', () => {
        expect(periodBounds('7d', NOW).periodDays).toBe(7);
        expect(periodBounds('30d', NOW).periodDays).toBe(30);
        expect(periodBounds('90d', NOW).periodDays).toBe(90);
    });

    it('anchors today to local midnight, not 24h ago', () => {
        const { todayStart } = periodBounds('30d', NOW);
        expect(new Date(todayStart).getHours()).toBe(0);
        expect(Date.parse(todayStart)).toBeLessThan(NOW);
    });
});

describe('summariseScans', () => {
    const rows = sortNewestFirst([
        scan({ scanned_at: new Date(NOW - 1000).toISOString(), country_code: 'GB', device_type: 'mobile', os_family: 'iOS', browser_family: 'Safari', ip_hash: 'aaa' }),
        scan({ scanned_at: new Date(NOW - 2 * DAY).toISOString(), country_code: 'GB', device_type: 'mobile', os_family: 'Android', browser_family: 'Chrome', ip_hash: 'aaa' }),
        scan({ scanned_at: new Date(NOW - 10 * DAY).toISOString(), country_code: 'IE', device_type: 'desktop', referrer_domain: 'google.com', ip_hash: 'bbb' }),
    ]);

    it('windows today / week / month independently', () => {
        const s = summariseScans(rows, '30d', 999, NOW);
        expect(s.scans_today).toBe(1);
        expect(s.scans_this_week).toBe(2);
        expect(s.scans_this_month).toBe(3);
    });

    it('reports total_scans as the lifetime counter, not the window', () => {
        expect(summariseScans(rows, '30d', 999, NOW).total_scans).toBe(999);
    });

    it('counts unique visitors by hashed IP', () => {
        expect(summariseScans(rows, '30d', 0, NOW).unique_visitors).toBe(2);
    });

    it('reads 0 unique visitors when no IP salt was configured upstream', () => {
        const unhashed = [scan({ scanned_at: new Date(NOW).toISOString() })];
        expect(summariseScans(unhashed, '30d', 1, NOW).unique_visitors).toBe(0);
    });

    it('breaks down countries, devices, os, browsers and referrers', () => {
        const s = summariseScans(rows, '30d', 3, NOW);
        expect(s.top_countries).toEqual([
            { country: 'GB', count: 2 },
            { country: 'IE', count: 1 },
        ]);
        expect(s.top_devices).toEqual([
            { device: 'mobile', count: 2 },
            { device: 'desktop', count: 1 },
        ]);
        expect(s.top_os.map((o) => o.os).sort()).toEqual(['Android', 'iOS']);
        expect(s.top_browsers).toHaveLength(2);
        expect(s.top_referrers).toEqual([{ domain: 'google.com', count: 1 }]);
    });

    it('defaults a missing device_type to unknown in recent scans', () => {
        const s = summariseScans([scan({ scanned_at: new Date(NOW).toISOString() })], '7d', 1, NOW);
        expect(s.recent_scans[0].device_type).toBe('unknown');
    });

    it('caps recent scans at 20 and keeps them newest-first', () => {
        const many = sortNewestFirst(
            Array.from({ length: 30 }, (_, i) =>
                scan({ scanned_at: new Date(NOW - i * 60_000).toISOString() })
            )
        );
        const s = summariseScans(many, '7d', 30, NOW);
        expect(s.recent_scans).toHaveLength(20);
        expect(s.recent_scans[0].scanned_at > s.recent_scans[1].scanned_at).toBe(true);
    });

    it('handles a link with no scans at all', () => {
        const s = summariseScans([], '7d', 0, NOW);
        expect(s.scans_by_day).toHaveLength(7);
        expect(s.scans_by_day.every((d) => d.count === 0)).toBe(true);
        expect(s.top_countries).toEqual([]);
        expect(s.recent_scans).toEqual([]);
    });
});
