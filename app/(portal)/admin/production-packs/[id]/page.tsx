import { requireAdmin } from '@/lib/auth';
import { getProductionPack } from '@/lib/production-packs/actions';
import { notFound } from 'next/navigation';
import { PackBuilder } from './PackBuilder';

export default async function ProductionPackBuilderPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const pack = await getProductionPack(id);
    if (!pack) notFound();

    return (
        <PackBuilder
            id={pack.id}
            initialTitle={pack.title}
            initialStatus={pack.status}
            initialContent={pack.content}
        />
    );
}
