import { requireAdmin } from '@/lib/auth';
import { getInvoices } from '@/lib/invoices/queries';
import { InvoicesClient } from './InvoicesClient';

export default async function InvoicesPage() {
    await requireAdmin();
    const invoices = await getInvoices();
    return <InvoicesClient initialInvoices={invoices} />;
}
