'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, okVoid, type Result } from '@/lib/result';
import {
    SubmitDesignRequestSchema,
    UpdateDesignRequestStatusSchema,
    type SubmitDesignRequestInput,
    type DesignRequestRow,
    type DesignRequestStatus,
} from './types';

const TABLE = 'design_requests';

// ---------------------------------------------------------------------------
// Spam guard — honeypot (in the schema) + a best-effort in-memory rate limit.
//
// The /design form is unauthenticated, so there's no session to throttle on.
// We keep a small sliding window per email plus a coarse global cap. This lives
// in module memory: it resets on a cold start and isn't shared across serverless
// instances, which is fine for a low-volume B2B enquiry form — it exists to blunt
// a script hammering one instance, not as a hard security boundary. (Stronger
// bot protection — Turnstile/hCaptcha — is a documented future toggle.)
// ---------------------------------------------------------------------------
const PER_EMAIL_MAX = 5; // per window
const PER_EMAIL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const GLOBAL_MAX = 60; // per window
const GLOBAL_WINDOW_MS = 60 * 1000; // 1 minute

const emailHits = new Map<string, number[]>();
let globalHits: number[] = [];

function withinWindow(times: number[], windowMs: number, now: number) {
    return times.filter((t) => now - t < windowMs);
}

/** Returns true if the caller is over a limit (should be rejected). */
function rateLimited(email: string): boolean {
    const now = Date.now();
    globalHits = withinWindow(globalHits, GLOBAL_WINDOW_MS, now);
    if (globalHits.length >= GLOBAL_MAX) return true;

    const key = email.toLowerCase();
    const prev = withinWindow(emailHits.get(key) ?? [], PER_EMAIL_WINDOW_MS, now);
    if (prev.length >= PER_EMAIL_MAX) return true;

    prev.push(now);
    emailHits.set(key, prev);
    globalHits.push(now);
    return false;
}

/**
 * Public, UNAUTHENTICATED submission from the /design studio. Writes through
 * the service-role admin client (bypasses RLS) — mirrors the tokenised
 * approval/delivery actions in CLAUDE.md §3. Do NOT add getUser()/requireAuth()
 * here: the whole point is that customers have no Supabase session.
 */
// Keep in sync with SubmitDesignRequestSchema's field maxes. An oversize
// OPTIONAL field (thumbnail / flattened svg) must never sink the whole lead —
// the design still lives in params_json.artworkLayers, and a request without a
// preview beats a customer staring at a failed send.
const THUMBNAIL_MAX = 4_000_000;
const SVG_SOURCE_MAX = 5_000_000;

export async function submitDesignRequest(
    input: SubmitDesignRequestInput,
): Promise<Result<{ reference: string }>> {
    const sanitised: SubmitDesignRequestInput = {
        ...input,
        thumbnail:
            typeof input?.thumbnail === 'string' &&
            input.thumbnail.length > THUMBNAIL_MAX
                ? null
                : input?.thumbnail,
        svgSource:
            typeof input?.svgSource === 'string' &&
            input.svgSource.length > SVG_SOURCE_MAX
                ? null
                : input?.svgSource,
    };
    const parsed = SubmitDesignRequestSchema.safeParse(sanitised);
    if (!parsed.success) {
        return err(
            'We could not read part of your design. Please try sending again — or email hello@onesignanddigital.com and we will take it from there.',
        );
    }
    const d = parsed.data;

    // Honeypot: the hidden field should stay empty. Browser autofill can fill
    // it on a real customer's machine, so a hit is a FLAG, not a drop — the
    // lead is still recorded and staff triage it. (Silent discard here cost
    // real enquiries; volume is bounded by the rate limit below.)
    const honeypotHit = !!(d.companyWebsite && d.companyWebsite.length > 0);

    if (rateLimited(d.customerEmail)) {
        return err(
            'Too many submissions just now — please try again in a few minutes.',
        );
    }

    const notes = d.projectNotes || '';
    const flaggedNotes = honeypotHit
        ? `${notes}${notes ? '\n\n' : ''}[Automated check: hidden form field was filled — possible bot, please verify before quoting]`
        : notes;

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .insert({
            customer_name: d.customerName,
            customer_email: d.customerEmail,
            customer_phone: d.customerPhone || null,
            company: d.company || null,
            postcode: d.postcode || null,
            project_notes: flaggedNotes || null,
            sign_type: d.signType || null,
            params_json: d.params,
            svg_source: d.svgSource ?? null,
            thumbnail: d.thumbnail ?? null,
        })
        .select('reference')
        .single();

    if (error) {
        return err(
            'Something went wrong saving your design — please try again, or email hello@onesignanddigital.com.',
        );
    }
    revalidatePath('/admin/design-requests');
    return ok({ reference: data.reference as string });
}

/** List design requests, newest first. Super-admin only. */
export async function listDesignRequests(): Promise<
    Result<DesignRequestRow[]>
> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .order('created_at', { ascending: false })
        .limit(500);

    if (error) return err(error.message);
    return ok((data ?? []) as DesignRequestRow[]);
}

/** Load a single request by id. Super-admin only. */
export async function getDesignRequest(
    id: string,
): Promise<Result<DesignRequestRow>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data, error } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();

    if (error) return err(error.message);
    if (!data) return err('Request not found');
    return ok(data as DesignRequestRow);
}

/** Move a request through triage. Super-admin only. */
export async function updateDesignRequestStatus(
    id: string,
    status: DesignRequestStatus,
): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = UpdateDesignRequestStatusSchema.safeParse({ id, status });
    if (!parsed.success) {
        return err(parsed.error.issues[0]?.message ?? 'Invalid status');
    }

    const supabase = createAdminClient();
    const { error } = await supabase
        .from(TABLE)
        .update({ status: parsed.data.status })
        .eq('id', parsed.data.id);

    if (error) return err(error.message);
    revalidatePath('/admin/design-requests');
    revalidatePath(`/admin/design-requests/${id}`);
    return okVoid();
}

/**
 * Promote a customer request into the internal visualiser: create a real
 * visualiser_designs row from its params + SVG and soft-link it back. Returns
 * the new design id so the caller can deep-link to /admin/visualiser?id=...
 * (idempotent — if already promoted, returns the existing design id).
 * Super-admin only.
 */
export async function promoteDesignRequest(
    id: string,
): Promise<Result<{ designId: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data: req, error: findErr } = await supabase
        .from(TABLE)
        .select('*')
        .eq('id', id)
        .maybeSingle();
    if (findErr) return err(findErr.message);
    if (!req) return err('Request not found');

    const request = req as DesignRequestRow;
    if (request.design_id) return ok({ designId: request.design_id });

    const user = await getUser();
    const name =
        `${request.params_json?.name ?? 'Customer design'} · ${request.reference}`.slice(
            0,
            120,
        );

    const { data: design, error: insErr } = await supabase
        .from('visualiser_designs')
        .insert({
            name,
            params_json: request.params_json,
            svg_source: request.svg_source ?? null,
            created_by: user?.id ?? null,
        })
        .select('id')
        .single();
    if (insErr) return err(insErr.message);

    const designId = design.id as string;
    const { error: linkErr } = await supabase
        .from(TABLE)
        .update({ design_id: designId })
        .eq('id', id);
    if (linkErr) return err(linkErr.message);

    revalidatePath('/admin/design-requests');
    revalidatePath(`/admin/design-requests/${id}`);
    return ok({ designId });
}
