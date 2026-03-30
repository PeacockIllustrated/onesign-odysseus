// app/(portal)/admin/jobs/page.tsx
import { requireAdmin } from '@/lib/auth';
import { getJobBoard, getProductionStages } from '@/lib/production/queries';
import { JobBoardClient } from './JobBoardClient';

export default async function JobBoardPage() {
    await requireAdmin();

    const [boardData, stages] = await Promise.all([
        getJobBoard(),
        getProductionStages(),
    ]);

    return (
        <div className="flex flex-col h-full">
            <div className="mb-4">
                <h1 className="text-xl font-bold text-neutral-900 tracking-tight">Production Job Board</h1>
                <p className="text-sm text-neutral-500 mt-0.5">Active jobs across all stages</p>
            </div>
            <JobBoardClient initialBoard={boardData} stages={stages} />
        </div>
    );
}
