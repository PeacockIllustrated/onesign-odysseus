/**
 * Types for the QR Links overview — a read-only window onto Onesign Lynx's
 * managed QR codes and their scan analytics.
 *
 * These mirror the shapes Lynx owns (`qr_codes` / `qr_scan_events` and the
 * `AnalyticsSummary` its own dashboard renders). We do NOT own those tables:
 * Odysseus reads them and never writes. Keeping the shapes identical means the
 * numbers on this page and the numbers in Lynx are the same numbers, derived
 * the same way — see `lib/qr-links/analytics.ts` for the ported aggregation.
 */

import { z } from 'zod';

/** Lynx: 'managed' redirects via /r/<slug>; 'direct' encodes the URL itself. */
export type QrMode = 'managed' | 'direct';

/** Lynx: how the link is physically delivered. Only meaningful for managed. */
export type QrCarrier = 'qr' | 'nfc' | 'both';

export type QrDeviceType = 'mobile' | 'tablet' | 'desktop' | 'unknown';

/** Analytics windows Lynx offers. Kept identical so the two agree. */
export const QrPeriodEnum = z.enum(['7d', '30d', '90d']);
export type QrPeriod = z.infer<typeof QrPeriodEnum>;

export const PERIOD_DAYS: Record<QrPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };

/** A single Lynx QR code, flattened for the list. */
export interface QrLink {
    id: string;
    name: string;
    mode: QrMode;
    carrier: QrCarrier;
    /** Managed links only — the /r/<slug> path segment printed on the sign. */
    slug: string | null;
    destination_url: string;
    is_active: boolean;
    analytics_enabled: boolean;
    total_scans: number;
    last_scanned_at: string | null;
    created_at: string;
    /** Lynx org (its own tenancy), resolved to a display name where we can. */
    org_id: string | null;
    org_name: string | null;
}

/** One raw scan row, as Lynx records it. Privacy-first: no PII, hashed IP. */
export interface QrScanEventRow {
    scanned_at: string;
    country_code: string | null;
    device_type: QrDeviceType | null;
    os_family: string | null;
    browser_family: string | null;
    referrer_domain: string | null;
    ip_hash: string | null;
}

/**
 * The analytics payload — field-for-field the same contract Lynx's
 * `/api/qr/[id]/analytics` returns, so the panel can render the same visuals.
 */
export interface QrAnalyticsSummary {
    total_scans: number;
    scans_today: number;
    scans_this_week: number;
    scans_this_month: number;
    unique_visitors: number;
    period: QrPeriod;
    scans_by_day: Array<{ date: string; count: number }>;
    top_countries: Array<{ country: string; count: number }>;
    top_devices: Array<{ device: string; count: number }>;
    top_os: Array<{ os: string; count: number }>;
    top_browsers: Array<{ browser: string; count: number }>;
    top_referrers: Array<{ domain: string; count: number }>;
    recent_scans: Array<{
        scanned_at: string;
        country_code: string | null;
        device_type: string;
        os_family: string | null;
        browser_family: string | null;
        referrer_domain: string | null;
    }>;
}

/** Roll-up across every link, for the cards at the top of the page. */
export interface QrLinksOverview {
    total_links: number;
    active_links: number;
    managed_links: number;
    nfc_links: number;
    total_scans: number;
    scans_today: number;
    scans_this_week: number;
    scans_this_month: number;
    unique_visitors: number;
    /** Same 30-day series shape as a single link, summed across all of them. */
    scans_by_day: Array<{ date: string; count: number }>;
    top_devices: Array<{ device: string; count: number }>;
    top_countries: Array<{ country: string; count: number }>;
    /** Busiest links in the window — id/name/count, ready to render as bars. */
    top_links: Array<{ id: string; name: string; count: number }>;
}
