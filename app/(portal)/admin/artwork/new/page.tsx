import { requireAdmin } from '@/lib/auth';
import { createServerClient } from '@/lib/supabase-server';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewArtworkJobForm } from './NewArtworkJobForm';

export default async function NewArtworkJobPage() {
    await requireAdmin();

    const supabase = await createServerClient();
    const [orgsRes, itemsRes, existingRes] = await Promise.all([
        supabase.from('orgs').select('id, name').order('name'),
        supabase
            .from('job_items')
            .select(`
                id,
                description,
                item_number,
                production_jobs!inner(job_number, client_name, status)
            `)
            .order('created_at', { ascending: false })
            .limit(100),
        supabase.from('artwork_jobs').select('job_item_id'),
    ]);

    const taken = new Set(
        (existingRes.data ?? [])
            .map((r: any) => r.job_item_id)
            .filter(Boolean)
    );

    const items = (itemsRes.data ?? [])
        .filter(
            (i: any) =>
                (i.production_jobs?.status === 'active' ||
                    i.production_jobs?.status === 'paused') &&
                !taken.has(i.id)
        )
        .map((i: any) => ({
            id: i.id,
            label: `${i.production_jobs.job_number}${i.item_number ? ' · ' + i.item_number : ''} — ${i.description ?? ''}`,
        }));

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <Link
                href="/admin/artwork"
                className="inline-flex items-center gap-1 text-sm text-neutral-600 hover:text-black mb-4 transition-colors"
            >
                <ChevronLeft size={16} />
                back to artwork jobs
            </Link>

            <PageHeader
                title="new artwork job"
                description="spawn from a production item, or create an orphan for warranty / rework"
            />

            <Card>
                <NewArtworkJobForm orgs={orgsRes.data ?? []} items={items} />
            </Card>

            <div className="mt-6 p-4 bg-neutral-50 rounded-[var(--radius-md)] border border-neutral-200">
                <h3 className="text-sm font-medium text-neutral-900 mb-2">how it works</h3>
                <ul className="text-sm text-neutral-600 space-y-1">
                    <li>1. create the job and add fabrication components</li>
                    <li>2. submit design specifications per component (dimensions, material, artwork)</li>
                    <li>3. sign off each component when design is confirmed</li>
                    <li>4. print A4 compliance sheets for production verification</li>
                    <li>5. production records measurements and signs off</li>
                </ul>
            </div>
        </div>
    );
}
