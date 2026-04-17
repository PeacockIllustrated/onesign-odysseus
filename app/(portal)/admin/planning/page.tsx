import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader } from '@/app/(portal)/components/ui';
import { getActiveDrivers, getAllDrivers } from '@/lib/drivers/actions';
import { PlanningClient } from './PlanningClient';
import { getMonday } from '@/lib/planning/utils';

export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{ week?: string; weekends?: string }>;
}

export default async function PlanningPage({ searchParams }: PageProps) {
    await requireAdmin();

    const params = await searchParams;
    const today = new Date().toISOString().slice(0, 10);
    const monday = params.week ?? getMonday(today);
    const includeWeekends = params.weekends === '1';

    const endDay = new Date(monday + 'T00:00:00');
    endDay.setDate(endDay.getDate() + (includeWeekends ? 6 : 4));
    const endDate = endDay.toISOString().slice(0, 10);

    const supabase = await createServerClient();

    const { data: rawDeliveries } = await supabase
        .from('deliveries')
        .select(`
            id, delivery_number, scheduled_date, status,
            driver_id, driver_name,
            site_id,
            org_sites(id, name, latitude, longitude),
            orgs!inner(name)
        `)
        .gte('scheduled_date', monday)
        .lte('scheduled_date', endDate)
        .in('status', ['scheduled', 'in_transit'])
        .order('scheduled_date');

    const deliveries = (rawDeliveries ?? []).map((d: any) => ({
        id: d.id,
        delivery_number: d.delivery_number,
        scheduled_date: d.scheduled_date,
        status: d.status,
        driver_id: d.driver_id,
        driver_name: d.driver_name,
        site_name: d.org_sites?.name ?? null,
        site_lat: d.org_sites?.latitude ?? null,
        site_lng: d.org_sites?.longitude ?? null,
        org_name: d.orgs?.name ?? null,
    }));

    const [activeDrivers, allDrivers] = await Promise.all([
        getActiveDrivers(),
        getAllDrivers(),
    ]);

    return (
        <div className="p-6 max-w-full mx-auto">
            <PageHeader
                title="Delivery Planning"
                description={`Week of ${new Date(monday).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            />
            <PlanningClient
                deliveries={deliveries}
                activeDrivers={activeDrivers}
                allDrivers={allDrivers}
                monday={monday}
                includeWeekends={includeWeekends}
            />
        </div>
    );
}
