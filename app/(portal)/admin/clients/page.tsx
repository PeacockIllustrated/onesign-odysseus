import { requireAdmin } from '@/lib/auth';
import { getClients } from '@/lib/clients/queries';
import { ClientsListClient } from './ClientsListClient';

export default async function ClientsPage() {
    await requireAdmin();
    const clients = await getClients();
    return <ClientsListClient initialClients={clients} />;
}
