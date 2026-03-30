import { requireAdmin } from '@/lib/auth';

export default async function JobBoardPage() {
    await requireAdmin();

    return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
            <h1 className="text-2xl font-bold text-neutral-900 mb-2">Production Job Board</h1>
            <p className="text-neutral-500">Phase 1 — Coming soon</p>
        </div>
    );
}
