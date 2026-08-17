import { createAdminClient } from '@/lib/supabase-admin';
import type {
    DayCrewOverrideRow,
    DefaultCrewRow,
    Fitter,
    FittingJobView,
    ProjectManager,
    ScheduleBoardData,
    Van,
} from './types';

/**
 * The board reads a window of dates rather than the whole table: a year of
 * fitting work is thousands of cards, and the week view needs six of them.
 * Unscheduled holding-panel jobs have no date, so they are always included.
 */
const JOB_SELECT = `
    *,
    org:orgs ( name ),
    site:org_sites ( name, postcode ),
    contact:contacts ( first_name, last_name ),
    quote:quotes ( quote_number )
`;

type JoinedJobRow = Record<string, unknown> & {
    org: { name: string } | null;
    site: { name: string | null; postcode: string | null } | null;
    contact: { first_name: string | null; last_name: string | null } | null;
    quote: { quote_number: string } | null;
};

function flatten(row: JoinedJobRow): FittingJobView {
    const { org, site, contact, quote, ...job } = row;
    const contactName = [contact?.first_name, contact?.last_name]
        .filter(Boolean)
        .join(' ');
    return {
        ...(job as unknown as FittingJobView),
        org_name: org?.name ?? null,
        site_name: site?.name ?? null,
        site_postcode: site?.postcode ?? null,
        contact_name: contactName || null,
        quote_number: quote?.quote_number ?? null,
        updated_by_name: null,
    };
}

/**
 * Load everything the board renders for a date window.
 *
 * `from`/`to` bound the scheduled work; roster tables are small enough to
 * fetch whole. Archived jobs never leave the database.
 */
export async function getScheduleBoard(
    from: string,
    to: string
): Promise<ScheduleBoardData> {
    const supabase = createAdminClient();

    const [
        scheduledRes,
        holdingRes,
        vansRes,
        fittersRes,
        pmsRes,
        defaultCrewRes,
        overridesRes,
    ] = await Promise.all([
        supabase
            .from('fitting_jobs')
            .select(JOB_SELECT)
            .is('archived_at', null)
            .gte('scheduled_date', from)
            .lte('scheduled_date', to),
        supabase
            .from('fitting_jobs')
            .select(JOB_SELECT)
            .is('archived_at', null)
            .is('scheduled_date', null),
        supabase.from('vans').select('*').order('sort_order'),
        supabase.from('fitters').select('*').order('roster_group').order('sort_order'),
        supabase.from('project_managers').select('*').order('sort_order'),
        supabase.from('default_crew').select('*'),
        supabase
            .from('day_crew_overrides')
            .select('*')
            .gte('date', from)
            .lte('date', to),
    ]);

    const rows = [
        ...((scheduledRes.data ?? []) as JoinedJobRow[]),
        ...((holdingRes.data ?? []) as JoinedJobRow[]),
    ];

    return {
        jobs: rows.map(flatten),
        vans: (vansRes.data ?? []) as Van[],
        fitters: (fittersRes.data ?? []) as Fitter[],
        pms: (pmsRes.data ?? []) as ProjectManager[],
        defaultCrew: (defaultCrewRes.data ?? []) as DefaultCrewRow[],
        overrides: (overridesRes.data ?? []) as DayCrewOverrideRow[],
    };
}

/** A single job, for the edit modal and the fitter's phone view. */
export async function getFittingJob(id: string): Promise<FittingJobView | null> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('fitting_jobs')
        .select(JOB_SELECT)
        .eq('id', id)
        .maybeSingle();
    return data ? flatten(data as JoinedJobRow) : null;
}

/** Client picker options for the job modal. */
export async function getScheduleClientOptions(): Promise<
    Array<{ id: string; name: string }>
> {
    const supabase = createAdminClient();
    const { data } = await supabase.from('orgs').select('id, name').order('name');
    return (data ?? []) as Array<{ id: string; name: string }>;
}

/** Sites for a client, so a job can inherit the right address. */
export async function getOrgSiteOptions(orgId: string): Promise<
    Array<{ id: string; name: string; postcode: string | null; city: string | null }>
> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('org_sites')
        .select('id, name, postcode, city')
        .eq('org_id', orgId)
        .order('is_primary', { ascending: false })
        .order('name');
    return (data ?? []) as Array<{
        id: string;
        name: string;
        postcode: string | null;
        city: string | null;
    }>;
}

/**
 * Accepted quotes that have not yet produced a fitting card — the queue the
 * board pulls from instead of the CSV import the standalone spec described.
 */
export async function getSchedulableQuotes(): Promise<
    Array<{ id: string; quote_number: string; customer_name: string | null; project_name: string | null }>
> {
    const supabase = createAdminClient();
    const [quotesRes, existingRes] = await Promise.all([
        supabase
            .from('quotes')
            .select('id, quote_number, customer_name, project_name')
            .eq('status', 'accepted')
            .order('created_at', { ascending: false })
            .limit(200),
        supabase
            .from('fitting_jobs')
            .select('quote_id')
            .not('quote_id', 'is', null)
            .is('archived_at', null),
    ]);

    const taken = new Set(
        ((existingRes.data ?? []) as Array<{ quote_id: string }>).map((r) => r.quote_id)
    );
    return ((quotesRes.data ?? []) as Array<{
        id: string;
        quote_number: string;
        customer_name: string | null;
        project_name: string | null;
    }>).filter((q) => !taken.has(q.id));
}
