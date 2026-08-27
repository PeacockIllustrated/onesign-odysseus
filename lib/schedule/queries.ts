import { createAdminClient } from '@/lib/supabase-admin';
import type { PlanningDelivery } from '@/lib/planning/utils';
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
        additionalVanRes,
    ] = await Promise.all([
        // Overlap, not containment: a fit running Friday to Monday belongs on
        // BOTH weeks' boards, and a plain `scheduled_date >= from` drops it
        // from the second one — the week where it is actually happening.
        supabase
            .from('fitting_jobs')
            .select(JOB_SELECT)
            .is('archived_at', null)
            .lte('scheduled_date', to)
            .or(`end_date.gte.${from},and(end_date.is.null,scheduled_date.gte.${from})`),
        supabase
            .from('fitting_jobs')
            .select(JOB_SELECT)
            .is('archived_at', null)
            .is('scheduled_date', null),
        // Only vans currently on the road are board columns. The additional
        // van sits inactive until the toolbar switches it on.
        supabase.from('vans').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('fitters').select('*').order('roster_group').order('sort_order'),
        supabase.from('project_managers').select('*').order('sort_order'),
        supabase.from('default_crew').select('*'),
        supabase
            .from('day_crew_overrides')
            .select('*')
            .gte('date', from)
            .lte('date', to),
        // Fetched whatever its state, so the toolbar can offer the switch even
        // while the van is off and therefore absent from `vans` above.
        supabase
            .from('vans')
            .select('id, name, is_active')
            .eq('is_additional', true)
            .order('sort_order')
            .limit(1)
            .maybeSingle(),
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
        additionalVan:
            (additionalVanRes.data as { id: string; name: string; is_active: boolean } | null) ??
            null,
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


/**
 * Deliveries falling inside the board's window, shaped like the delivery
 * planner's own rows so both surfaces agree on what a stop is.
 *
 * The board renders these read-only: a delivery belongs to the Deliveries
 * module, and the point here is seeing the whole day — vans out fitting and
 * drivers out dropping — rather than editing it from two places. Completed and
 * failed runs are left out; the board is about what is still to happen.
 */
export async function getScheduleDeliveries(
    from: string,
    to: string
): Promise<PlanningDelivery[]> {
    const supabase = createAdminClient();
    const { data } = await supabase
        .from('deliveries')
        .select(
            `id, delivery_number, scheduled_date, status, driver_id, driver_name,
             site_id, org_sites ( name, latitude, longitude ), orgs ( name )`
        )
        .gte('scheduled_date', from)
        .lte('scheduled_date', to)
        .in('status', ['scheduled', 'in_transit'])
        .order('scheduled_date');

    interface Site {
        name: string | null;
        latitude: number | null;
        longitude: number | null;
    }
    interface Row {
        id: string;
        delivery_number: string;
        scheduled_date: string;
        status: string;
        driver_id: string | null;
        driver_name: string | null;
        // PostgREST types an embedded row as an array; at runtime a
        // to-one relationship arrives as a plain object. Take either.
        org_sites: Site | Site[] | null;
        orgs: { name: string | null } | { name: string | null }[] | null;
    }
    const one = <T,>(v: T | T[] | null): T | null =>
        Array.isArray(v) ? (v[0] ?? null) : v;

    return ((data ?? []) as unknown as Row[]).map((r) => {
        const site = one(r.org_sites);
        return {
            id: r.id,
            scheduled_date: r.scheduled_date,
            driver_id: r.driver_id,
            driver_name: r.driver_name,
            delivery_number: r.delivery_number,
            site_name: site?.name ?? null,
            site_lat: site?.latitude ?? null,
            site_lng: site?.longitude ?? null,
            org_name: one(r.orgs)?.name ?? null,
            status: r.status,
        };
    });
}
