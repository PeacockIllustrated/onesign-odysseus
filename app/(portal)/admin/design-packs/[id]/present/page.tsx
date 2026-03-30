import { requireAdmin } from '@/lib/auth';
import { getDesignPack } from '@/lib/design-packs/actions';
import { notFound } from 'next/navigation';
import { PresentationView } from './PresentationView';

export default async function PresentationModePage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    await requireAdmin();

    const { id } = await params;
    const pack = await getDesignPack(id);

    if (!pack) {
        notFound();
    }

    return <PresentationView pack={pack} />;
}
