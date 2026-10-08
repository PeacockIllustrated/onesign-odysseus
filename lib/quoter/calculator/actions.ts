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
import { defaultPriceBook } from './default-price-book';
import {
    CalcJobSchema,
    type CalcJob,
    type CalculatorJobRow,
    type CalculatorJobSummary,
    type PriceBook,
    type PriceBookVersion,
} from './types';
import { formatPence, parsePriceBook, priceJob, validatePriceBook } from '../engine/panel-letters-v2';
import { buildQuoteLines } from './quote-lines';

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
 * total (see quote-lines.ts, which the tests hold to that). Extras go across
 * as service lines at their sell price.
 *
 * `expectedNetPence` is the net the person was looking at. The job is
 * re-priced here from the current book, and if someone saved new prices in
 * between, the two differ — the quote is refused rather than going out at a
 * figure nobody saw.
 *
 * A job that already has a quote can be quoted again (a revision after
 * edits); the job then points at the new quote. The old one is untouched.
 */
export async function createQuoteFromCalculatorJob(
    jobId: string,
    opts: { expectedNetPence: number; again?: boolean }
): Promise<Result<{ quote_id: string }>> {
    const gate = await requireSuperAdminOrError();
    if (!gate.ok) return err(gate.error);

    const loaded = await getCalculatorJob(jobId);
    if (!loaded.ok) return loaded;
    const row = loaded.data;
    if (row.quote_id && !opts.again) return err('This job has already been turned into a quote.');

    const current = await loadCurrentBook();
    if (!current.ok) return current;
    const book = current.data.book;
    const priced = priceJob(row.job, book);

    if (priced.error_count > 0) {
        return err('Part of this job is not priced (see the red notes on each sign). Fix those before making a quote.');
    }
    if (priced.net_pence <= 0) return err('There is nothing priced on this job yet.');
    if (priced.net_pence !== opts.expectedNetPence) {
        return err(
            `The price book changed since this page loaded — the job now comes to ${formatPence(priced.net_pence)}, not ${formatPence(opts.expectedNetPence)}. Reload the page, check the figures, and create the quote again.`
        );
    }

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

    // Link the job straight away, so a failure part-way through still leaves
    // the job pointing at the quote that needs finishing.
    const supabase = await createServerClient();
    await supabase.from('calculator_jobs').update({ quote_id: quoteId }).eq('id', jobId);

    for (const line of buildQuoteLines(priced, book, stamp)) {
        const added = await addGenericQuoteItemAction(quoteId, line);
        if ('error' in added) {
            return err(
                `The quote was created but "${line.part_label}" could not be added (${added.error}). Open the quote to finish it by hand.`
            );
        }
    }

    revalidatePath(PATH);
    revalidatePath('/admin/quotes');
    return ok({ quote_id: quoteId });
}
