import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { createAdminClient } from '@/lib/supabase-admin';
import { getDeliveries } from '@/lib/deliveries/queries';
import { getActiveDrivers, getAllDrivers } from '@/lib/drivers/actions';
import { getMonday } from '@/lib/planning/utils';
import { formatSiteAddress, pinColour, type RecordCounts } from '@/lib/geo/utils';
import { PageHeader } from '@/app/(portal)/components/ui';
import { UnifiedDeliveries } from './UnifiedDeliveries';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ week?: string; weekends?: string }>;
}

export default async function DeliveriesPage({ searchParams }: PageProps) {
    await requireAdmin();

    const params = await searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const monday = params.week ?? getMonday(today);
    const includeWeekends = params.weekends === '1';

    const endDay = new Date(monday + 'T00:00:00');
    endDay.setDate(endDay.getDate() + (includeWeekends ? 6 : 4));
    const endDate = endDay.toISOString().slice(0, 10);

    const supabase = await createServerClient();
    // Admin client for map + planning queries — bypasses RLS so all sites
    // and record counts are visible regardless of org membership.
    const adminDb = createAdminClient();

    const [
        deliveries, planningRaw, sitesRaw, activeDrivers, allDrivers,
        qcRaw, acRaw, pcRaw, dcRaw, mcRaw,
    ] = await Promise.all([
        getDeliveries(),
        adminDb.from('deliveries').select(`id, delivery_number, scheduled_date, status, driver_id, driver_name, site_id, org_sites(id, name, latitude, longitude), orgs(name)`)
            .gte('scheduled_date', monday).lte('scheduled_date', endDate).in('status', ['scheduled', 'in_transit']).order('scheduled_date').then((r) => r.data ?? []),
        adminDb.from('org_sites').select('id, name, org_id, address_line_1, address_line_2, city, county, postcode, latitude, longitude, orgs(name)')
            .not('latitude', 'is', null).not('longitude', 'is', null).then((r) => r.data ?? []),
        getActiveDrivers(),
        getAllDrivers(),
        adminDb.from('quotes').select('site_id').not('site_id', 'is', null).in('status', ['draft', 'sent', 'accepted']).then((r) => r.data ?? []),
        adminDb.from('artwork_jobs').select('site_id').not('site_id', 'is', null).in('status', ['draft', 'in_progress']).then((r) => r.data ?? []),
        adminDb.from('production_jobs').select('site_id').not('site_id', 'is', null).in('status', ['active', 'paused']).then((r) => r.data ?? []),
        adminDb.from('deliveries').select('site_id').not('site_id', 'is', null).in('status', ['scheduled', 'in_transit']).then((r) => r.data ?? []),
        adminDb.from('maintenance_visits').select('site_id').not('site_id', 'is', null).in('status', ['scheduled', 'in_progress']).then((r) => r.data ?? []),
    ]);

    const planningDeliveries = planningRaw.map((d: any) => ({
        id: d.id, delivery_number: d.delivery_number, scheduled_date: d.scheduled_date,
        status: d.status, driver_id: d.driver_id, driver_name: d.driver_name,
        site_name: d.org_sites?.name ?? null, site_lat: d.org_sites?.latitude ?? null,
        site_lng: d.org_sites?.longitude ?? null, org_name: d.orgs?.name ?? null,
    }));

    const countMap = (rows: any[]) => {
        const m = new Map<string, number>();
        for (const r of rows) m.set(r.site_id, (m.get(r.site_id) ?? 0) + 1);
        return m;
    };
    const qc = countMap(qcRaw); const ac = countMap(acRaw); const pc = countMap(pcRaw);
    const dc = countMap(dcRaw); const mc = countMap(mcRaw);

    // Show ALL geocoded sites on the map — not just ones with active records.
    // Sites with active work get colour-coded pins; sites with nothing active
    // get grey pins so you can still see the full site landscape.
    const pins = sitesRaw.map((site: any) => {
        const counts: RecordCounts = {
            quotes: qc.get(site.id) ?? 0, artwork: ac.get(site.id) ?? 0,
            production: pc.get(site.id) ?? 0, deliveries: dc.get(site.id) ?? 0,
            maintenance: mc.get(site.id) ?? 0,
        };
        return {
            siteId: site.id, siteName: site.name, orgId: site.org_id,
            orgName: site.orgs?.name ?? '—', address: formatSiteAddress(site),
            lat: site.latitude as number, lng: site.longitude as number,
            ...counts, colour: pinColour(counts),
        };
    });

    // Also count total sites with postcodes but no lat/lng (ungeooded).
    const { count: ungeocodedCount } = await adminDb
        .from('org_sites')
        .select('*', { count: 'exact', head: true })
        .is('latitude', null)
        .not('postcode', 'is', null);
    const hasUngeocoded = (ungeocodedCount ?? 0) > 0;

    return (
        <div className="p-4 md:p-6 max-w-full mx-auto">
            <PageHeader title="Deliveries" description="manage deliveries, plan routes, view the map" />
            <UnifiedDeliveries deliveries={deliveries} planningDeliveries={planningDeliveries}
                activeDrivers={activeDrivers} allDrivers={allDrivers}
                monday={monday} includeWeekends={includeWeekends} pins={pins as any}
                hasUngeocoded={hasUngeocoded} />
        </div>
    );
}
