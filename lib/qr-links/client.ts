import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

/**
 * Read-only client for the Onesign Lynx (onesign-qr) database.
 *
 * Lynx owns `qr_codes` / `qr_scan_events` / `organizations`. Odysseus reads
 * them for the QR Links overview and never writes — this page is a window,
 * not a second editor. Managing a link (destination, style, activation) stays
 * in Lynx, which is the app that prints and redirects them.
 *
 * Two deployment shapes are supported, because which one is live is an infra
 * decision rather than a code one:
 *
 *   1. Lynx on its OWN Supabase project — set `LYNX_SUPABASE_URL` +
 *      `LYNX_SUPABASE_SERVICE_ROLE_KEY` and we talk to it directly.
 *   2. Lynx sharing the Odysseus project — leave those unset and we fall back
 *      to the Odysseus service-role client, exactly as the Persimmon adapter
 *      does for `psp_orders` (lib/external-orders/adapters/persimmon.ts).
 *
 * Either way the service role is required, because Lynx's RLS scopes rows to
 * *its* org members and Onesign staff are not rows in that tenancy. Every
 * caller is gated on `requireSuperAdminOrError()` before it gets here — same
 * rule as `createAdminClient()` (CLAUDE.md conventions).
 *
 * Unconfigured is a clean no-op, not a crash: `null` comes back, the page
 * renders a "not connected" state, and the build still runs. Same
 * deferred-integration pattern as Higgsfield.
 */

export type LynxClient = SupabaseClient;

export interface LynxConnection {
    client: LynxClient;
    /** 'dedicated' = its own project; 'shared' = the Odysseus project. */
    mode: 'dedicated' | 'shared';
}

export function lynxConfigured(): boolean {
    const dedicated = Boolean(process.env.LYNX_SUPABASE_URL && process.env.LYNX_SUPABASE_SERVICE_ROLE_KEY);
    return dedicated || Boolean(env.SUPABASE_SERVICE_ROLE_KEY);
}

/** Returns null when neither a dedicated Lynx project nor a service role is configured. */
export function createLynxClient(): LynxConnection | null {
    const url = process.env.LYNX_SUPABASE_URL;
    const key = process.env.LYNX_SUPABASE_SERVICE_ROLE_KEY;

    if (url && key) {
        return {
            client: createClient(url, key, {
                auth: { autoRefreshToken: false, persistSession: false },
            }),
            mode: 'dedicated',
        };
    }

    if (!env.SUPABASE_SERVICE_ROLE_KEY) return null;

    return {
        client: createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false },
        }),
        mode: 'shared',
    };
}

/**
 * Base URL a managed link redirects through, so the list can show (and open)
 * the actual printed URL. Defaults to the live Lynx host.
 */
export function lynxRedirectBase(): string {
    return (process.env.LYNX_REDIRECT_BASE_URL || 'https://lynx.onesignanddigital.com').replace(/\/$/, '');
}

/** The printed URL for a link: managed codes redirect, direct codes encode the destination. */
export function printedUrl(mode: string, slug: string | null, destination: string): string {
    if (mode === 'managed' && slug) return `${lynxRedirectBase()}/r/${slug}`;
    return destination;
}
