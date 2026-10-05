'use server';

/**
 * Sign calculator — server actions.
 *
 * The price book is shared and versioned (every save is a new row in
 * `calculator_price_books`), jobs are saved (`calculator_jobs`), and a priced
 * job becomes a real Odysseus quote: one generic line per sign, carrying its
 * dimensions and sub-items so the artwork skeleton on acceptance is populated
 * exactly as it is for a hand-built quote, plus a service line per extra.
 *
 * Every figure written to the database is re-priced here on the server from
 * the current book — the browser's numbers are never trusted for money.
 */

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { getUser, requireSuperAdminOrError } from '@/lib/auth';
import { ok, err, type Result } from '@/lib/result';
import { getActivePricingSet } from '@/lib/quoter/rate-card';
import { addGenericQuoteItemAction, createQuoteAction, updateQuoteAction } from '@/lib/quoter/actions';
import type { QuoteSubItemInput } from '@/lib/quoter/types';
import { defaultPriceBook } from './default-price-book';
import {
    CalcJobSchema,
    type CalcJob,
    type CalculatorJobRow,
    type CalculatorJobSummary,
    type PriceBook,
    type PriceBookVersion,
} from './types';
import { parsePriceBook, priceJob, signSpec, validatePriceBook } from '../engine/panel-letters-v2';

const PATH = '/admin/calculator';

// ---------------------------------------------------------------------------
// Price book
// ---------------------------------------------------------------------------

async function loadCurrentBook(): Promise<Result<PriceBookVersion>> {
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('calculator_price_books')
        .select('id, version, book, note, created_at, created_by_email')
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (error) return err(`Could not load the price book: ${error.message}`);
    if (!data) {
        return ok({ id: null, version: 0, book: defaultPriceBook(), note: null, created_at: null, created_by_email: null });
    }
    const book = parsePriceBook(data.book);
    if (!book) return err(`Price book v${data.version} could not be read. Save a corrected version from the price book tab.`);
    return ok({ ...data, book } as PriceBookVersion);
}

export async function getCurrentPriceBook(): Promise<Result<PriceBookVersion>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    return loadCurrentBook();
}

export async function listPriceBookVersions(): Promise<
    Result<{ version: number; note: string | null; created_at: string; created_by_email: string | null }[]>
> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('calculator_price_books')
        .select('version, note, created_at, created_by_email')
        .order('version', { ascending: false })
        .limit(25);
    if (error) return err(error.message);
    return ok(data ?? []);
}

/**
 * Save the book as a new version.
 *
 * `baseVersion` is the version the editor opened. If someone else has saved
 * since, this refuses rather than silently replacing their prices — the
 * editor reloads and the change can be made again on top of theirs.
 */
export async function savePriceBook(input: {
    book: PriceBook;
    note?: string;
    baseVersion: number;
}): Promise<Result<PriceBookVersion>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const problems = validatePriceBook(input.book);
    if (problems.length) return err(problems[0]);
    const book = parsePriceBook(input.book)!;

    const current = await loadCurrentBook();
    if (!current.ok) return current;
    if (current.data.version !== input.baseVersion) {
        return err(
            `Price book v${current.data.version} was saved by ${current.data.created_by_email ?? 'someone else'} after you opened v${input.baseVersion}. Reload to see their changes, then make yours again.`
        );
    }

    const user = await getUser();
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('calculator_price_books')
        .insert({
            version: current.data.version + 1,
            book,
            note: input.note?.trim().slice(0, 300) || null,
            created_by: user?.id ?? null,
            created_by_email: user?.email ?? null,
        })
        .select('id, version, book, note, created_at, created_by_email')
        .single();

    if (error) {
        // Two saves racing land on the same version number; the unique index
        // turns the second into this error rather than an overwrite.
        if (error.code === '23505') return err('Someone saved the price book at the same moment. Reload and try again.');
        return err(error.message);
    }
    revalidatePath(PATH);
    return ok({ ...data, book } as PriceBookVersion);
}

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export async function listCalculatorJobs(): Promise<Result<CalculatorJobSummary[]>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const supabase = await createServerClient();
    const { data, error } = await supabase
        .from('calculator_jobs')
        .select('id, reference, title, client_name, net_pence, quote_id, updated_at, quote:quotes(quote_number)')
        .order('updated_at', { ascending: false })
        .limit(100);
    if (error) return err(error.message);
    return ok(
        (data ?? []).map((r) => {
            const q = r.quote as { quote_number: string } | { quote_number: string }[] | null;
            const quote = Array.isArray(q) ? q[0] : q;
            return {
                id: r.id,
                reference: r.reference,
                title: r.title,
                client_name: r.client_name,
                net_pence: r.net_pence,
                quote_id: r.quote_id,
                quote_number: quote?.quote_number ?? null,
                updated_at: r.updated_at,
            };
        })
    );
}

