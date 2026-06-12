// app/(portal)/admin/visualiser/returns/page.tsx
import { requireAdmin } from '@/lib/auth';
import { listReturnJobs } from '@/lib/visualiser/returns-actions';
import { ReturnsClient } from './ReturnsClient';

export const metadata = { title: 'Built-up Returns · Onesign Odysseus' };

export default async function ReturnsPage({
    searchParams,
}: {
    searchParams: Promise<{ id?: string }>;
}) {
    await requireAdmin();
    const { id } = await searchParams;

    const res = await listReturnJobs();
    const jobs = res.ok ? res.data : [];

    // The nester's "Open job" link comes back here with ?id=<job>; auto-load
    // it on mount, falling through silently if the job was deleted.
    const initialLoadId = id && jobs.some((j) => j.id === id) ? id : null;

    return <ReturnsClient initialJobs={jobs} initialLoadId={initialLoadId} />;
}
