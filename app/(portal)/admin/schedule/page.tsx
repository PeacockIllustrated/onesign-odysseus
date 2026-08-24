import { redirect } from 'next/navigation';
import { isSuperAdmin } from '@/lib/auth';
import { PageHeader } from '@/app/(portal)/components/ui';
import { getScheduleBoard, getScheduleClientOptions } from '@/lib/schedule/queries';
import { resolveScheduleWindow } from '@/lib/schedule/window';
import { ScheduleBoard } from './ScheduleBoard';

export const metadata = { title: 'Schedule · Onesign Odysseus' };
export const dynamic = 'force-dynamic';

interface PageProps {
    searchParams: Promise<{
        view?: string;
        week?: string;
        month?: string;
        year?: string;
    }>;
}

export default async function SchedulePage({ searchParams }: PageProps) {
    if (!(await isSuperAdmin())) redirect('/admin');

    const win = resolveScheduleWindow(await searchParams);
    const [data, clients] = await Promise.all([
        getScheduleBoard(win.from, win.to),
        getScheduleClientOptions(),
    ]);

    return (
        <div>
            <PageHeader
                title="Schedule"
                description="Fitting work by van and day. Drag a card to move it; drop it in a holding list to unschedule."
            />
            <ScheduleBoard
                data={data}
                clients={clients}
                view={win.view}
                monday={win.monday}
                month={win.month}
                year={win.year}
                basePath="/admin/schedule"
            />
        </div>
    );
}
