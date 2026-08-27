'use server';

import { revalidatePath } from 'next/cache';
import { createAdminClient } from '@/lib/supabase-admin';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, okVoid, err, type Result } from '@/lib/result';
import { getSchedulableQuotes } from './queries';
import { diffFromDefault, expandHolidayRange } from './utils';
import {
    HolidayRangeSchema,
    MoveFittingJobSchema,
    SaveDayCrewSchema,
    SaveFitterSchema,
    SaveFittingJobSchema,
    SaveProjectManagerSchema,
    SaveVanSchema,
    type DayAssignment,
    type DefaultCrewRow,
    type Fitter,
    type HolidayRangeInput,
    type MoveFittingJobInput,
    type Placement,
    type SaveDayCrewInput,
    type SaveFitterInput,
    type SaveFittingJobInput,
    type SaveProjectManagerInput,
    type SaveVanInput,
} from './types';

const BOARD_PATHS = ['/admin/schedule', '/fitting-board'];

function revalidateBoard() {
    for (const p of BOARD_PATHS) revalidatePath(p);
}

/**
 * Geocode a job's postcode so the day map can plot it. postcodes.io is free
 * for UK postcodes and needs no key. Fire-and-forget: a job with an unusable
 * postcode simply doesn't get a pin, and never blocks the save.
 */
async function geocodeJob(jobId: string, postcode: string | null | undefined) {
    if (!postcode?.trim()) return;
    try {
        const res = await fetch(
            `https://api.postcodes.io/postcodes/${encodeURIComponent(postcode.trim())}`,
            { cache: 'no-store' }
        );
        if (!res.ok) return;
        const body = (await res.json()) as {
            result?: { latitude: number; longitude: number };
        };
        if (body.result == null) return;
        await createAdminClient()
            .from('fitting_jobs')
            .update({
                latitude: body.result.latitude,
                longitude: body.result.longitude,
            })
            .eq('id', jobId);
    } catch {
        // Never surfaced — the pin is a nicety, the card is the record.
    }
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function saveFittingJob(
    input: SaveFittingJobInput
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveFittingJobSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const v = parsed.data;

    const user = await getUser();
    const supabase = createAdminClient();

    // An unscheduled job has no van and no date; a scheduled one keeps the
    // lane it came from so unscheduling puts it back in the right panel.
    const payload = {
        org_id: v.org_id ?? null,
        contact_id: v.contact_id ?? null,
        site_id: v.site_id ?? null,
        quote_id: v.quote_id ?? null,
        production_job_id: v.production_job_id ?? null,
        customer_fallback: v.customer_fallback?.trim() || null,
        quote_ref: v.quote_ref?.trim() || null,
        location: v.location?.trim() || null,
        postcode: v.postcode?.trim().toUpperCase() || null,
        pm_id: v.pm_id ?? null,
        van_id: v.scheduled_date == null ? null : (v.van_id ?? null),
        scheduled_date: v.scheduled_date ?? null,
        lane: v.lane ?? 'scheduled',
        slot: v.slot ?? 'AM',
        done: v.done ?? false,
        delivery_required: v.delivery_required ?? false,
        crew_override: v.crew_override?.trim() || null,
        access_equipment: v.access_equipment?.trim() || null,
        summary: v.summary?.trim() || null,
        notes: v.notes?.trim() || null,
        updated_by: user?.id ?? null,
    };

    if (v.id) {
        const { error } = await supabase
            .from('fitting_jobs')
            .update(payload)
            .eq('id', v.id);
        if (error) return err(error.message);
        void geocodeJob(v.id, payload.postcode);
        revalidateBoard();
        return ok({ id: v.id });
    }

    const { data, error } = await supabase
        .from('fitting_jobs')
        .insert({ ...payload, created_by: user?.id ?? null })
        .select('id')
        .single();
    if (error) return err(error.message);
    void geocodeJob(data.id, payload.postcode);
    revalidateBoard();
    return ok({ id: data.id as string });
}

/**
 * Drag & drop. Kept separate from the full save so a move is a single narrow
 * update — the board applies it optimistically and rolls back on failure.
 */
export async function moveFittingJob(
    input: MoveFittingJobInput
): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = MoveFittingJobSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const v = parsed.data;

    const user = await getUser();
    const patch: Record<string, unknown> = {
        van_id: v.scheduled_date == null ? null : v.van_id,
        scheduled_date: v.scheduled_date,
        updated_by: user?.id ?? null,
    };
    if (v.slot) patch.slot = v.slot;
    // Dropping into a holding panel sets its lane; dropping onto the board
    // leaves the lane alone so it returns to the same panel next time.
    if (v.lane) patch.lane = v.lane;

    const { error } = await createAdminClient()
        .from('fitting_jobs')
        .update(patch)
        .eq('id', v.id);
    if (error) return err(error.message);

    revalidateBoard();
    return okVoid();
}

