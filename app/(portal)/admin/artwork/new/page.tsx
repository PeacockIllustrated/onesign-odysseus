import { requireAdmin } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase-admin';
import { PageHeader, Card } from '@/app/(portal)/components/ui';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { NewArtworkJobForm } from './NewArtworkJobForm';

export default async function NewArtworkJobPage() {
    await requireAdmin();

    const supabase = createAdminClient();
    const [orgsRes, itemsRes, existingRes, contactsRes, sitesRes] = await Promise.all([
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
        supabase
            .from('contacts')
            .select('id, org_id, first_name, last_name')
            .order('first_name'),
        supabase
            .from('org_sites')
            .select('id, org_id, name')
            .order('name'),
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
                description="create a production artwork job — optionally link to a client and/or a production item"
            />

            <Card>
                <NewArtworkJobForm
                    orgs={orgsRes.data ?? []}
                    items={items}
                    contacts={(contactsRes.data ?? []) as any}
                    sites={(sitesRes.data ?? []) as any}
                />
            </Card>
        </div>
    );
}
