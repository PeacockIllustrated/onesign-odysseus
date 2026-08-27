'use server';

import { z } from 'zod';
import { requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import { createLynxClient, lynxConfigured } from './client';
import {
    QrPeriodEnum,
    PERIOD_DAYS,
    type QrLink,
    type QrLinksOverview,
    type QrAnalyticsSummary,
    type QrScanEventRow,
} from './types';
import { summariseScans, sortNewestFirst, groupAndCount, aggregateByDay, periodBounds } from './analytics';

/**
 * Server actions for the QR Links overview.
 *
 * Read-only against Lynx (see `client.ts` for why, and for the two deployment
 * shapes). Every action is super-admin gated before the service-role client is
 * built, per the CLAUDE.md rule on `lib/supabase-admin.ts`.
 *
 * A missing table is not an error worth exploding over — Lynx may not be wired
 * to this deploy yet — so reads degrade to an empty result with a message the
 * page can render calmly.
 */

const DAY_MS = 86_400_000;

/** Cap on scan rows pulled per query. Matches Lynx's own limit. */
const SCAN_ROW_LIMIT = 10_000;

const UuidSchema = z.string().uuid('Invalid QR link id');

const AnalyticsInputSchema = z.object({
    qrId: UuidSchema,
    period: QrPeriodEnum.default('30d'),
});

/** Shared "Lynx isn't reachable" message, so every surface says the same thing. */
const NOT_CONNECTED =
    'Lynx is not connected to this deployment. Set LYNX_SUPABASE_URL and LYNX_SUPABASE_SERVICE_ROLE_KEY (or share the Odysseus service role) to pull QR links.';

export async function isLynxConnected(): Promise<boolean> {
    return lynxConfigured();
}

/**
 * Every QR link Lynx holds, newest-scanned first, with its owning Lynx org
 * resolved to a name where one exists.
 */
export async function listQrLinks(): Promise<Result<QrLink[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const conn = createLynxClient();
    if (!conn) return err(NOT_CONNECTED);

    const { data, error } = await conn.client
        .from('qr_codes')
        .select(
            'id, name, mode, carrier, slug, destination_url, is_active, analytics_enabled, total_scans, last_scanned_at, created_at, org_id'
        )
        .is('deleted_at', null)
        .order('total_scans', { ascending: false })
        .limit(1000);

    if (error) {
        console.error('[qr-links] qr_codes read failed:', error.message);
        return err('Could not read QR links from Lynx.');
    }

    const rows = (data ?? []) as Array<Omit<QrLink, 'org_name'>>;

    // Resolve org names in one round trip. Lynx's `organizations` table is its
    // own tenancy, unrelated to the Odysseus `orgs` table — do not try to join
    // the two here; a link's client is whoever holds it in Lynx.
    const orgIds = Array.from(new Set(rows.map((r) => r.org_id).filter(Boolean))) as string[];
    const orgNames = new Map<string, string>();
    if (orgIds.length > 0) {
        const { data: orgs } = await conn.client
            .from('organizations')
            .select('id, name')
            .in('id', orgIds);
        for (const o of orgs ?? []) orgNames.set(o.id as string, o.name as string);
    }

    return ok(rows.map((r) => ({ ...r, org_name: r.org_id ? orgNames.get(r.org_id) ?? null : null })));
}

/**
 * Full analytics for one link, in the same shape (and by the same maths) as
 * Lynx's own `/api/qr/[id]/analytics`.
 *
 * Unlike Lynx we do NOT refuse when `analytics_enabled` is false — staff should
 * still see the lifetime counter and whatever history exists. The UI flags the
 * link as "analytics off in Lynx" so nobody reads a flat line as zero traffic.
 */
export async function getQrLinkAnalytics(
    input: { qrId: string; period?: string }
): Promise<Result<QrAnalyticsSummary>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = AnalyticsInputSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const { qrId, period } = parsed.data;

    const conn = createLynxClient();
    if (!conn) return err(NOT_CONNECTED);

    const { data: qr, error: qrError } = await conn.client
        .from('qr_codes')
        .select('id, total_scans')
        .eq('id', qrId)
        .is('deleted_at', null)
        .maybeSingle();

    if (qrError) {
        console.error('[qr-links] qr_codes lookup failed:', qrError.message);
        return err('Could not read that QR link from Lynx.');
    }
    if (!qr) return err('QR link not found in Lynx.');

    const now = Date.now();
    const { periodStart } = periodBounds(period, now);

    const { data: events, error: eventsError } = await conn.client
        .from('qr_scan_events')
        .select('scanned_at, country_code, device_type, os_family, browser_family, referrer_domain, ip_hash')
        .eq('qr_id', qrId)
        .gte('scanned_at', periodStart)
        .order('scanned_at', { ascending: false })
        .limit(SCAN_ROW_LIMIT);

    if (eventsError) {
        console.error('[qr-links] qr_scan_events read failed:', eventsError.message);
        return err('Could not read scan events from Lynx.');
    }

    const rows = sortNewestFirst((events ?? []) as QrScanEventRow[]);
    return ok(summariseScans(rows, period, (qr.total_scans as number) ?? 0, now));
}