/** Tick a job as fitted. Completed work stays on the board as a record. */
export async function setFittingJobDone(
    id: string,
    done: boolean
): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const user = await getUser();
    const { error } = await createAdminClient()
        .from('fitting_jobs')
        .update({ done, updated_by: user?.id ?? null })
        .eq('id', id);
    if (error) return err(error.message);

    revalidateBoard();
    return okVoid();
}

/**
 * Soft-delete. Jobs are a permanent record, so even an explicit delete
 * archives rather than removing — the business can always see who fitted what.
 */
export async function archiveFittingJob(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const user = await getUser();
    const { error } = await createAdminClient()
        .from('fitting_jobs')
        .update({ archived_at: new Date().toISOString(), updated_by: user?.id ?? null })
        .eq('id', id);
    if (error) return err(error.message);

    revalidateBoard();
    return okVoid();
}

/**
 * Pull an accepted quote onto the board as a card in "to be scheduled".
 *
 * This is the whole of what the standalone spec called the ClarityGo
 * integration: Odysseus replaces ClarityGo, so the quote is already here and
 * the join is a foreign key rather than a CSV column matched on text.
 */
export async function createFittingJobFromQuote(
    quoteId: string,
    lane: 'scheduled' | 'delivery' = 'scheduled'
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const supabase = createAdminClient();
    const { data: quote, error: quoteErr } = await supabase
        .from('quotes')
        .select('id, quote_number, customer_name, project_name, org_id, contact_id, site_id')
        .eq('id', quoteId)
        .maybeSingle();
    if (quoteErr) return err(quoteErr.message);
    if (!quote) return err('quote not found');

    // One card per quote: a repeat click must not duplicate the job, the same
    // guarantee the spec wanted from de-duplicating a CSV on quote ref.
    const { data: existing } = await supabase
        .from('fitting_jobs')
        .select('id')
        .eq('quote_id', quoteId)
        .is('archived_at', null)
        .maybeSingle();
    if (existing) return ok({ id: existing.id as string });

    // Inherit the address from the quote's site where there is one.
    let location: string | null = null;
    let postcode: string | null = null;
    if (quote.site_id) {
        const { data: site } = await supabase
            .from('org_sites')
            .select('city, postcode')
            .eq('id', quote.site_id)
            .maybeSingle();
        location = site?.city ?? null;
        postcode = site?.postcode ?? null;
    }

    const user = await getUser();
    const { data, error } = await supabase
        .from('fitting_jobs')
        .insert({
            org_id: quote.org_id ?? null,
            contact_id: quote.contact_id ?? null,
            site_id: quote.site_id ?? null,
            quote_id: quote.id,
            quote_ref: quote.quote_number,
            customer_fallback: quote.org_id ? null : (quote.customer_name ?? null),
            location,
            postcode,
            notes: quote.project_name ?? null,
            lane,
            scheduled_date: null,
            van_id: null,
            created_by: user?.id ?? null,
            updated_by: user?.id ?? null,
        })
        .select('id')
        .single();
    if (error) return err(error.message);

    void geocodeJob(data.id, postcode);
    revalidateBoard();
    return ok({ id: data.id as string });
}

/** Accepted quotes with no fitting card yet, for the "from a quote" picker. */
export async function getSchedulableQuotesAction(): Promise<
    Array<{
        id: string;
        quote_number: string;
        customer_name: string | null;
        project_name: string | null;
    }>
> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return [];
    return getSchedulableQuotes();
}

// ---------------------------------------------------------------------------
// Day crews
// ---------------------------------------------------------------------------

/**
 * Save one day's crews. Only rows that differ from the standing pairing are
 * stored, so a day edited back to normal loses its "crew change" tag instead
 * of carrying a no-op override forever.
 */
export async function saveDayCrew(
    input: SaveDayCrewInput
): Promise<Result<{ overrides: number }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveDayCrewSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const { date, assignments } = parsed.data;

    const supabase = createAdminClient();
    const [fittersRes, defaultCrewRes] = await Promise.all([
        supabase.from('fitters').select('*').eq('is_active', true),
        supabase.from('default_crew').select('*'),
    ]);
    const fitters = (fittersRes.data ?? []) as Fitter[];
    const defaultCrew = (defaultCrewRes.data ?? []) as DefaultCrewRow[];

    const assignment: DayAssignment = {};
    for (const a of assignments) {
        assignment[a.fitter_id] =
            a.assignment === 'van' && a.van_id
                ? { kind: 'van', vanId: a.van_id }
                : ({ kind: a.assignment === 'van' ? 'off' : a.assignment } as Placement);
    }

    const diff = diffFromDefault(assignment, fitters, defaultCrew);
    const user = await getUser();

    // Replace the day wholesale: delete then insert what differs.
    const { error: delErr } = await supabase
        .from('day_crew_overrides')
        .delete()
        .eq('date', date);
    if (delErr) return err(delErr.message);

    if (diff.length > 0) {
        const rows = diff.map((d) => ({
            date,
            fitter_id: d.fitter_id,
            assignment: d.assignment.kind === 'van' ? 'van' : d.assignment.kind,
            van_id: d.assignment.kind === 'van' ? d.assignment.vanId : null,
            created_by: user?.id ?? null,
        }));
        const { error } = await supabase.from('day_crew_overrides').insert(rows);
        if (error) return err(error.message);
    }

    revalidateBoard();
    return ok({ overrides: diff.length });
}

