import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import dynamicImport from 'next/dynamic';
import { PageHeader } from '@/app/(portal)/components/ui';
import { formatSiteAddress, pinColour, type RecordCounts } from '@/lib/geo/utils';

export const dynamic = 'force-dynamic';

const MapClient = dynamicImport(() => import('./MapClient').then((m) => m.MapClient), {
    ssr: false,
    loading: () => (
        <div className="h-[600px] bg-neutral-100 animate-pulse rounded-lg flex items-center justify-center text-neutral-400 text-sm">
            Loading map…
        </div>
    ),
});

export interface SitePin {
    siteId: string;
    siteName: string;
    orgId: string;
    orgName: string;
    address: string;
    lat: number;
    lng: number;
    quotes: number;
    artwork: number;
    production: number;
    deliveries: number;
    maintenance: number;
    colour: string;
}

export default async function MapPage() {
    await requireAdmin();

    const supabase = await createServerClient();

    // 1. All geocoded sites + their org names.
    const { data: sites } = await supabase
        .from('org_sites')
        .select('id, name, org_id, address_line_1, address_line_2, city, county, postcode, latitude, longitude, orgs!inner(name)')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null);

    if (!sites || sites.length === 0) {
        return (
            <div className="p-6 max-w-6xl mx-auto">
                <PageHeader title="Map" description="site-centric overview of active work across the UK" />
                <div className="mt-6 p-8 bg-neutral-50 border border-neutral-200 rounded-lg text-center text-sm text-neutral-500">
                    No geocoded sites yet. Add a postcode to a client site and it will appear here.
                </div>
            </div>
        );
    }

    // 2. Count active records per site.
    const countQuery = async (table: string, statuses: string[]) => {
        const { data } = await supabase
            .from(table)
            .select('site_id')
            .not('site_id', 'is', null)
            .in('status', statuses);
        const counts = new Map<string, number>();
        for (const row of data ?? []) {
            counts.set((row as any).site_id, (counts.get((row as any).site_id) ?? 0) + 1);
        }
        return counts;
    };

    const [quoteCounts, artworkCounts, productionCounts, deliveryCounts, maintenanceCounts] =
        await Promise.all([
            countQuery('quotes', ['draft', 'sent', 'accepted']),
            countQuery('artwork_jobs', ['draft', 'in_progress']),
            countQuery('production_jobs', ['active', 'paused']),
            countQuery('deliveries', ['scheduled', 'in_transit']),
            countQuery('maintenance_visits', ['scheduled', 'in_progress']),
        ]);

    // 3. Build pins.
    const pins: SitePin[] = [];
    for (const site of sites as any[]) {
        const counts: RecordCounts = {
            quotes: quoteCounts.get(site.id) ?? 0,
            artwork: artworkCounts.get(site.id) ?? 0,
            production: productionCounts.get(site.id) ?? 0,
            deliveries: deliveryCounts.get(site.id) ?? 0,
            maintenance: maintenanceCounts.get(site.id) ?? 0,
        };
        const total = counts.quotes + counts.artwork + counts.production + counts.deliveries + counts.maintenance;
        if (total === 0) continue;

        pins.push({
            siteId: site.id,
            siteName: site.name,
            orgId: site.org_id,
            orgName: site.orgs?.name ?? '—',
            address: formatSiteAddress(site),
            lat: site.latitude,
            lng: site.longitude,
            ...counts,
            colour: pinColour(counts),
        });
    }

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <PageHeader
                title="Map"
                description={`${pins.length} site${pins.length !== 1 ? 's' : ''} with active work`}
            />
            <div className="mt-4">
                <MapClient pins={pins} />
            </div>
        </div>
    );
}