/**
 * Platform-wide roll-up for the cards and the headline chart: 30 days of scans
 * across every link, plus the busiest links in that window.
 *
 * One query over the period rather than one per link — the join back to names
 * happens in memory, which is cheap next to a per-link round trip.
 */
export async function getQrLinksOverview(): Promise<Result<QrLinksOverview>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const conn = createLynxClient();
    if (!conn) return err(NOT_CONNECTED);

    const now = Date.now();
    const periodDays = PERIOD_DAYS['30d'];
    const periodStart = new Date(now - periodDays * DAY_MS).toISOString();
    const { todayStart, weekStart } = periodBounds('30d', now);

    const [linksResult, eventsResult] = await Promise.all([
        conn.client
            .from('qr_codes')
            .select('id, name, mode, carrier, is_active, total_scans')
            .is('deleted_at', null)
            .limit(1000),
        conn.client
            .from('qr_scan_events')
            .select('qr_id, scanned_at, country_code, device_type, ip_hash')
            .gte('scanned_at', periodStart)
            .order('scanned_at', { ascending: false })
            .limit(SCAN_ROW_LIMIT),
    ]);

    if (linksResult.error) {
        console.error('[qr-links] overview links read failed:', linksResult.error.message);
        return err('Could not read QR links from Lynx.');
    }

    const links = (linksResult.data ?? []) as Array<{
        id: string;
        name: string;
        mode: string;
        carrier: string;
        is_active: boolean;
        total_scans: number;
    }>;

    // A scan-events failure is survivable: the counters on qr_codes still give
    // a true lifetime picture, so show that rather than nothing.
    const events = (eventsResult.error ? [] : eventsResult.data ?? []) as Array<{
        qr_id: string;
        scanned_at: string;
        country_code: string | null;
        device_type: string | null;
        ip_hash: string | null;
    }>;
    if (eventsResult.error) {
        console.error('[qr-links] overview events read failed:', eventsResult.error.message);
    }

    const nameById = new Map(links.map((l) => [l.id, l.name]));
    const ipSet = new Set<string>();
    for (const e of events) if (e.ip_hash) ipSet.add(e.ip_hash);

    return ok({
        total_links: links.length,
        active_links: links.filter((l) => l.is_active).length,
        managed_links: links.filter((l) => l.mode === 'managed').length,
        nfc_links: links.filter((l) => l.carrier === 'nfc' || l.carrier === 'both').length,
        total_scans: links.reduce((n, l) => n + (l.total_scans ?? 0), 0),
        scans_today: events.filter((e) => e.scanned_at >= todayStart).length,
        scans_this_week: events.filter((e) => e.scanned_at >= weekStart).length,
        scans_this_month: events.length,
        unique_visitors: ipSet.size,
        scans_by_day: aggregateByDay(events.map((e) => ({ ts: e.scanned_at })), periodDays, now),
        top_devices: groupAndCount(events, (e) => e.device_type).map((d) => ({
            device: d.key,
            count: d.count,
        })),
        top_countries: groupAndCount(events, (e) => e.country_code)
            .slice(0, 8)
            .map((c) => ({ country: c.key, count: c.count })),
        top_links: groupAndCount(events, (e) => e.qr_id)
            .slice(0, 8)
            .map((l) => ({ id: l.key, name: nameById.get(l.key) ?? 'Unknown link', count: l.count })),
    });
}
