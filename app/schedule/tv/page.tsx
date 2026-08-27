import { getScheduleBoard, getScheduleDeliveries } from '@/lib/schedule/queries';
import { resolveScheduleWindow } from '@/lib/schedule/window';
import { TvBoard } from './TvBoard';

/**
 * Never serve the wall a cached board. The page reads searchParams so Next
 * renders it dynamically anyway, but a TV left running for weeks is exactly
 * where a stale cache would go unnoticed — the office page says the same
 * thing for the same reason.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

interface PageProps {
    searchParams: Promise<{
        view?: string;
        week?: string;
        month?: string;
        year?: string;
    }>;
}

/**
 * The board as the workshop sees it: no chrome, one screen, driven by the TV
 * remote. `TvBoard` renders the same WeekView / MonthView / YearView the office
 * board does, so the grid itself cannot drift between the two surfaces.
 */
export default async function ScheduleTvPage({ searchParams }: PageProps) {
    const win = resolveScheduleWindow(await searchParams);
    const [data, deliveries] = await Promise.all([
        getScheduleBoard(win.from, win.to),
        getScheduleDeliveries(win.from, win.to),
    ]);

    return (
        <TvBoard
            data={data}
            deliveries={deliveries}
            view={win.view}
            monday={win.monday}
            month={win.month}
            year={win.year}
        />
    );
}