export async function getCalculatorJob(id: string): Promise<Result<CalculatorJobRow>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const supabase = await createServerClient();
    const { data, error } = await supabase.from('calculator_jobs').select('*').eq('id', id).maybeSingle();
    if (error) return err(error.message);
    if (!data) return err('That job no longer exists.');
    const job = CalcJobSchema.safeParse(data.job);
    if (!job.success) return err(`${data.reference} could not be read: ${job.error.issues[0].message}`);
    return ok({ ...data, job: job.data } as CalculatorJobRow);
}

export interface SaveJobInput {
    id: string | null;
    title: string;
    client_name: string;
    org_id: string | null;
    job: CalcJob;
}

export async function saveCalculatorJob(input: SaveJobInput): Promise<Result<CalculatorJobRow>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const parsed = CalcJobSchema.safeParse(input.job);
    if (!parsed.success) {
        const i = parsed.error.issues[0];
        return err(`${i.path.join(' › ')}: ${i.message}`);
    }
    const current = await loadCurrentBook();
    if (!current.ok) return current;
    const priced = priceJob(parsed.data, current.data.book);

    const row = {
        title: input.title.trim().slice(0, 200) || 'Untitled job',
        client_name: input.client_name.trim().slice(0, 200) || null,
        org_id: input.org_id || null,
        job: parsed.data,
        price_book_version: current.data.version,
        net_pence: priced.net_pence,
        gross_pence: priced.gross_pence,
    };

    const supabase = await createServerClient();
    const user = await getUser();
    const q = input.id
        ? supabase.from('calculator_jobs').update(row).eq('id', input.id)
        : supabase.from('calculator_jobs').insert({ ...row, created_by: user?.id ?? null });
    const { data, error } = await q.select('*').single();
    if (error) return err(error.message);

    revalidatePath(PATH);
    return ok({ ...data, job: parsed.data } as CalculatorJobRow);
}

export async function deleteCalculatorJob(id: string): Promise<Result<null>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);
    const supabase = await createServerClient();
    const { error } = await supabase.from('calculator_jobs').delete().eq('id', id);
    if (error) return err(error.message);
    revalidatePath(PATH);
    return ok(null);
}

// ---------------------------------------------------------------------------
// Job → quote
// ---------------------------------------------------------------------------

/**
 * Turn a saved job into a draft Odysseus quote.
 *
 * Each sign becomes a generic production line priced at the calculator's
 * "each" figure, so the quote's lines multiply out to exactly the calculator's
 * total. Its tray, aperture and letter sets go across as sub-items, which is
 * what the artwork skeleton is generated from when the quote is accepted.
 * Extras go across as service lines at their sell price.
 *
 * The quote gets its OSD- reference and 30-day validity from the normal quote
 * flow; everything after this point is the quote's, not the calculator's.
 */
