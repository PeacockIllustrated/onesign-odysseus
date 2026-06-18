import { NextResponse } from 'next/server';
import { sendPushToAll } from '@/lib/push/send';

// web-push needs the Node runtime (not edge).
export const runtime = 'nodejs';

/**
 * Receives a Supabase Database Webhook on INSERT into public.notifications and
 * fans the row out as a Web Push to every subscribed device.
 *
 * Configure the webhook (Supabase dashboard → Database → Webhooks):
 *   - Table: public.notifications, Events: INSERT
 *   - URL: https://<your-app>/api/push/dispatch
 *   - HTTP header: Authorization: Bearer <PUSH_DISPATCH_SECRET>
 *
 * The shared secret (PUSH_DISPATCH_SECRET) must match the Vercel env var. The
 * webhook body is { type, table, record, old_record }; we read `record`.
 */
export async function POST(request: Request) {
    const secret = process.env.PUSH_DISPATCH_SECRET;
    if (!secret) {
        return NextResponse.json({ error: 'push dispatch not configured' }, { status: 503 });
    }

    const authHeader = request.headers.get('authorization') ?? '';
    const provided =
        request.headers.get('x-push-secret') ??
        (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '');

    if (provided !== secret) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    let payload: unknown;
    try {
        payload = await request.json();
    } catch {
        return NextResponse.json({ error: 'invalid json' }, { status: 400 });
    }

    // Support both the Supabase webhook envelope ({ record }) and a bare row.
    const record = (payload as { record?: Record<string, unknown> })?.record ?? (payload as Record<string, unknown>);
    if (!record || typeof record !== 'object') {
        return NextResponse.json({ ok: true, skipped: 'no record' });
    }

    const title = (record.title as string) || 'Onesign Odysseus';
    const detail = (record.detail as string) || undefined;
    const href = (record.href as string) || '/';
    const sourceTable = record.source_table as string | undefined;
    const sourceId = record.source_id as string | undefined;

    const result = await sendPushToAll({
        title,
        body: detail,
        url: href,
        tag: sourceTable && sourceId ? `${sourceTable}:${sourceId}` : undefined,
    });

    return NextResponse.json({ ok: true, ...result });
}
