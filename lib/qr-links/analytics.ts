/**
 * Pure scan-event aggregation, ported from Lynx's own analytics route
 * (`src/app/api/qr/[id]/analytics/route.ts` in onesign-qr).
 *
 * It is a deliberate port rather than a re-derivation: the whole point of this
 * page is that a number here matches the number the client sees in Lynx. If
 * Lynx changes how it counts, change it here too — the tests in
 * `analytics.test.ts` are the contract.
 *
 * DOM-free and dependency-free (same spirit as `lib/nesting` and
 * `lib/visualiser/returns`), so it is cheap to test and safe to run anywhere.
 */

import type {
    QrScanEventRow,
    QrAnalyticsSummary,
    QrPeriod,
} from './types';
import { PERIOD_DAYS } from './types';

const DAY_MS = 86_400_000;

/**
 * Count occurrences of a key across rows, descending. Null/empty keys are
 * skipped rather than bucketed as "unknown" — Lynx does the same, which is why
 * a breakdown can total less than `total_scans`.
 */
export function groupAndCount<T>(
    items: T[],
    keyFn: (item: T) => string | null | undefined
): Array<{ key: string; count: number }> {
    const map = new Map<string, number>();
    for (const item of items) {
        const k = keyFn(item);
        if (!k) continue;
        map.set(k, (map.get(k) ?? 0) + 1);
    }
    return Array.from(map.entries())
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count);
}

/**
 * Bucket timestamps into a dense day series ending today, so the chart draws a
 * flat line through quiet days instead of collapsing them. `now` is injectable
 * so tests don't depend on the wall clock.
 */
export function aggregateByDay(
    items: Array<{ ts: string }>,
    periodDays: number,
    now: number = Date.now()
): Array<{ date: string; count: number }> {
    const counts = new Map<string, number>();
    for (const item of items) {
        const day = item.ts.substring(0, 10);
        counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    const result: Array<{ date: string; count: number }> = [];
    for (let i = periodDays - 1; i >= 0; i--) {
        const key = new Date(now - i * DAY_MS).toISOString().substring(0, 10);
        result.push({ date: key, count: counts.get(key) ?? 0 });
    }
    return result;
}

/** The window boundaries Lynx uses. Today is midnight-local; the rest roll back N×24h. */
export function periodBounds(period: QrPeriod, now: number = Date.now()) {
    const d = new Date(now);
    return {
        periodDays: PERIOD_DAYS[period],
        periodStart: new Date(now - PERIOD_DAYS[period] * DAY_MS).toISOString(),
        todayStart: new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString(),
        weekStart: new Date(now - 7 * DAY_MS).toISOString(),
        monthStart: new Date(now - 30 * DAY_MS).toISOString(),
    };
}

/**
 * Build the full summary from raw scan rows already filtered to the period.
 *
 * `totalScans` comes in separately because Lynx reads it off the counter
 * column on `qr_codes` — it is lifetime, not windowed, and the stat card says
 * so. Everything else is derived from the rows in hand.
 */
export function summariseScans(
    rows: QrScanEventRow[],
    period: QrPeriod,
    totalScans: number,
    now: number = Date.now()
): QrAnalyticsSummary {
    const { periodDays, todayStart, weekStart, monthStart } = periodBounds(period, now);

    const ipSet = new Set<string>();
    for (const r of rows) if (r.ip_hash) ipSet.add(r.ip_hash);

    return {
        total_scans: totalScans,
        scans_today: rows.filter((r) => r.scanned_at >= todayStart).length,
        scans_this_week: rows.filter((r) => r.scanned_at >= weekStart).length,
        scans_this_month: rows.filter((r) => r.scanned_at >= monthStart).length,
        // Hashed IPs are Lynx's dedupe key, not an identity — this is a
        // best-effort distinct count, and it is null-safe when the deploy has
        // no IP_HASH_SALT set (then every row hashes to null and this reads 0).
        unique_visitors: ipSet.size,
        period,
        scans_by_day: aggregateByDay(rows.map((r) => ({ ts: r.scanned_at })), periodDays, now),
        top_countries: groupAndCount(rows, (r) => r.country_code)
            .slice(0, 10)
            .map((c) => ({ country: c.key, count: c.count })),
        top_devices: groupAndCount(rows, (r) => r.device_type).map((d) => ({
            device: d.key,
            count: d.count,
        })),
        top_os: groupAndCount(rows, (r) => r.os_family)
            .slice(0, 8)
            .map((o) => ({ os: o.key, count: o.count })),
        top_browsers: groupAndCount(rows, (r) => r.browser_family)
            .slice(0, 8)
            .map((b) => ({ browser: b.key, count: b.count })),
        top_referrers: groupAndCount(rows, (r) => r.referrer_domain)
            .slice(0, 10)
            .map((r) => ({ domain: r.key, count: r.count })),
        recent_scans: rows.slice(0, 20).map((r) => ({
            scanned_at: r.scanned_at,
            country_code: r.country_code,
            device_type: r.device_type ?? 'unknown',
            os_family: r.os_family,
            browser_family: r.browser_family,
            referrer_domain: r.referrer_domain,
        })),
    };
}

/** Rows must arrive newest-first for `recent_scans` to mean anything. */
export function sortNewestFirst<T extends { scanned_at: string }>(rows: T[]): T[] {
    return [...rows].sort((a, b) => (a.scanned_at < b.scanned_at ? 1 : -1));
}
