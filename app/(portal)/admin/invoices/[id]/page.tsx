import { requireAdmin } from '@/lib/auth';
import { getInvoiceWithItems } from '@/lib/invoices/queries';
import { InvoiceDetail } from './InvoiceDetail';
import { notFound } from 'next/navigation';

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function InvoiceDetailPage({ params }: PageProps) {
    await requireAdmin();
    const { id } = await params;
    const invoice = await getInvoiceWithItems(id);
    if (!invoice) notFound();
    return <InvoiceDetail initialInvoice={invoice} />;
}