/** Drop a day's overrides so it falls back to the standing pairings. */
export async function resetDayCrew(date: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const { error } = await createAdminClient()
        .from('day_crew_overrides')
        .delete()
        .eq('date', date);
    if (error) return err(error.message);

    revalidateBoard();
    return okVoid();
}

/**
 * Book a fitter off across a date range in one go. Entering a fortnight a day
 * at a time is exactly the admin the physical board forced, so the range is
 * expanded here rather than left to the office.
 */
export async function bookHolidayRange(
    input: HolidayRangeInput
): Promise<Result<{ days: number }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = HolidayRangeSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const { fitter_id, from, to, include_weekends } = parsed.data;

    const days = expandHolidayRange(from, to, include_weekends ?? false);
    if (days.length === 0) return err('that range contains no working days');

    const user = await getUser();
    const rows = days.map((date) => ({
        date,
        fitter_id,
        assignment: 'holiday' as const,
        van_id: null,
        created_by: user?.id ?? null,
    }));

    // One override per fitter per day, so a re-booked range overwrites rather
    // than colliding on the unique index.
    const { error } = await createAdminClient()
        .from('day_crew_overrides')
        .upsert(rows, { onConflict: 'date,fitter_id' });
    if (error) return err(error.message);

    revalidateBoard();
    return ok({ days: days.length });
}

// ---------------------------------------------------------------------------
// Roster admin
// ---------------------------------------------------------------------------

export async function saveVan(input: SaveVanInput): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveVanSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const v = parsed.data;

    const supabase = createAdminClient();
    const payload = {
        name: v.name.trim(),
        sort_order: v.sort_order ?? 0,
        is_active: v.is_active ?? true,
        updated_at: new Date().toISOString(),
    };

    if (v.id) {
        const { error } = await supabase.from('vans').update(payload).eq('id', v.id);
        if (error) return err(error.message);
        revalidateBoard();
        return ok({ id: v.id });
    }

    const { data, error } = await supabase
        .from('vans')
        .insert(payload)
        .select('id')
        .single();
    if (error) return err(error.message);
    revalidateBoard();
    return ok({ id: data.id as string });
}

export async function saveFitter(
    input: SaveFitterInput
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveFitterSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const v = parsed.data;

    const supabase = createAdminClient();
    const payload = {
        name: v.name.trim(),
        roster_group: v.roster_group ?? 'crew',
        sort_order: v.sort_order ?? 0,
        is_active: v.is_active ?? true,
        updated_at: new Date().toISOString(),
    };

    let fitterId = v.id;
    if (fitterId) {
        const { error } = await supabase.from('fitters').update(payload).eq('id', fitterId);
        if (error) return err(error.message);
    } else {
        const { data, error } = await supabase
            .from('fitters')
            .insert(payload)
            .select('id')
            .single();
        if (error) return err(error.message);
        fitterId = data.id as string;
    }

    // A fitter has one standing van, so setting the pairing replaces it.
    if (v.default_van_id !== undefined) {
        const { error: delErr } = await supabase
            .from('default_crew')
            .delete()
            .eq('fitter_id', fitterId);
        if (delErr) return err(delErr.message);
        if (v.default_van_id) {
            const { error } = await supabase
                .from('default_crew')
                .insert({ van_id: v.default_van_id, fitter_id: fitterId });
            if (error) return err(error.message);
        }
    }

    revalidateBoard();
    return ok({ id: fitterId });
}

export async function saveProjectManager(
    input: SaveProjectManagerInput
): Promise<Result<{ id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = SaveProjectManagerSchema.safeParse(input);
    if (!parsed.success) return err(parsed.error.issues[0].message);
    const v = parsed.data;

    const supabase = createAdminClient();
    const payload = {
        name: v.name.trim(),
        colour: v.colour.toLowerCase(),
        sort_order: v.sort_order ?? 0,
        is_active: v.is_active ?? true,
        updated_at: new Date().toISOString(),
    };

    if (v.id) {
        const { error } = await supabase
            .from('project_managers')
            .update(payload)
            .eq('id', v.id);
        if (error) return err(error.message);
        revalidateBoard();
        return ok({ id: v.id });
    }

    const { data, error } = await supabase
        .from('project_managers')
        .insert(payload)
        .select('id')
        .single();
    if (error) return err(error.message);
    revalidateBoard();
    return ok({ id: data.id as string });
}
