// app/(portal)/admin/binder/page.tsx
import { requireAdmin } from '@/lib/auth';
import { listBinderAssets } from '@/lib/binder/actions';
import { getClientListAction } from '@/lib/clients/actions';
import { BinderManagerClient } from './BinderManagerClient';

export const metadata = { title: 'Logo Binder · Onesign Odysseus' };

export default async function BinderPage() {
    await requireAdmin();
    const [assetsRes, clients] = await Promise.all([
        listBinderAssets(),
        getClientListAction().catch(() => []),
    ]);
    return (
        <BinderManagerClient
            initialAssets={assetsRes.ok ? assetsRes.data : []}
            clients={clients.map((c) => ({ id: c.id, name: c.name }))}
        />
    );
}
