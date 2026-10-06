import { redirect } from 'next/navigation';
import { requireAdmin, isSuperAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader } from '@/app/(portal)/components/ui';
import { defaultPriceBook } from '@/lib/quoter/calculator/default-price-book';
import { getCalculatorJob, getCurrentPriceBook, listCalculatorJobs } from '@/lib/quoter/calculator/actions';
import type { CalculatorJobRow, PriceBookVersion } from '@/lib/quoter/calculator/types';
import { CalculatorClient } from './CalculatorClient';

export const dynamic = 'force-dynamic';

/**
 * Sign calculator — Mak's pricing tool, brought into Odysseus as the
 * panel_letters_v2 engine (lib/quoter/engine/panel-letters-v2.ts).
 *
 * Price a job sign by sign, see the working, save it, and turn it into a real
 * quote whose lines flow on to artwork. The price book is shared and
 * versioned. Super-admin only, like the rest of pricing.
 */
export default async function CalculatorPage({ searchParams }: { searchParams: Promise<{ job?: string }> }) {
    await requireAdmin();
    if (!(await isSuperAdmin())) redirect('/admin');

    const { job: jobId } = await searchParams;
    const supabase = await createServerClient();

    const [bookRes, jobsRes, orgsRes, jobRes] = await Promise.all([
        getCurrentPriceBook(),
        listCalculatorJobs(),
        supabase.from('orgs').select('id, name').order('name'),
        jobId ? getCalculatorJob(jobId) : Promise.resolve(null),
    ]);

    // A book that cannot be loaded must not stop someone pricing: fall back to
    // the built-in figures and say so at the top of the page.
    const book: PriceBookVersion = bookRes.ok
        ? bookRes.data
        : { id: null, version: 0, book: defaultPriceBook(), note: null, created_at: null, created_by_email: null };

    const errors = [
        !bookRes.ok && `${bookRes.error} Showing the built-in figures.`,
        !jobsRes.ok && `Saved jobs could not be loaded: ${jobsRes.error}`,
        jobRes && !jobRes.ok && jobRes.error,
    ].filter(Boolean) as string[];

    const initialJob: CalculatorJobRow | null = jobRes && jobRes.ok ? jobRes.data : null;

    return (
        <div className="mx-auto max-w-[1600px] p-6">
            <PageHeader
                title="Sign calculator"
                description="price trays, apertures, letters and lighting from the shared price book — then turn the job into a quote"
            />
            <CalculatorClient
                initialBook={book}
                initialJobs={jobsRes.ok ? jobsRes.data : []}
                initialJob={initialJob}
                orgs={(orgsRes.data ?? []) as { id: string; name: string }[]}
                loadError={errors.length ? errors.join(' ') : null}
            />
        </div>
    );
}