export async function createQuoteFromCalculatorJob(jobId: string): Promise<Result<{ quote_id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const loaded = await getCalculatorJob(jobId);
    if (!loaded.ok) return loaded;
    const row = loaded.data;
    if (row.quote_id) return err('This job has already been turned into a quote.');

    const current = await loadCurrentBook();
    if (!current.ok) return current;
    const book = current.data.book;
    const priced = priceJob(row.job, book);

    if (priced.error_count > 0) {
        return err('Part of this job is not priced (see the red notes on each sign). Fix those before making a quote.');
    }
    if (priced.net_pence <= 0) return err('There is nothing priced on this job yet.');

    let pricingSetId: string;
    try {
        pricingSetId = (await getActivePricingSet()).id;
    } catch {
        return err('Quotes need an active pricing set. Activate one under Pricing, then try again.');
    }

    const created = await createQuoteAction({
        customer_name: row.client_name ?? undefined,
        pricing_set_id: pricingSetId,
        org_id: row.org_id ?? undefined,
    });
    if ('error' in created) return err(`Could not create the quote: ${created.error}`);
    const quoteId = created.id;

    const stamp = `Priced in the sign calculator (${row.reference}) from price book ${
        current.data.version ? `v${current.data.version}` : 'defaults'
    }.`;
    await updateQuoteAction({ id: quoteId, project_name: row.title, notes_internal: stamp });

    const fail = (what: string, e: string) =>
        err(`The quote was created but ${what} could not be added (${e}). Open the quote to finish it by hand.`);

    for (const { sign, r } of priced.signs) {
        const finish = book.panel_finishes.find((f) => f.id === sign.panel.finish_id);
        const subItems: QuoteSubItemInput[] = [];
        if (sign.panel.width_mm > 0 && sign.panel.height_mm > 0) {
            subItems.push({
                name: 'Tray',
                material: sign.panel.material,
                finish: finish?.name,
                quantity: 1,
                width_mm: sign.panel.width_mm,
                height_mm: sign.panel.height_mm,
                returns_mm: sign.panel.returns_mm,
            });
        }
        if (sign.aperture.on && sign.aperture.width_mm > 0 && sign.aperture.height_mm > 0) {
            subItems.push({
                name: 'Illuminated aperture',
                material: sign.aperture.material,
                quantity: 1,
                width_mm: sign.aperture.width_mm,
                height_mm: sign.aperture.height_mm,
            });
        }
        for (const set of sign.letter_sets) {
            if (!(set.qty > 0)) continue;
            const type = book.letter_types.find((t) => t.id === set.type_id);
            const fin = type?.finishes.find((f) => f.id === set.finish_id);
            subItems.push({
                name: `${type?.name ?? 'Letters'} letters, ${set.height_mm}mm`,
                material: type?.name,
                finish: fin?.name,
                quantity: set.qty,
                height_mm: set.height_mm > 0 ? set.height_mm : null,
                notes: set.illuminated ? 'Illuminated' : undefined,
            });
        }
        const lit = sign.aperture.on || sign.letter_sets.some((s) => s.illuminated && s.qty > 0);

        const added = await addGenericQuoteItemAction(quoteId, {
            part_label: (sign.name || 'Sign').slice(0, 120),
            description: signSpec(sign, book).join('; ').slice(0, 4000),
            is_production_work: true,
            width_mm: sign.panel.width_mm > 0 ? sign.panel.width_mm : null,
            height_mm: sign.panel.height_mm > 0 ? sign.panel.height_mm : null,
            returns_mm: sign.panel.returns_mm,
            quantity: r.qty,
            unit_cost_pence: Math.round(r.materials_pence / r.qty),
            unit_price_pence: r.unit_pence,
            lighting: lit ? 'Illuminated' : undefined,
            spec_notes: stamp,
            sub_items: subItems.slice(0, 20),
        });
        if ('error' in added) return fail(sign.name, added.error);
    }

    for (const e of priced.extras) {
        if (e.line_pence <= 0) continue;
        // Quote lines take whole quantities. A fractional one (half a day's
        // fitting) goes across as one line at its total, with the working in
        // the description, so the money still matches.
        const whole = Number.isInteger(e.qty) && e.qty >= 1;
        const added = await addGenericQuoteItemAction(quoteId, {
            part_label: (e.description || 'Additional item').slice(0, 120),
            description: whole ? undefined : `${e.qty} × £${(e.sell_unit_pence / 100).toFixed(2)}`,
            is_production_work: false,
            quantity: whole ? e.qty : 1,
            unit_price_pence: whole ? e.sell_unit_pence : e.line_pence,
            unit_cost_pence: e.unit_cost_pence,
        });
        if ('error' in added) return fail(e.description || 'an extra', added.error);
    }

    const supabase = await createServerClient();
    await supabase.from('calculator_jobs').update({ quote_id: quoteId }).eq('id', jobId);

    revalidatePath(PATH);
    revalidatePath('/admin/quotes');
    return ok({ quote_id: quoteId });
}
