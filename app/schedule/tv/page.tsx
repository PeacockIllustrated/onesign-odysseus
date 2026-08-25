import { getScheduleBoard } from '@/lib/schedule/queries';
import { resolveScheduleWindow } from '@/lib/schedule/window';
import { ScheduleBoard } from '@/app/(portal)/admin/schedule/ScheduleBoard';

interface PageProps {
    searchParams: Promise<{
        view?: string;
        week?: string;
        month?: string;
        year?: string;
    }>;
}

/**
 * The board as the workshop sees it. Same component as the office desk view,
 * mounted read-only with larger type — one implementation, so a change to the
 * week view can't drift between the two surfaces.
 */
export default async function ScheduleTvPage({ searchParams }: PageProps) {
    const win = resolveScheduleWindow(await searchParams);
    const data = await getScheduleBoard(win.from, win.to);

    return (
        <ScheduleBoard
            data={data}
            clients={[]}
            view={win.view}
            monday={win.monday}
            month={win.month}
            year={win.year}
            basePath="/schedule/tv"
            tv
        />
    );
}
